// engine.js
// 通信の評価エンジン（画面に依存しない）
//
// simulator.js は、この engine.js に「ステージ」と「キャンバスの中身（graph）」を渡して、
// 結果（突破されたか・どの要件が満たされなかったか）と、アニメーション用の流れを受け取る。
//
// 考え方:
//   ・Alice が出したメッセージは「バンドル（荷物）」として線の上を流れる。
//     バンドルは、メッセージ本文・暗号文・ハッシュ値・署名・証明書・鍵などの「アイテム」の集まり。
//   ・各コンポーネントは、バンドルを受け取って、新しいバンドルを出す（暗号化なら包む、復号なら開ける）。
//   ・通信路では、Eve が「盗んで読む」、Mallory が「書き換える・偽物を送る・再送する」。
//   ・Mallory の攻撃ごとにもう一度流して、Bob が受け入れてしまったか、見抜いて拒否したかを見る。
//
// 暗号の強さなどの数値は仮置き。ステージを作りながら調整する。

/* ==========================================================
   1. 定義
   ========================================================== */

export const DATA = 'data';
export const KEY = 'key';
export const PUB = 'pub';
export const PRIV = 'priv';

export const isKeyLike = (t) => t === KEY || t === PUB || t === PRIV;

// 線をつなげる組み合わせ。鍵はバンドルに入れて運べる（データの入口にもつなげる）。
// データから鍵を取り出すこともできる（鍵の入口にもつなげる）。
export const typesCompatible = (from, to) =>
  from === to || (isKeyLike(from) && to === DATA) || (from === DATA && isKeyLike(to));

// データの色
export const COLORS = {
  plain: '#ff8a1f',    // 元のデータ（暗号化されていない）
  garbled: '#8c93a8',  // 意味のないデータ（復号の失敗など）
  bad: '#e03131',      // 改ざんされた・偽造されたデータ
  key: '#a35cf0',      // 共通鍵
  pub: '#e0a500',      // 公開鍵
  priv: '#c2255c',     // 秘密鍵
  auth: '#0ca678',     // ハッシュ・MAC・署名・証明書だけのとき
  cipherFallback: '#8a63d2',
};

// 攻撃者の計算能力。数字が大きいほど強い。
export const COMPUTE = {
  observer: { level: 0, label: '観測するだけ' },
  bruteforce: { level: 1, label: '総当たりができる' },
  human: { level: 1, label: '総当たりができる' }, // 古い書き方との互換
  frequency: { level: 2, label: '頻度分析ができる' },
  cryptanalysis: { level: 3, label: '暗号機の構造を解析できる' },
  supercomputer: { level: 4, label: 'スーパーコンピュータを使える' },
};

// アルゴリズム。breakLevel 以上の計算能力を持つ攻撃者に破られる。
export const ALGORITHMS = {
  caesar: {
    label: 'シーザー暗号',
    short: 'Caesar',
    color: '#19b394',
    breakLevel: 1,
    weakness: 'ずらし幅が25通りしかないので、総当たりですぐに破られます。',
  },
  substitution: {
    label: '単一換字式暗号',
    short: '換字式',
    color: '#1ea5e6',
    breakLevel: 2,
    weakness: '文字の出現頻度（英語ならEやTが多い）から、頻度分析で解読されます。',
  },
  enigma: {
    label: 'エニグマ暗号',
    short: 'Enigma',
    color: '#d9a400',
    breakLevel: 3,
    weakness: '「同じ文字には変換されない」という構造の弱点を突かれ、解読機（ボム）で破られます。',
  },
  aes: {
    label: 'AES',
    short: 'AES',
    color: '#4c6fff',
    breakLevel: Infinity,
    weakness: '',
  },
  rsa512: {
    label: 'RSA（512ビット）',
    short: 'RSA-512',
    color: '#e64980',
    breakLevel: 4,
    weakness: '鍵が短い（512ビット）ので、強力な計算機で素因数分解されてしまいます。',
  },
  rsa2048: {
    label: 'RSA（2048ビット）',
    short: 'RSA-2048',
    color: '#e64980',
    breakLevel: Infinity,
    weakness: '',
  },
  tls: { label: 'TLS', short: 'TLS', color: '#2b8a3e', breakLevel: Infinity, weakness: '' },
  vpn: { label: 'VPN（IPsec）', short: 'VPN', color: '#0b7285', breakLevel: Infinity, weakness: '' },
};

// 共通鍵暗号（暗号化・復号の部品で選べるもの）
export const SYM_ALGORITHMS = ['caesar', 'substitution', 'enigma', 'aes'];

export const REQUIREMENTS = {
  confidentiality: { label: '機密性', desc: '盗聴者に内容を読まれない' },
  integrity: { label: '完全性', desc: '改ざんされたら気づく' },
  authenticity: { label: '真正性', desc: '偽者・偽の鍵を見抜く' },
  nonrepudiation: { label: '否認防止', desc: '「送っていない」と言い逃れできない' },
  freshness: { label: '新鮮さ', desc: '過去の通信の再送を受け付けない' },
  metadata: { label: '通信相手の秘匿', desc: '誰と何で通信しているかも見えない' },
};

// Mallory の攻撃
export const ATTACKS = {
  tamper: { label: '改ざん', desc: '通信の途中でデータを書き換える' },
  forge: { label: 'なりすまし', desc: '偽のメッセージを作って送る' },
  keyswap: { label: '公開鍵のすり替え', desc: '送られてくる公開鍵を自分のものに差し替える' },
  replay: { label: '再送（リプレイ）', desc: '過去の通信をそのまま送り直す' },
};

// コンポーネント定義
//   movable / removable / palette は simulator.js が使う
//   inputs[].multi : true なら、複数の線をつなげられる（つないだものは1つにまとまる）
const dataIn = (id, label) => ({ id, type: DATA, label, multi: true });

export const COMPONENTS = {
  alice: {
    label: 'Alice',
    avatar: 'A',
    removable: false,
    palette: false,
    inputs: [],
    outputs: [{ id: 'out', type: DATA, label: 'メッセージ' }],
  },
  bob: {
    label: 'Bob',
    avatar: 'B',
    removable: false,
    palette: false,
    inputs: [dataIn('in', 'メッセージ')],
    outputs: [],
  },
  channel: {
    label: '通信路',
    removable: false,
    palette: false,
    inputs: [dataIn('in', '')],
    outputs: [{ id: 'out', type: DATA, label: '' }],
  },

  // --- 鍵 ---
  key: {
    label: '共通鍵',
    desc: '二人だけが持つ同じ鍵',
    inputs: [],
    outputs: [{ id: 'out', type: KEY, label: '鍵' }],
  },
  keypair: {
    label: '鍵ペア',
    desc: '公開鍵と秘密鍵のセット',
    hasOwner: true,
    hasBits: true,
    inputs: [],
    outputs: [
      { id: 'pub', type: PUB, label: '公開鍵' },
      { id: 'priv', type: PRIV, label: '秘密鍵' },
    ],
  },

  // --- 暗号 ---
  encrypt: {
    label: '暗号化',
    desc: '読めない形にする',
    hasAlgorithm: true,
    inputs: [dataIn('data', 'データ'), { id: 'key', type: KEY, label: '鍵' }],
    outputs: [{ id: 'out', type: DATA, label: '暗号文' }],
  },
  decrypt: {
    label: '復号',
    desc: '元の形に戻す',
    hasAlgorithm: true,
    inputs: [dataIn('data', '暗号文'), { id: 'key', type: KEY, label: '鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  pkenc: {
    label: '公開鍵で暗号化',
    desc: '誰でも作れる・開けるのは持ち主だけ',
    inputs: [dataIn('data', 'データ'), { id: 'pub', type: PUB, label: '公開鍵' }],
    outputs: [{ id: 'out', type: DATA, label: '暗号文' }],
  },
  pkdec: {
    label: '秘密鍵で復号',
    desc: '持ち主だけが開けられる',
    inputs: [dataIn('data', '暗号文'), { id: 'priv', type: PRIV, label: '秘密鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },

  // --- 改ざん検知・認証 ---
  hash: {
    label: 'ハッシュを付ける',
    desc: 'データの「指紋」を添える',
    inputs: [dataIn('data', 'データ')],
    outputs: [{ id: 'out', type: DATA, label: 'データ＋指紋' }],
  },
  hashcheck: {
    label: 'ハッシュを照合',
    desc: '指紋が合うか確かめる',
    inputs: [dataIn('data', 'データ＋指紋')],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  mac: {
    label: 'MACを付ける',
    desc: '鍵つきの指紋を添える',
    inputs: [dataIn('data', 'データ'), { id: 'key', type: KEY, label: '鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ＋MAC' }],
  },
  maccheck: {
    label: 'MACを照合',
    desc: '同じ鍵で指紋を確かめる',
    inputs: [dataIn('data', 'データ＋MAC'), { id: 'key', type: KEY, label: '鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  sign: {
    label: '署名する',
    desc: '秘密鍵で「私が書いた」印を付ける',
    inputs: [dataIn('data', 'データ'), { id: 'priv', type: PRIV, label: '秘密鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ＋署名' }],
  },
  verify: {
    label: '署名を検証',
    desc: '公開鍵で署名を確かめる',
    inputs: [dataIn('data', 'データ＋署名'), { id: 'pub', type: PUB, label: '公開鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  ca: {
    label: '証明書を発行',
    desc: 'CAが「この公開鍵は本人のもの」と保証',
    inputs: [{ id: 'pub', type: PUB, label: '公開鍵' }],
    outputs: [{ id: 'out', type: DATA, label: '証明書' }],
  },
  certcheck: {
    label: '証明書を検証',
    desc: '端末にあるルートCAで確かめる',
    inputs: [dataIn('data', '証明書')],
    outputs: [{ id: 'pub', type: PUB, label: '公開鍵' }],
  },

  // --- 通信の保護 ---
  tls: {
    label: 'TLSで包む',
    desc: '通信全体を暗号化・認証する',
    inputs: [dataIn('data', 'データ')],
    outputs: [{ id: 'out', type: DATA, label: 'TLS通信' }],
  },
  tlsopen: {
    label: 'TLSをほどく',
    desc: '検証して中身を取り出す',
    inputs: [dataIn('data', 'TLS通信')],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  vpn: {
    label: 'VPNで包む',
    desc: 'パケットを丸ごと隠して送る',
    inputs: [dataIn('data', 'データ')],
    outputs: [{ id: 'out', type: DATA, label: 'VPN通信' }],
  },
  vpnopen: {
    label: 'VPNをほどく',
    desc: '検証して元のパケットに戻す',
    inputs: [dataIn('data', 'VPN通信')],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
};

// 鍵の発生源（直接つなぐと「事前に共有した」ことになる）
const isKeySource = (type) => type === 'key' || type === 'keypair';

/* ==========================================================
   2. ステージの設定を読むための関数
   ========================================================== */

export function objectiveKeys(stage) {
  return Object.keys(stage.objectives ?? {});
}

export function capsFor(stage, key) {
  const override = stage.objectives?.[key]?.attackerOverride ?? {};
  return { ...(stage.attacker?.capabilities ?? {}), ...override };
}

export function rulesFor(stage, key) {
  return { ...(stage.rules ?? {}), ...(stage.objectives?.[key]?.rules ?? {}) };
}

// その Objective で使える部品（Objective B では、次のステージの新しい部品が使えることがある）
export function availableComponents(stage, key) {
  const unlock = stage.objectives?.[key]?.unlock?.components ?? [];
  let list = [...(stage.components ?? []), ...unlock];
  const only = rulesFor(stage, key).onlyComponents;
  if (Array.isArray(only)) list = list.filter((t) => only.includes(t));
  return [...new Set(list)].filter((t) => COMPONENTS[t] && COMPONENTS[t].palette !== false);
}

export function availableAlgorithms(stage, key) {
  const unlock = stage.objectives?.[key]?.unlock?.algorithms ?? [];
  const list = [...(stage.algorithms ?? ['caesar']), ...unlock];
  return [...new Set(list)].filter((a) => SYM_ALGORITHMS.includes(a));
}

export function algorithmInfo(id) {
  return (
    ALGORITHMS[id] ?? {
      label: id ?? '不明',
      short: id ?? '?',
      color: COLORS.cipherFallback,
      breakLevel: Infinity,
      weakness: '',
    }
  );
}

export function computeInfo(id) {
  return COMPUTE[id] ?? COMPUTE.observer;
}

export function stageMessage(stage) {
  return stage?.message ?? 'HELLO';
}

function stageMeta(stage) {
  return { dest: stage?.meta?.dest ?? 'Bob', app: stage?.meta?.app ?? 'チャット' };
}

/* ==========================================================
   3. バンドル（荷物）とアイテム
   ========================================================== */
// バンドル = { items, meta, replayed, viaChannel, verified }
//   items    : アイテムの配列
//   meta     : 宛先・アプリなどの「見えてしまう情報」 { dest, app, outer? }
//   replayed : 過去の通信の再送か
//   viaChannel: 通信路を通ったか
//   verified : 検証に使われた方法 [{ kind: 'hash'|'mac'|'sig', signer? }]
//
// アイテム:
//   { t:'msg', text, v:'orig'|'tampered'|'forged', size }
//   { t:'enc', alg, key:{kind,id,owner?}, inner:[...], corrupt? }   暗号文
//   { t:'tls'|'vpn', inner:[...], corrupt?, innerMeta? }
//   { t:'hash', of } { t:'mac', keyId, of } { t:'sig', signer, of }
//   { t:'key', kind, id, owner?, bits? } { t:'cert', subject, pubId, owner, bits, signedByCA }
//   { t:'garbage' }  復号に失敗したときの意味のないデータ

const OPAQUE = ['enc', 'tls', 'vpn'];
const isBody = (it) => ['msg', 'enc', 'tls', 'vpn', 'garbage'].includes(it.t);

export const newBundle = (items, meta = null) => ({
  items,
  meta,
  replayed: false,
  viaChannel: false,
  verified: [],
});

function mergeBundles(list) {
  if (list.length === 1) return list[0];
  return {
    items: list.flatMap((b) => b.items),
    meta: list.find((b) => b.meta)?.meta ?? null,
    replayed: list.some((b) => b.replayed),
    viaChannel: list.every((b) => b.viaChannel),
    verified: list.flatMap((b) => b.verified),
  };
}

const keyItem = (k) => ({ t: 'key', kind: k.kind, id: k.id, owner: k.owner, bits: k.bits });

// 値（バンドルまたは鍵）→ バンドル
function toBundle(v) {
  if (!v) return null;
  if (v.items) return v;
  if (v.kind) return newBundle([keyItem(v)]);
  return null;
}

// 値（バンドルまたは鍵）→ 指定した種類の鍵
function toKey(v, type) {
  if (!v) return null;
  if (v.kind) return v.kind === type ? v : null;
  if (v.items) {
    const it = v.items.find((x) => x.t === 'key' && x.kind === type);
    return it ? { kind: it.kind, id: it.id, owner: it.owner, bits: it.bits } : null;
  }
  return null;
}

// 指紋計算の対象（ハッシュ・MAC・署名が守るのは「本体」）
function tok(it) {
  switch (it.t) {
    case 'msg':
      return `msg(${it.v}:${it.text})`;
    case 'enc':
      return `enc(${it.alg}:${it.key.kind}:${it.key.id}${it.corrupt ? ':X' : ''})[${it.inner.map(tok).join(',')}]`;
    case 'tls':
    case 'vpn':
      return `${it.t}${it.corrupt ? 'X' : ''}[${it.inner.map(tok).join(',')}]`;
    case 'garbage':
      return 'garbage';
    case 'hash':
      return `hash(${it.of})`;
    case 'mac':
      return `mac(${it.keyId}:${it.of})`;
    case 'sig':
      return `sig(${it.signer}:${it.of})`;
    case 'key':
      return `key(${it.kind}:${it.id})`;
    case 'cert':
      return `cert(${it.subject}:${it.pubId}:${it.signedByCA})`;
    default:
      return it.t;
  }
}
const fingerprint = (items) => items.filter(isBody).map(tok).join('|');

function shortHash(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 4);
}

/* ==========================================================
   4. 見た目用: 暗号文の表示・バンドルの色
   ========================================================== */

function caesarShift(text, shift) {
  return text.replace(/[A-Za-z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
  });
}

// 暗号文の見た目をそれらしく作る（本物の暗号ではなく、表示用）
export function mockEncrypt(alg, text, keyId) {
  if (alg === 'caesar') return caesarShift(text, 3);
  if (alg === 'substitution') {
    const table = 'QWERTYUIOPASDFGHJKLZXCVBNM';
    return text.replace(/[A-Za-z]/g, (c) => {
      const t = table[c.toUpperCase().charCodeAt(0) - 65];
      return c === c.toUpperCase() ? t : t.toLowerCase();
    });
  }
  let seed = 2166136261;
  for (const ch of `${alg}|${keyId}|${text}`) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const bytes = [];
  for (let i = 0; i < 5; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    bytes.push((seed >>> 24).toString(16).padStart(2, '0'));
  }
  return `${bytes.join(' ')}…`;
}

function itemText(it) {
  switch (it.t) {
    case 'msg':
      return it.text;
    case 'enc': {
      if (it.corrupt) return '▒▒▒▒▒';
      const only = it.inner.length === 1 ? it.inner[0] : null;
      if (only && only.t === 'msg' && it.key.kind === 'key') return mockEncrypt(it.alg, only.text, it.key.id);
      return `${algorithmInfo(it.alg).short}暗号文`;
    }
    case 'tls':
      return 'TLS通信';
    case 'vpn':
      return 'VPN通信';
    case 'hash':
      return `ハッシュ#${shortHash(it.of)}`;
    case 'mac':
      return 'MAC';
    case 'sig':
      return '署名';
    case 'cert':
      return '証明書';
    case 'key':
      return it.kind === 'pub' ? '公開鍵' : it.kind === 'priv' ? '秘密鍵' : '共通鍵';
    case 'garbage':
      return '▒▒▒▒▒';
    default:
      return it.t;
  }
}

export function bundleText(b) {
  if (!b) return '—';
  const parts = b.items.map(itemText);
  return parts.length ? parts.join(' + ') : '（空）';
}

export function bundleColor(b) {
  if (!b) return COLORS.garbled;
  const items = b.items;
  const wrap = items.find((it) => OPAQUE.includes(it.t));
  if (wrap) {
    if (wrap.corrupt) return COLORS.bad;
    return algorithmInfo(wrap.t === 'enc' ? wrap.alg : wrap.t).color;
  }
  const msg = items.find((it) => it.t === 'msg');
  if (msg) return msg.v === 'orig' ? COLORS.plain : COLORS.bad;
  if (items.some((it) => it.t === 'garbage')) return COLORS.garbled;
  const k = items.find((it) => it.t === 'key');
  if (k) return COLORS[k.kind] ?? COLORS.key;
  return COLORS.auth;
}

// 線の上を流れる値（バンドルまたは鍵）の色
export function valueColor(v) {
  if (!v) return COLORS.garbled;
  if (v.kind) return COLORS[v.kind] ?? COLORS.key;
  return bundleColor(v);
}

export function valueText(v) {
  if (!v) return '—';
  if (v.kind) {
    const who = v.owner ? `（${v.owner === 'alice' ? 'Alice' : v.owner === 'bob' ? 'Bob' : 'Mallory'}）` : '';
    return `${v.kind === 'pub' ? '公開鍵' : v.kind === 'priv' ? '秘密鍵' : '共通鍵'}${who}`;
  }
  return bundleText(v);
}

/* ==========================================================
   5. Mallory の攻撃
   ========================================================== */

const tamperText = (t) => (t.length > 1 ? `${t.slice(0, -1)}X` : 'X');
const FORGED_TEXT = 'EVIL';

function attackTamper(b) {
  const items = b.items.map((x) => ({ ...x }));
  const i = items.findIndex((x) => x.t === 'msg');
  if (i >= 0) {
    items[i] = { ...items[i], v: 'tampered', text: tamperText(items[i].text) };
    return { ...b, items };
  }
  // 中身が読めないときは、暗号文そのものを壊す（ビットを書き換える）
  const j = items.findIndex((x) => OPAQUE.includes(x.t));
  if (j >= 0) items[j] = { ...items[j], corrupt: true };
  return { ...b, items };
}

// 公開鍵で包まれた共通鍵（誰でも包み直せる）を、Mallory の鍵に差し替える対応表を作る
function collectRewrap(items, map) {
  items.forEach((it) => {
    if (it.t === 'enc' && it.key.kind === 'pub') {
      it.inner.forEach((x) => {
        if (x.t === 'key' && x.kind === 'key') {
          map.set(x.id, { t: 'key', kind: 'key', id: `m-${x.id}`, owner: 'mallory' });
        }
      });
    }
    if (it.inner) collectRewrap(it.inner, map);
  });
}

function forgeBody(it, rewrap, swap) {
  switch (it.t) {
    case 'msg':
      return { ...it, v: 'forged', text: FORGED_TEXT };
    case 'enc':
      if (it.key.kind === 'pub') {
        // 公開鍵は誰でも使える。包まれている鍵を自分のものに差し替えて作り直す。
        return { ...it, inner: it.inner.map((x) => (x.t === 'key' && rewrap.has(x.id) ? rewrap.get(x.id) : x)) };
      }
      if (rewrap.has(it.key.id)) {
        const nk = rewrap.get(it.key.id);
        return { ...it, key: { kind: 'key', id: nk.id }, inner: forgeItems(it.inner, rewrap, swap) };
      }
      return { ...it, corrupt: true }; // 鍵を知らないので、でたらめな暗号文になる
    case 'tls':
    case 'vpn':
      return { ...it, corrupt: true }; // セッション鍵を知らないので偽造できない
    default:
      return it;
  }
}

function forgeItems(items, rewrap, swap) {
  const body = items.filter(isBody).map((it) => forgeBody(it, rewrap, swap));
  const out = [...body];
  items
    .filter((x) => !isBody(x))
    .forEach((x) => {
      if (x.t === 'hash') {
        out.push({ t: 'hash', of: fingerprint(body) }); // ハッシュは誰でも計算できる
      } else if (x.t === 'sig') {
        out.push({ t: 'sig', signer: 'mallory', of: fingerprint(body) }); // 自分の秘密鍵で署名する
      } else if (x.t === 'key' && swap && x.kind === 'pub') {
        out.push({ t: 'key', kind: 'pub', id: 'mallory', owner: 'mallory', bits: x.bits });
      } else if (x.t === 'cert' && swap) {
        // CA の署名は作れないので、署名なしの偽の証明書になる
        out.push({ t: 'cert', subject: 'alice', pubId: 'mallory', owner: 'mallory', bits: x.bits, signedByCA: false });
      } else {
        out.push(x); // MAC は鍵がないので作れず、古いまま。証明書や鍵はコピーできる。
      }
    });
  return out;
}

function attackForge(b, swap) {
  const rewrap = new Map();
  collectRewrap(b.items, rewrap);
  return { ...b, items: forgeItems(b.items, rewrap, swap), replayed: false };
}

export function applyAttack(name, b) {
  if (!b) return b;
  switch (name) {
    case 'tamper':
      return attackTamper(b);
    case 'forge':
      return attackForge(b, false);
    case 'keyswap':
      return attackForge(b, true);
    case 'replay':
      return { ...b, replayed: true };
    default:
      return b;
  }
}

/* ==========================================================
   6. 流れの計算（Alice → … → Bob）
   ========================================================== */

// flow = {
//   info       : Map(nodeId → { status: 'ok'|'blocked'|'reject'|'starved', note })
//   edgeValues : Map(edgeId → 値)
//   channelIn / channelOut : 通信路に入ったバンドル / 出たバンドル
//   bob        : { status, msg, replayed, verified, viaChannel }
//   rejects    : [{ node, note }]   見抜いて拒否した部品
// }
export function runFlow(stage, graph, rules = {}, attack = null) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const memo = new Map();
  const visiting = new Set();
  const flow = {
    info: new Map(),
    edgeValues: new Map(),
    channelIn: null,
    channelOut: null,
    bob: { status: 'none', msg: null, replayed: false, verified: [], viaChannel: false },
    rejects: [],
    attack,
  };

  const inEdges = (id, port) => graph.edges.filter((e) => e.to.node === id && e.to.port === port);

  function outputs(id) {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return {}; // 配線がぐるぐる回っている
    visiting.add(id);
    const out = execNode(nodes.get(id));
    visiting.delete(id);
    memo.set(id, out);
    return out;
  }

  function edgeValue(e) {
    const v = outputs(e.from.node)[e.from.port] ?? null;
    flow.edgeValues.set(e.id, v);
    return v;
  }

  function execNode(node) {
    const def = COMPONENTS[node.type];
    const set = (status, note = '', out = {}) => {
      flow.info.set(node.id, { status, note });
      if (status === 'reject') flow.rejects.push({ node: node.id, note });
      return out;
    };

    // 入力を集める
    const ins = {};
    const unconnected = [];
    let starved = false;
    def.inputs.forEach((p) => {
      const edges = inEdges(node.id, p.id);
      if (edges.length === 0) {
        unconnected.push(p);
        ins[p.id] = null;
        return;
      }
      if (p.type === DATA) {
        const vals = edges.map((e) => toBundle(edgeValue(e))).filter(Boolean);
        ins[p.id] = vals.length ? mergeBundles(vals) : null;
      } else {
        ins[p.id] = toKey(edgeValue(edges[0]), p.type);
      }
      if (ins[p.id] === null) starved = true;
    });

    if (unconnected.length > 0) {
      const names = unconnected.map((p) => p.label || '入口').join('・');
      return set('blocked', `「${def.label}」の${names}がつながっていません。`);
    }
    if (starved) return set('starved');

    const msgSize = rules.largeBody ? 'large' : 'small';

    switch (node.type) {
      case 'alice': {
        const msg = { t: 'msg', text: stageMessage(stage), v: 'orig', size: msgSize };
        return set('ok', '', { out: newBundle([msg], stageMeta(stage)) });
      }

      case 'channel': {
        const b = ins.in;
        flow.channelIn = b;
        const after = attack ? applyAttack(attack, b) : b;
        const out = { ...after, viaChannel: true };
        flow.channelOut = out;
        return set('ok', '', { out });
      }

      case 'bob': {
        const b = ins.in;
        const msg = b.items.find((x) => x.t === 'msg');
        const garbled = !msg && b.items.some((x) => x.t === 'garbage');
        flow.bob = {
          status: msg || garbled ? 'accepted' : 'unreadable',
          msg: msg ?? (garbled ? { t: 'msg', text: '▒▒▒▒▒', v: 'garbled' } : null),
          replayed: b.replayed,
          verified: b.verified,
          viaChannel: b.viaChannel,
          bundle: b,
        };
        return set('ok');
      }

      case 'key':
        return set('ok', '', { out: { kind: 'key', id: node.id } });

      case 'keypair': {
        const owner = node.params.owner ?? 'bob';
        const bits = node.params.bits ?? 2048;
        return set('ok', '', {
          pub: { kind: 'pub', id: node.id, owner, bits },
          priv: { kind: 'priv', id: node.id, owner, bits },
        });
      }

      case 'encrypt': {
        const alg = node.params.algorithm ?? 'caesar';
        const b = ins.data;
        const enc = { t: 'enc', alg, key: { kind: 'key', id: ins.key.id }, inner: b.items };
        return set('ok', '', { out: { ...b, items: [enc] } });
      }

      case 'decrypt': {
        const alg = node.params.algorithm ?? 'caesar';
        const b = ins.data;
        const enc = b.items.find(
          (x) => x.t === 'enc' && x.alg === alg && x.key.kind === 'key' && x.key.id === ins.key.id
        );
        const items = enc && !enc.corrupt ? enc.inner : [{ t: 'garbage' }];
        return set('ok', '', { out: { ...b, items } });
      }

      case 'pkenc': {
        const b = ins.data;
        if (b.items.some((x) => x.t === 'msg' && x.size === 'large')) {
          return set(
            'blocked',
            '本文が大きすぎて、公開鍵暗号では直接暗号化できません（計算が重すぎます）。共通鍵暗号と組み合わせましょう。'
          );
        }
        const pub = ins.pub;
        const enc = {
          t: 'enc',
          alg: `rsa${pub.bits ?? 2048}`,
          key: { kind: 'pub', id: pub.id, owner: pub.owner },
          inner: b.items,
        };
        return set('ok', '', { out: { ...b, items: [enc] } });
      }

      case 'pkdec': {
        const b = ins.data;
        const enc = b.items.find((x) => x.t === 'enc' && x.key.kind === 'pub' && x.key.id === ins.priv.id);
        const items = enc && !enc.corrupt ? enc.inner : [{ t: 'garbage' }];
        return set('ok', '', { out: { ...b, items } });
      }

      case 'hash': {
        const b = ins.data;
        return set('ok', '', { out: { ...b, items: [...b.items, { t: 'hash', of: fingerprint(b.items) }] } });
      }

      case 'hashcheck': {
        const b = ins.data;
        const h = b.items.find((x) => x.t === 'hash');
        if (!h) return set('reject', 'ハッシュが付いていません。');
        if (h.of !== fingerprint(b.items)) {
          return set('reject', 'ハッシュが一致しません。途中で書き換えられたと判断しました。');
        }
        return set('ok', '', {
          out: { ...b, items: b.items.filter((x) => x !== h), verified: [...b.verified, { kind: 'hash' }] },
        });
      }

      case 'mac': {
        const b = ins.data;
        const item = { t: 'mac', keyId: ins.key.id, of: fingerprint(b.items) };
        return set('ok', '', { out: { ...b, items: [...b.items, item] } });
      }

      case 'maccheck': {
        const b = ins.data;
        const m = b.items.find((x) => x.t === 'mac');
        if (!m) return set('reject', 'MACが付いていません。');
        if (m.keyId !== ins.key.id || m.of !== fingerprint(b.items)) {
          return set('reject', 'MACが一致しません。共通鍵を知らない者が作ったか、書き換えられたと判断しました。');
        }
        return set('ok', '', {
          out: { ...b, items: b.items.filter((x) => x !== m), verified: [...b.verified, { kind: 'mac' }] },
        });
      }

      case 'sign': {
        const b = ins.data;
        const item = { t: 'sig', signer: ins.priv.owner ?? 'alice', of: fingerprint(b.items) };
        return set('ok', '', { out: { ...b, items: [...b.items, item] } });
      }

      case 'verify': {
        const b = ins.data;
        const s = b.items.find((x) => x.t === 'sig');
        if (!s) return set('reject', '署名が付いていません。');
        if (s.signer !== ins.pub.owner || s.of !== fingerprint(b.items)) {
          return set('reject', '署名が正しくありません。書き換えられたか、別の人が署名したと判断しました。');
        }
        return set('ok', '', {
          out: {
            ...b,
            items: b.items.filter((x) => x !== s),
            verified: [...b.verified, { kind: 'sig', signer: ins.pub.owner }],
          },
        });
      }

      case 'ca': {
        const pub = ins.pub;
        const cert = { t: 'cert', subject: pub.owner, pubId: pub.id, owner: pub.owner, bits: pub.bits, signedByCA: true };
        return set('ok', '', { out: newBundle([cert]) });
      }

      case 'certcheck': {
        const b = ins.data;
        const c = b.items.find((x) => x.t === 'cert');
        if (!c) return set('reject', '証明書が付いていません。');
        if (!c.signedByCA) return set('reject', '証明書にCAの署名がありません。偽の証明書だと判断しました。');
        if (c.subject !== 'alice') return set('reject', '証明書の持ち主が Alice ではありません。');
        return set('ok', '', { pub: { kind: 'pub', id: c.pubId, owner: c.owner, bits: c.bits } });
      }

      case 'tls': {
        const b = ins.data;
        return set('ok', '', { out: { ...b, items: [{ t: 'tls', inner: b.items }] } });
      }

      case 'tlsopen': {
        const b = ins.data;
        const t = b.items.find((x) => x.t === 'tls');
        if (!t) return set('reject', 'TLSで包まれていません。');
        if (t.corrupt) return set('reject', 'TLSの検証に失敗しました。書き換えや偽造を検知しました。');
        if (b.replayed) return set('reject', '通信の順番が古いので、再送された通信だと判断しました。');
        return set('ok', '', { out: { ...b, items: t.inner } });
      }

      case 'vpn': {
        const b = ins.data;
        const outer = { dest: 'VPNサーバー', app: 'IPsec', outer: true };
        return set('ok', '', { out: { ...b, items: [{ t: 'vpn', inner: b.items, innerMeta: b.meta }], meta: outer } });
      }

      case 'vpnopen': {
        const b = ins.data;
        const v = b.items.find((x) => x.t === 'vpn');
        if (!v) return set('reject', 'VPNで包まれていません。');
        if (v.corrupt) return set('reject', 'VPNトンネルの境界で、不正なパケットを破棄しました。');
        if (b.replayed) return set('reject', '通信の順番が古いので、再送されたパケットを破棄しました。');
        return set('ok', '', { out: { ...b, items: v.inner, meta: v.innerMeta ?? null } });
      }

      default:
        return set('ok');
    }
  }

  // すべての部品と線の値を計算しておく（アニメーション用）
  graph.nodes.forEach((n) => outputs(n.id));
  graph.edges.forEach((e) => edgeValue(e));
  flow.outputs = memo; // 部品ごとの出力（アニメーション用）
  return flow;
}

/* ==========================================================
   7. 構成のチェック（つながり・ルール）
   ========================================================== */

// 通信路より後ろ（Bob 側）にある部品か
function makeAfterChannel(graph) {
  const memo = new Map();
  const visit = (id, seen) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return false;
    seen.add(id);
    let after = false;
    for (const e of graph.edges.filter((x) => x.to.node === id)) {
      const from = e.from.node;
      if (from === 'channel' || visit(from, seen)) {
        after = true;
        break;
      }
    }
    memo.set(id, after);
    return after;
  };
  return (id) => visit(id, new Set());
}

// Alice から見て下流、または Bob から見て上流にある部品（つながりのチェック対象）
function relevantNodes(graph) {
  const rel = new Set();
  const walk = (start, next) => {
    const stack = [start];
    while (stack.length) {
      const id = stack.pop();
      if (rel.has(id)) continue;
      rel.add(id);
      graph.edges.forEach((e) => {
        const n = next(e, id);
        if (n) stack.push(n);
      });
    }
  };
  walk('alice', (e, id) => (e.from.node === id ? e.to.node : null));
  walk('bob', (e, id) => (e.to.node === id ? e.from.node : null));
  return rel;
}

export function checkRules(stage, graph, rules) {
  const problems = [];
  const label = (id) => COMPONENTS[graph.nodes.find((n) => n.id === id).type].label;

  // 使えない部品が置かれていないか
  const only = rules.onlyComponents;
  graph.nodes.forEach((n) => {
    const def = COMPONENTS[n.type];
    if (def.removable === false) return;
    if (Array.isArray(only) && !only.includes(n.type)) {
      problems.push(`「${def.label}」は、このクリア条件では使えません。`);
    }
  });

  // 鍵の事前共有・秘密鍵の持ち主
  const after = makeAfterChannel(graph);
  graph.edges.forEach((e) => {
    const from = graph.nodes.find((n) => n.id === e.from.node);
    const to = graph.nodes.find((n) => n.id === e.to.node);
    if (!from || !to || !isKeySource(from.type)) return;
    const toAfter = after(to.id);

    if (e.type === PRIV) {
      const ownerAfter = (from.params.owner ?? 'bob') === 'bob';
      if (toAfter !== ownerAfter) {
        problems.push(
          `秘密鍵は持ち主だけが使うものです。${(from.params.owner ?? 'bob') === 'bob' ? 'Bob' : 'Alice'}の秘密鍵を、「${label(to.id)}」には渡せません。`
        );
      }
    } else if ((rules.noPreshare ?? []).includes(e.type) && toAfter) {
      problems.push(
        e.type === KEY
          ? '共通鍵は事前に共有できません。通信路を通して Bob に渡す方法を考えましょう。'
          : 'Alice の公開鍵は、事前には受け取れません。通信路を通して Bob に届けましょう。'
      );
    }
  });

  return [...new Set(problems)];
}

export function wiringProblems(graph, flow) {
  const problems = [];
  if (!graph.edges.some((e) => e.from.node === 'alice')) {
    problems.push('Alice から出ている線がありません。Alice の出口から線を引きましょう。');
  }
  const rel = relevantNodes(graph);
  flow.info.forEach(({ status, note }, id) => {
    if (status === 'blocked' && rel.has(id)) problems.push(note);
  });
  if (problems.length === 0) {
    if (!flow.channelIn) {
      problems.push('通信が「通信路」を通っていません。Alice から Bob へ送る道の途中に通信路を入れましょう。');
    } else if (flow.bob.status === 'none') {
      problems.push('メッセージが Bob に届いていません。Bob の入口まで線をつなぎましょう。');
    } else if (!flow.bob.viaChannel) {
      problems.push('通信路を通らずに Bob へ届く線があります。Alice と Bob の通信は、通信路を通ります。');
    }
  }
  return [...new Set(problems)];
}

/* ==========================================================
   8. Eve（盗聴）の分析
   ========================================================== */

export function canCapture(caps) {
  return (caps.observationScope ?? 'channel') === 'channel' && (caps.observedMessages ?? 1) > 0;
}

const algOf = (it) => (it.t === 'enc' ? it.alg : it.t);

// 通信路で盗んだバンドルについて、Eve が何を読めるか
export function analyzeExposure(bundle, caps) {
  const level = computeInfo(caps.compute).level;
  const res = {
    captured: canCapture(caps),
    msgRead: false,
    how: null, // 'plain' | 'cracked' | 'keyleak'
    crackedAlgs: [],
    blocker: null,
    metaReveals: false,
    meta: bundle?.meta ?? null,
    notCapturedReason: '',
  };

  if (!res.captured) {
    res.notCapturedReason =
      (caps.observationScope ?? 'channel') !== 'channel'
        ? `Eve は通信路を観測できません（観測範囲: ${caps.observationScope}）。`
        : 'Eve が見られる通信は 0 通です。';
    return res;
  }
  if (!bundle) return res;

  res.metaReveals = Boolean(bundle.meta && !bundle.meta.outer && caps.seesMetadata !== false);

  // 開けられるものを、増えなくなるまで繰り返し開けていく
  const opened = new Map(); // アイテム → 開けるのに破った方式の一覧
  const known = new Map(); // 'key:ID' / 'priv:ID' → 入手に使った方式の一覧
  let msgChain = null;
  let topLevelMsg = false;
  let changed = true;

  while (changed) {
    changed = false;
    msgChain = null;
    topLevelMsg = false;

    const walk = (items, chain, top) => {
      items.forEach((it) => {
        if (it.t === 'msg') {
          if (msgChain === null || chain.length < msgChain.length) msgChain = chain;
          if (top) topLevelMsg = true;
        }
        if (it.t === 'key' && (it.kind === 'key' || it.kind === 'priv')) {
          const k = `${it.kind}:${it.id}`;
          if (!known.has(k)) {
            known.set(k, chain);
            changed = true;
          }
        }
        if (OPAQUE.includes(it.t)) {
          if (!opened.has(it)) {
            let how = null;
            if (algorithmInfo(algOf(it)).breakLevel <= level) {
              how = [...chain, algOf(it)];
            } else if (it.t === 'enc') {
              const k = `${it.key.kind === 'pub' ? 'priv' : 'key'}:${it.key.id}`;
              if (known.has(k)) how = [...new Set([...chain, ...known.get(k)])];
            }
            if (how) {
              opened.set(it, how);
              changed = true;
            }
          }
          if (opened.has(it)) walk(it.inner, opened.get(it), false);
        }
      });
    };
    walk(bundle.items, [], true);
  }

  if (msgChain !== null) {
    res.msgRead = true;
    res.crackedAlgs = msgChain;
    res.how = topLevelMsg ? 'plain' : msgChain.length > 0 ? 'cracked' : 'keyleak';
  } else {
    const containsMsg = (it) => it.t === 'msg' || (it.inner ?? []).some(containsMsg);
    const findBlocker = (items) => {
      for (const it of items) {
        if (!OPAQUE.includes(it.t)) continue;
        if (opened.has(it)) {
          const b = findBlocker(it.inner);
          if (b) return b;
        } else if (containsMsg(it)) {
          return it;
        }
      }
      return null;
    };
    res.blocker = findBlocker(bundle.items);
  }
  return res;
}

/* ==========================================================
   9. 評価
   ========================================================== */

function classify(flow) {
  const b = flow.bob;
  if (b.msg) {
    const bad = b.msg.v !== 'orig' || b.replayed;
    return bad ? 'bad' : 'ok'; // bad: 受け入れてしまった / ok: 影響なし
  }
  return flow.rejects.length > 0 ? 'rejected' : 'lost';
}

function acceptedWhat(flow) {
  const m = flow.bob.msg;
  if (flow.bob.replayed && m?.v === 'orig') return '古い通信（再送されたもの）';
  if (m?.v === 'tampered') return '書き換えられた本文';
  if (m?.v === 'forged') return 'Mallory が作った偽の本文';
  if (m?.v === 'garbled') return '壊れた（意味のない）データ';
  return 'おかしなデータ';
}

function nodeTypesIn(graph) {
  return new Set(graph.nodes.map((n) => n.type));
}

function hintFor(name, graph) {
  const t = nodeTypesIn(graph);
  const hasCheck = ['hashcheck', 'maccheck', 'verify', 'tlsopen', 'vpnopen', 'certcheck'].some((x) => t.has(x));
  if (name === 'replay') return '同じ通信をもう一度送られても、Bob は古いものと区別できません。';
  if (!hasCheck) return '届いたものを検証する部品（ハッシュ・MAC・署名など）が、Bob の側にありません。暗号化だけでは、書き換えには気づけません。';
  if (name === 'forge' && t.has('hashcheck') && !t.has('maccheck') && !t.has('verify')) {
    return 'ハッシュは誰でも計算できるので、Mallory は偽メッセージのハッシュも作り直せます。鍵を知っている人にしか作れない印が必要です。';
  }
  if (name === 'keyswap') {
    return '届いた公開鍵が本当に Alice のものか、確かめる手段がありません。信頼できる第三者（CA）の証明書が必要です。';
  }
  return '検証がうまく働いていません。どの部品で、何を確かめているか見直しましょう。';
}

export function describeAttack(a, graph) {
  const label = ATTACKS[a.name].label;
  if (a.outcome === 'bad') {
    return `Mallory の「${label}」に気づけず、Bob は${acceptedWhat(a.flow)}を受け入れてしまいました。${hintFor(a.name, graph)}`;
  }
  if (a.outcome === 'rejected') {
    const r = a.flow.rejects[0];
    const node = graph.nodes.find((n) => n.id === r.node);
    return `Mallory の「${label}」は、「${COMPONENTS[node.type].label}」で見抜かれ、Bob は拒否しました。`;
  }
  if (a.outcome === 'ok') return `Mallory の「${label}」は、結果に影響しませんでした。`;
  return `Mallory の「${label}」は Bob に届かず、受け入れられませんでした。`;
}

function attackCheck(req, names, result, graph) {
  const info = REQUIREMENTS[req];
  const rel = result.attacks.filter((a) => names.includes(a.name));
  if (rel.length === 0) {
    return { key: req, label: info.label, met: true, reason: 'このクリア条件には、関係する攻撃がありません。' };
  }
  const bad = rel.find((a) => a.outcome === 'bad');
  if (bad) return { key: req, label: info.label, met: false, reason: describeAttack(bad, graph) };
  return { key: req, label: info.label, met: true, reason: rel.map((a) => describeAttack(a, graph)).join(' ') };
}

function confidentialityCheck(x, caps) {
  const label = REQUIREMENTS.confidentiality.label;
  const attacker = computeInfo(caps.compute);
  if (!x.captured) {
    return { key: 'confidentiality', label, met: true, reason: `攻撃者はデータを盗めていません。${x.notCapturedReason}` };
  }
  if (x.msgRead) {
    if (x.how === 'plain') {
      return {
        key: 'confidentiality',
        label,
        met: false,
        reason: 'メッセージが暗号化されないまま通信路に出たため、盗まれてそのまま読まれました。',
      };
    }
    if (x.how === 'keyleak') {
      return {
        key: 'confidentiality',
        label,
        met: false,
        reason: '暗号を開ける鍵が、通信路を暗号化されずに流れていました。盗まれた鍵で、本文を開けられてしまいました。',
      };
    }
    const weakest = x.crackedAlgs.map(algorithmInfo).sort((a, b) => a.breakLevel - b.breakLevel).pop();
    return {
      key: 'confidentiality',
      label,
      met: false,
      reason: `攻撃者（${attacker.label}）に「${weakest.label}」を解読され、本文を読まれました。${weakest.weakness}`,
    };
  }
  if (x.blocker) {
    const name = algorithmInfo(algOf(x.blocker)).label;
    return {
      key: 'confidentiality',
      label,
      met: true,
      reason: `攻撃者は暗号文を盗めましたが、「${name}」を破れませんでした（攻撃者: ${attacker.label}）。`,
    };
  }
  return { key: 'confidentiality', label, met: true, reason: '攻撃者が盗めたのは、読めるメッセージを含まないデータだけでした。' };
}

function metadataCheck(x) {
  const label = REQUIREMENTS.metadata.label;
  if (!x.captured) return { key: 'metadata', label, met: true, reason: '攻撃者は通信を観測できません。' };
  if (x.metaReveals) {
    return {
      key: 'metadata',
      label,
      met: false,
      reason: `通信の宛先（${x.meta.dest}）やアプリ（${x.meta.app}）が、外から見えてしまいます。本文を暗号化しても、通信相手などは隠せません。`,
    };
  }
  return {
    key: 'metadata',
    label,
    met: true,
    reason: 'パケットを丸ごと包んだので、見えるのは VPN サーバーへの通信だけです。本当の宛先やアプリは分かりません。',
  };
}

function nonrepudiationCheck(honest) {
  const label = REQUIREMENTS.nonrepudiation.label;
  const v = honest.bob.verified ?? [];
  if (v.some((x) => x.kind === 'sig' && x.signer === 'alice')) {
    return {
      key: 'nonrepudiation',
      label,
      met: true,
      reason: 'Alice の署名を Bob が検証しています。Alice だけが作れる印なので、「送っていない」とは言えません。',
    };
  }
  if (v.some((x) => x.kind === 'mac')) {
    return {
      key: 'nonrepudiation',
      label,
      met: false,
      reason: 'MAC は共通鍵を持つ Alice と Bob のどちらにも作れるので、Alice が送った証拠になりません。',
    };
  }
  return {
    key: 'nonrepudiation',
    label,
    met: false,
    reason: 'Alice だけが作れる印（デジタル署名）が検証されていません。',
  };
}

function deliveryCheck(flow, graph) {
  const b = flow.bob;
  const ok = Boolean(b.msg) && b.msg.v === 'orig' && !b.replayed;
  let reason = 'Bob は元のメッセージを読めました。';
  if (!ok) {
    if (b.status === 'unreadable') reason = 'Bob に届いたメッセージが、まだ暗号化・包装されたままです。復号やほどく部品を足しましょう。';
    else if (b.msg?.v === 'garbled') reason = '復号が暗号化と対応していません。アルゴリズム・鍵・順番を確認しましょう。';
    else if (flow.rejects.length > 0) {
      const r = flow.rejects[0];
      const n = graph.nodes.find((x) => x.id === r.node);
      reason = `本物のメッセージなのに、「${COMPONENTS[n.type].label}」で拒否されてしまいました。${r.note}`;
    } else reason = 'Bob が元のメッセージを受け取れていません。';
  }
  return { key: 'delivery', label: 'Bob にメッセージが届く', met: ok, reason };
}

// 1つの Objective（攻撃者の強さ・ルール）で評価する
export function evaluateObjective(stage, graph, key) {
  const obj = stage.objectives[key];
  const caps = capsFor(stage, key);
  const rules = rulesFor(stage, key);

  const honest = runFlow(stage, graph, rules, null);
  const problems = [...checkRules(stage, graph, rules), ...wiringProblems(graph, honest)];
  const result = { key, caps, rules, honest, attacks: [], exposure: null, checks: [], problems, met: false, status: 'done' };

  if (problems.length > 0) {
    result.status = 'incomplete';
    return result;
  }

  (caps.attacks ?? []).forEach((name) => {
    const flow = runFlow(stage, graph, rules, name);
    result.attacks.push({ name, flow, outcome: classify(flow) });
  });
  result.attacks.forEach((a) => { a.text = describeAttack(a, graph); });

  const x = analyzeExposure(honest.channelIn, caps);
  result.exposure = x;

  const checks = [deliveryCheck(honest, graph)];
  (obj.require ?? []).forEach((req) => {
    switch (req) {
      case 'confidentiality':
        checks.push(confidentialityCheck(x, caps));
        break;
      case 'metadata':
        checks.push(metadataCheck(x));
        break;
      case 'integrity':
        checks.push(attackCheck('integrity', ['tamper', 'forge'], result, graph));
        break;
      case 'authenticity':
        checks.push(attackCheck('authenticity', ['forge', 'keyswap'], result, graph));
        break;
      case 'freshness':
        checks.push(attackCheck('freshness', ['replay'], result, graph));
        break;
      case 'nonrepudiation':
        checks.push(nonrepudiationCheck(honest));
        break;
      default:
        checks.push({ key: req, label: REQUIREMENTS[req]?.label ?? req, met: false, reason: 'この要件の判定は、まだ入っていません。' });
    }
  });
  result.checks = checks;
  result.met = checks.every((c) => c.met);
  return result;
}

// 余分な部品の数（クリア条件に関係なく置いたものも含む）
export function countExtras(stage, graph) {
  const minimal = stage.rating?.minimalComponents;
  if (!Array.isArray(minimal)) return 0;
  const need = {};
  minimal.forEach((t) => { need[t] = (need[t] ?? 0) + 1; });
  const have = {};
  graph.nodes.forEach((n) => {
    if (COMPONENTS[n.type].removable === false) return;
    have[n.type] = (have[n.type] ?? 0) + 1;
  });
  return Object.entries(have).reduce((sum, [type, count]) => sum + Math.max(0, count - (need[type] ?? 0)), 0);
}

//   最初の Objective を満たさない                      → C
//   最後の Objective まで満たせない（途中まで満たした）→ B
//   すべて満たす                                        → 余分なし S / 余分あり A
export function computeRating(objectives, extras) {
  const list = Object.values(objectives);
  if (!list[0]?.met) return 'C';
  if (!list.every((o) => o.met)) return 'B';
  return extras === 0 ? 'S' : 'A';
}

// Alice → Bob の道筋（表示用）
function describeRoute(graph) {
  const label = (id) => {
    const n = graph.nodes.find((x) => x.id === id);
    const base = COMPONENTS[n.type].label;
    return n.params.algorithm ? `${base}（${algorithmInfo(n.params.algorithm).short}）` : base;
  };
  const prev = new Map([['alice', null]]);
  const queue = ['alice'];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === 'bob') break;
    graph.edges.forEach((e) => {
      if (e.type === DATA && e.from.node === cur && !prev.has(e.to.node)) {
        prev.set(e.to.node, cur);
        queue.push(e.to.node);
      }
    });
  }
  if (!prev.has('bob')) return [];
  const path = [];
  for (let id = 'bob'; id !== null; id = prev.get(id)) path.unshift(id);
  return path.map(label);
}

// すべての Objective をまとめて評価する
export function evaluateStage(stage, graph) {
  const objectives = {};
  objectiveKeys(stage).forEach((key) => {
    objectives[key] = evaluateObjective(stage, graph, key);
  });
  const extras = countExtras(stage, graph);
  const first = objectives[objectiveKeys(stage)[0]];
  return {
    objectives,
    extras,
    rating: computeRating(objectives, extras),
    cleared: Boolean(first?.met),
    flow: describeRoute(graph),
  };
}
