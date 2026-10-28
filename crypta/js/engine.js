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

// データの色（種類を絞って、かわりに文字でも状態を表示する）
//   平文 / 暗号文 / 鍵 / 確認用の印 / 改ざん・偽物 / 壊れたデータ
export const COLORS = {
  plain: '#ff8a1f',    // 平文（暗号化されていないデータ）
  cipher: '#4c6fff',   // 暗号文（どの暗号でも同じ色。種類は文字で表示する）
  key: '#a35cf0',      // 鍵（共通鍵・公開鍵・秘密鍵）
  proof: '#0ca678',    // 確認用の印（ハッシュ・MAC・署名・証明書）
  bad: '#e03131',      // 改ざんされた・偽造されたデータ
  garbled: '#8c93a8',  // 意味のないデータ（復号の失敗など）
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
    color: COLORS.cipher,
    breakLevel: 1,
    weakness: 'ずらし幅が25通りしかないので、総当たりですぐに破られます。',
  },
  substitution: {
    label: '単一換字式暗号',
    short: '換字式',
    color: COLORS.cipher,
    breakLevel: 2,
    weakness: '文字の出現頻度（英語ならEやTが多い）から、頻度分析で解読されます。',
  },
  enigma: {
    label: 'エニグマ暗号',
    short: 'Enigma',
    color: COLORS.cipher,
    breakLevel: 3,
    weakness: '「同じ文字には変換されない」という構造の弱点を突かれ、解読機（ボム）で破られます。',
  },
  aes: {
    label: 'AES',
    short: 'AES',
    color: COLORS.cipher,
    breakLevel: Infinity,
    weakness: '',
  },
  rsa512: {
    label: 'RSA（512ビット）',
    short: 'RSA-512',
    color: COLORS.cipher,
    breakLevel: 4,
    weakness: '鍵が短い（512ビット）ので、強力な計算機で素因数分解されてしまいます。',
  },
  rsa2048: {
    label: 'RSA（2048ビット）',
    short: 'RSA-2048',
    color: COLORS.cipher,
    breakLevel: Infinity,
    weakness: '',
  },
  sealed: {
    label: 'セット暗号（ハイブリッド）',
    short: 'セット暗号',
    color: COLORS.cipher,
    breakLevel: Infinity,
    weakness: '',
  },
  tls: { label: 'TLS', short: 'TLS', color: COLORS.cipher, breakLevel: Infinity, weakness: '' },
  vpn: { label: 'VPN（IPsec）', short: 'VPN', color: COLORS.cipher, breakLevel: Infinity, weakness: '' },
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
  // --- 鍵 ---
  key: {
    label: '共通鍵',
    desc: '暗号化・復号に使う鍵',
    howto: "出口を、暗号化・復号・MAC などの「鍵」の入口につなぎます。Bob のゾーンの部品につなぐと、その線は公開ゾーンを通るので、攻撃者に見つかる危険があります。",
    inputs: [],
    outputs: [{ id: 'out', type: KEY, label: '鍵' }],
  },
  handkey: {
    label: '手渡しの鍵',
    desc: '会って渡した鍵（2つ1組）',
    howto: "2つ1組です。1つは Alice のゾーンに、もう1つは Bob のゾーンに置かれます。同じ印（🤝の番号）の2つは、会って渡した、同じ鍵です。それぞれのゾーンの中で、暗号化・復号・MAC の「鍵」の入口につなぎます。線で、ゾーンをまたいで渡すと、公開ゾーンを通るので、盗まれます。会えない相手のときは、使えません。",
    inputs: [],
    outputs: [{ id: 'out', type: KEY, label: '鍵' }],
  },
  keypair: {
    label: '鍵ペア',
    desc: '公開鍵と秘密鍵のセット',
    howto: "「公開鍵」と「秘密鍵」の2つの出口があります。持ち主（Alice / Bob）を選べます。秘密鍵は、持ち主のところでしか使えません。",
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
    howto: "「データ」に流したい線、「鍵」に共通鍵をつなぎます。出口から暗号文が出ます。アルゴリズムは選べます。",
    hasAlgorithm: true,
    inputs: [dataIn('data', 'データ'), { id: 'key', type: KEY, label: '鍵' }],
    outputs: [{ id: 'out', type: DATA, label: '暗号文' }],
  },
  decrypt: {
    label: '復号',
    desc: '元の形に戻す',
    howto: "暗号化と同じアルゴリズム・同じ鍵をつなぎます。どちらかが違うと、意味のないデータになります。",
    hasAlgorithm: true,
    inputs: [dataIn('data', '暗号文'), { id: 'key', type: KEY, label: '鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  pkenc: {
    label: '公開鍵で暗号化',
    desc: '誰でも作れる・開けるのは持ち主だけ',
    howto: "「データ」に包みたいもの（共通鍵やメッセージ）、「公開鍵」に鍵ペアの公開鍵をつなぎます。包んだものは、ペアの秘密鍵でしか開けられません。",
    inputs: [dataIn('data', 'データ'), { id: 'pub', type: PUB, label: '公開鍵' }],
    outputs: [{ id: 'out', type: DATA, label: '暗号文' }],
  },
  pkdec: {
    label: '秘密鍵で復号',
    desc: '持ち主だけが開けられる',
    howto: "「暗号文」に通信路からの線、「秘密鍵」に鍵ペアの秘密鍵をつなぎます。出口は、鍵の入口（復号など）にもつなげます。",
    inputs: [dataIn('data', '暗号文'), { id: 'priv', type: PRIV, label: '秘密鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },

  // --- 改ざん検知・認証 ---
  hash: {
    label: 'ハッシュを付ける',
    desc: 'データの「指紋」を添える',
    howto: "データを通すと、データの「指紋（ハッシュ値）」が添えられて出てきます。",
    inputs: [dataIn('data', 'データ')],
    outputs: [{ id: 'out', type: DATA, label: 'データ＋指紋' }],
  },
  hashcheck: {
    label: 'ハッシュを照合',
    desc: '指紋が合うか確かめる',
    howto: "Bob の側に置きます。届いたデータの指紋を計算し直して、添えられた指紋と比べます。違うと拒否します。",
    inputs: [dataIn('data', 'データ＋指紋')],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  mac: {
    label: 'MACを付ける',
    desc: '鍵つきの指紋を添える',
    howto: "「データ」と「共通鍵」をつなぐと、鍵つきの指紋（MAC）が添えられて出てきます。",
    inputs: [dataIn('data', 'データ'), { id: 'key', type: KEY, label: '鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ＋MAC' }],
  },
  maccheck: {
    label: 'MACを照合',
    desc: '同じ鍵で指紋を確かめる',
    howto: "Bob の側に置きます。同じ共通鍵をつなぐと、MAC を計算し直して比べます。違うと拒否します。",
    inputs: [dataIn('data', 'データ＋MAC'), { id: 'key', type: KEY, label: '鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  sign: {
    label: '署名する',
    desc: '秘密鍵で「私が書いた」印を付ける',
    howto: "「データ」と、Alice の鍵ペアの「秘密鍵」をつなぎます。Alice の署名が添えられて出てきます。",
    inputs: [dataIn('data', 'データ'), { id: 'priv', type: PRIV, label: '秘密鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ＋署名' }],
  },
  verify: {
    label: '署名を検証',
    desc: '公開鍵で署名を確かめる',
    howto: "Bob の側に置きます。「公開鍵」に Alice の公開鍵をつなぐと、署名を確かめます。公開鍵は、通信路で届いたものも、証明書から取り出したものもつなげます。",
    inputs: [dataIn('data', 'データ＋署名'), { id: 'pub', type: PUB, label: '公開鍵' }],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  ca: {
    label: '証明書を発行',
    desc: 'CAが「この公開鍵は本人のもの」と保証',
    howto: "Alice の「公開鍵」をつなぐと、CA の署名つきの証明書が出ます。通信路に一緒に流します。",
    inputs: [{ id: 'pub', type: PUB, label: '公開鍵' }],
    outputs: [{ id: 'out', type: DATA, label: '証明書' }],
  },
  certcheck: {
    label: '証明書を検証',
    desc: '端末にあるルートCAで確かめる',
    howto: "通信路から届いた証明書を、端末にあるルート CA で確かめます。本物なら公開鍵を取り出せるので、その出口を「署名を検証」の公開鍵につなぎます。",
    inputs: [dataIn('data', '証明書')],
    outputs: [{ id: 'pub', type: PUB, label: '公開鍵' }],
  },

  // --- 通信の保護 ---
  tls: {
    label: 'TLSで包む',
    desc: '通信全体を暗号化・認証する',
    howto: "Alice の側に置いて、通信全体を TLS で包みます。暗号化・改ざん検知・再送防止がまとめて入っています。",
    inputs: [dataIn('data', 'データ')],
    outputs: [{ id: 'out', type: DATA, label: 'TLS通信' }],
  },
  tlsopen: {
    label: 'TLSをほどく',
    desc: '検証して中身を取り出す',
    howto: "Bob の側に置いて、TLS を検証してほどきます。書き換え・偽物・再送はここで拒否されます。",
    inputs: [dataIn('data', 'TLS通信')],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  vpn: {
    label: 'VPNで包む',
    desc: 'パケットを丸ごと隠して送る',
    howto: "Alice の側に置いて、パケットを丸ごと包みます。宛先やアプリの種類も一緒に隠れます。",
    inputs: [dataIn('data', 'データ')],
    outputs: [{ id: 'out', type: DATA, label: 'VPN通信' }],
  },
  vpnopen: {
    label: 'VPNをほどく',
    desc: '検証して元のパケットに戻す',
    howto: "Bob の側に置いて、VPN を検証してほどきます。不正なパケットはここで捨てられます。",
    inputs: [dataIn('data', 'VPN通信')],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },

  // --- セット部品・通し番号 ---
  sealed: {
    label: '安全な箱に入れる',
    desc: '暗号化と鍵の渡し方を、まとめたもの',
    howto: "Alice の側に置いて、データを入れます。暗号化と、鍵の安全な渡し方（公開鍵で包む）が、まとめて入っています。鍵の線は、要りません。",
    inputs: [dataIn('data', 'データ')],
    outputs: [{ id: 'out', type: DATA, label: '箱に入ったデータ' }],
  },
  unsealed: {
    label: '安全な箱から出す',
    desc: '箱を開けて、中身を取り出す',
    howto: "Bob の側に置いて、箱を開けます。書き換えられた箱は、開けても、意味のないデータになります。",
    inputs: [dataIn('data', '箱に入ったデータ')],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  seqstamp: {
    label: '通し番号を付ける',
    desc: '「何番目の通信か」を添える',
    howto: "データに、通し番号を添えます。通信ごとに、番号が増えていきます。",
    inputs: [dataIn('data', 'データ')],
    outputs: [{ id: 'out', type: DATA, label: 'データ＋番号' }],
  },
  seqcheck: {
    label: '通し番号を確かめる',
    desc: '古い番号の通信を、拒否する',
    howto: "Bob の側に置いて、これまでに受け取った番号を覚えておきます。すでに受け取った番号の通信（再送）は、拒否します。",
    inputs: [dataIn('data', 'データ＋番号')],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
};

// ゾーン: 画面は、Alice のゾーン・公開ゾーン・Bob のゾーンの3つに分かれている。
//   部品は、置いたゾーンに属する。ゾーンをまたぐ線と、公開ゾーンの中の線は、「公開されている線」。
//   公開されている線を流れるものは、攻撃者に見られる（鍵も）。公開ゾーンに置いた部品も、公開されている。
export const ZONES = ['alice', 'public', 'bob'];
export const DEFAULT_ZONE = {
  alice: 'alice', bob: 'bob',
  key: 'alice', handkey: 'alice', keypair: 'alice', encrypt: 'alice', sealed: 'alice', seqstamp: 'alice', pkenc: 'alice', hash: 'alice', mac: 'alice', sign: 'alice', ca: 'alice', tls: 'alice', vpn: 'alice',
  decrypt: 'bob', unsealed: 'bob', seqcheck: 'bob', pkdec: 'bob', hashcheck: 'bob', maccheck: 'bob', verify: 'bob', certcheck: 'bob', tlsopen: 'bob', vpnopen: 'bob',
};
export const zoneOf = (node) => node.zone ?? DEFAULT_ZONE[node.type] ?? 'alice';

export function isPublicEdge(graph, e) {
  const from = graph.nodes.find((n) => n.id === e.from.node);
  const to = graph.nodes.find((n) => n.id === e.to.node);
  if (!from || !to) return false;
  const a = zoneOf(from);
  const b = zoneOf(to);
  return a !== b || a === 'public';
}

// 鍵の発生源
const isKeySource = (type) => type === 'key' || type === 'handkey' || type === 'keypair';

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

// その目標で使える部品（解放される部品と、使えなくなる部品がある）
export function availableComponents(stage, key) {
  const obj = stage.objectives?.[key];
  const unlock = obj?.unlock?.components ?? [];
  const lock = new Set(obj?.lock?.components ?? []);
  let list = [...(stage.components ?? []), ...unlock].filter((t) => !lock.has(t));
  const only = rulesFor(stage, key).onlyComponents;
  if (Array.isArray(only)) list = list.filter((t) => only.includes(t));
  return [...new Set(list)].filter((t) => COMPONENTS[t] && COMPONENTS[t].palette !== false);
}
export function availableAlgorithms(stage, key) {
  const obj = stage.objectives?.[key];
  const lock = new Set(obj?.lock?.algorithms ?? []);
  const list = [...(stage.algorithms ?? ['caesar']), ...(obj?.unlock?.algorithms ?? [])].filter((a) => !lock.has(a));
  return [...new Set(list)].filter((a) => SYM_ALGORITHMS.includes(a));
}

// メッセージの種類によって、同じ暗号でも、破られやすさが変わる
//   短い単語: 文字の偏りが出ないので、換字式は、頻度分析では破れない
//   決まり文句: 手がかりになるので、エニグマは、頻度分析のレベルで破られる（実際に、天気報告が手がかりになった）
export function breakLevelFor(alg, kind) {
  const base = algorithmInfo(alg).breakLevel;
  if (alg === 'substitution' && kind === 'short') return 3;
  if (alg === 'enigma' && kind === 'formula') return 2;
  return base;
}

export function weaknessFor(alg, kind) {
  if (alg === 'enigma' && kind === 'formula') {
    return '毎日同じ書き出しの決まり文句が、手がかりになって、解読されました（実際に、エニグマは、天気報告の決まり文句から破られました）。';
  }
  return algorithmInfo(alg).weakness;
}

export function algorithmInfo(id) {
  return (
    ALGORITHMS[id] ?? {
      label: id ?? '不明',
      short: id ?? '?',
      color: COLORS.cipher,
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
// バンドル = { items, meta, replayed, verified }
//   items    : アイテムの配列
//   meta     : 宛先・アプリなどの「見えてしまう情報」 { dest, app, outer? }
//   replayed : 過去の通信の再送か
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
// ハッシュ・MAC・署名が守る対象は、「メッセージを運んでいる部分」だけ。
// 公開鍵で包んだ共通鍵や、証明書・ほかの印は、対象に入れない
// （どの順番で暗号化・署名しても、組み合わせ方しだいで成り立つようにするため）。
// 包まれているもの（暗号化・TLS・VPN の中）に、条件に合うアイテムがあるか
function findNested(items, pred) {
  return items.some((it) => OPAQUE.includes(it.t) && ((it.inner ?? []).some(pred) || findNested(it.inner ?? [], pred)));
}

const carriesMsg = (it) => it.t === 'msg' || (OPAQUE.includes(it.t) && (it.inner ?? []).some(carriesMsg));
const fingerprint = (items) => items.filter(carriesMsg).map(tok).join('|');

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
      if (it.alg === 'sealed') return 'セット暗号文';
      const only = it.inner.length === 1 ? it.inner[0] : null;
      if (only && only.t === 'msg' && it.key.kind === 'key') return mockEncrypt(it.alg, only.text, it.key.id);
      return `${algorithmInfo(it.alg).short}暗号文`;
    }
    case 'tls':
      return 'TLS通信';
    case 'vpn':
      return 'VPN通信';
    case 'seq':
      return '通し番号';
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
  if (wrap) return wrap.corrupt ? COLORS.bad : COLORS.cipher;
  const msg = items.find((it) => it.t === 'msg');
  if (msg) return msg.v === 'orig' ? COLORS.plain : COLORS.bad;
  if (items.some((it) => it.t === 'garbage')) return COLORS.garbled;
  if (items.some((it) => it.t === 'key')) return COLORS.key;
  return COLORS.proof;
}

// 線の上を流れる値（バンドルまたは鍵）の色
export function valueColor(v) {
  if (!v) return COLORS.garbled;
  if (v.kind) return COLORS.key;
  return bundleColor(v);
}

// 色だけに頼らないよう、線の上に出す「いまの状態」の文字
export function bundleLabel(b) {
  if (!b) return '—';
  const items = b.items;
  const wrap = items.find((it) => OPAQUE.includes(it.t));
  let base;
  if (wrap) {
    if (wrap.corrupt) base = '壊された';
    else if (wrap.t === 'tls') base = 'TLS通信';
    else if (wrap.t === 'vpn') base = 'VPN通信';
    else base = `暗号文（${algorithmInfo(wrap.alg).short}）`;
  } else {
    const msg = items.find((it) => it.t === 'msg');
    if (msg) {
      base = msg.v === 'orig' ? '平文' : msg.v === 'tampered' ? '改ざん！' : '偽の本文';
      const extra = [];
      if (items.some((i) => i.t === 'hash')) extra.push('指紋');
      if (items.some((i) => i.t === 'mac')) extra.push('MAC');
      if (items.some((i) => i.t === 'sig')) extra.push('署名');
      if (items.some((i) => i.t === 'cert')) extra.push('証明書');
      if (extra.length) base += `＋${extra.join('・')}`;
    } else if (items.some((i) => i.t === 'garbage')) {
      base = '壊れたデータ';
    } else if (items.some((i) => i.t === 'key')) {
      const k = items.find((i) => i.t === 'key');
      base = k.kind === 'pub' ? '公開鍵' : k.kind === 'priv' ? '秘密鍵' : '共通鍵';
    } else if (items.some((i) => i.t === 'cert')) {
      base = '証明書';
    } else {
      base = '確認用の印';
    }
  }
  return b.replayed ? `${base}（再送）` : base;
}

export function valueLabel(v) {
  if (!v) return '—';
  if (v.kind) return v.kind === 'pub' ? '公開鍵' : v.kind === 'priv' ? '秘密鍵' : '共通鍵';
  return bundleLabel(v);
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
  // 中身が読めないときは、メッセージを運んでいる暗号文そのものを壊す（ビットを書き換える）
  const j = items.findIndex((x) => OPAQUE.includes(x.t) && carriesMsg(x));
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
function forgeBody(it, ctx, swap) {
  switch (it.t) {
    case 'msg':
      return { ...it, v: 'forged', text: FORGED_TEXT };
    case 'enc':
      if (it.key.kind === 'pub') {
        // 公開鍵は誰でも使える。包まれている鍵を自分のものに差し替えて作り直す。
        return { ...it, inner: it.inner.map((x) => (x.t === 'key' && ctx.rewrap.has(x.id) ? ctx.rewrap.get(x.id) : x)) };
      }
      if (ctx.rewrap.has(it.key.id)) {
        const nk = ctx.rewrap.get(it.key.id);
        return { ...it, key: { kind: 'key', id: nk.id }, inner: forgeItems(it.inner, ctx, swap) };
      }
      if (it.alg === 'sealed') {
        // 安全な箱は、公開鍵で閉じる箱。誰でも、偽の中身で、正しい箱を作れる（機密性はあるが、本物かどうかは分からない）
        return { ...it, inner: forgeItems(it.inner, ctx, swap) };
      }
      if (ctx.stolenSym.has(it.key.id)) {
        // 盗んだ共通鍵があれば、正しい暗号文を作れる
        return { ...it, inner: forgeItems(it.inner, ctx, swap) };
      }
      return { ...it, corrupt: true }; // 鍵を知らないので、でたらめな暗号文になる
    case 'tls':
    case 'vpn':
      return { ...it, corrupt: true }; // セッション鍵を知らないので偽造できない
    default:
      return it;
  }
}

function forgeItems(items, ctx, swap) {
  const body = items.filter(isBody).map((it) => forgeBody(it, ctx, swap));
  const out = [...body];
  items
    .filter((x) => !isBody(x))
    .forEach((x) => {
      if (x.t === 'hash') {
        out.push({ ...x, of: fingerprint(body) }); // ハッシュは誰でも計算できる
      } else if (x.t === 'mac') {
        // 鍵を盗めていれば、正しい MAC を作れる。盗めていなければ、古いまま（合わない）。
        out.push(ctx.stolenSym.has(x.keyId) ? { ...x, of: fingerprint(body) } : x);
      } else if (x.t === 'sig') {
        // 自分の秘密鍵で署名する（Alice の秘密鍵を盗めていれば、Alice として署名できる）
        out.push({ ...x, signer: ctx.stolenOwners.has('alice') ? 'alice' : 'mallory', of: fingerprint(body) });
      } else if (x.t === 'key' && swap && x.kind === 'pub') {
        out.push({ t: 'key', kind: 'pub', id: 'mallory', owner: 'mallory', bits: x.bits });
      } else if (x.t === 'cert' && swap) {
        // CA の署名は作れないので、署名なしの偽の証明書になる
        out.push({ t: 'cert', subject: 'alice', pubId: 'mallory', owner: 'mallory', bits: x.bits, signedByCA: false });
      } else {
        out.push(x); // 証明書や鍵はコピーできる
      }
    });
  return out;
}

// Mallory は、公開されている線の上のものを、書き換えられる。
//   ctx: 本物の通信を調べて作った、攻撃の下調べ（どの線を改ざんするか・鍵のすり替え表・盗んだ鍵）
export function buildAttackContext(graph, honest, view) {
  const rewrap = new Map();
  let tamperEdge = null;
  graph.edges.forEach((e) => {
    if (!isPublicEdge(graph, e)) return;
    const v = honest.edgeValues.get(e.id);
    if (!v?.items) return;
    collectRewrap(v.items, rewrap);
    if (!tamperEdge && v.items.some(carriesMsg)) tamperEdge = e.id;
  });
  const stolenSym = new Set();
  const stolenOwners = new Set();
  (view?.stolenKeys ?? []).forEach((k) => {
    if (k.kind === 'key') stolenSym.add(k.id);
    if (k.kind === 'priv') stolenOwners.add(k.owner);
  });
  return { rewrap, tamperEdge, stolenSym, stolenOwners };
}

function attackValue(name, edgeId, v, ctx) {
  if (!v) return v;
  if (v.items) {
    switch (name) {
      case 'tamper':
        return edgeId === ctx.tamperEdge ? attackTamper(v) : v;
      case 'forge':
        return { ...v, items: forgeItems(v.items, ctx, false), replayed: false };
      case 'keyswap':
        return { ...v, items: forgeItems(v.items, ctx, true), replayed: false };
      case 'replay':
        return { ...v, replayed: true };
      default:
        return v;
    }
  }
  // 線を流れる公開鍵そのものを、自分の公開鍵にすり替える
  if (v.kind === 'pub' && name === 'keyswap') return { kind: 'pub', id: 'mallory', owner: 'mallory', bits: v.bits };
  return v;
}

/* ==========================================================
   6. 流れの計算（Alice → … → Bob）
   ========================================================== */

// flow = {
//   info       : Map(nodeId → { status: 'ok'|'blocked'|'reject'|'starved', note })
//   edgeValues : Map(edgeId → 値)
//   publicEdges: 公開されている線の id（攻撃者に見られる・書き換えられる）
//   bob        : { status, msg, replayed, verified }
//   rejects    : [{ node, note }]   見抜いて拒否した部品
// }
export function runFlow(stage, graph, rules = {}, attack = null, ctx = null) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const memo = new Map();
  const visiting = new Set();
  const flow = {
    info: new Map(),
    edgeValues: new Map(),
    messageText: '',
    msgKind: 'short', // short（短い単語）/ letter（長い手紙）/ formula（決まり文句）/ photo（写真）
    publicEdges: graph.edges.filter((e) => isPublicEdge(graph, e)).map((e) => e.id),
    bob: { status: 'none', msg: null, replayed: false, verified: [] },
    rejects: [],
    pairs: [], // [作った部品, 取り出した部品]（暗号化→復号、ハッシュを付ける→照合 など）
    orderIssues: [], // 外す順番がちがう部品（いちばん外側ではなく、内側にあるものを外そうとした）
    attack,
  };

  const inEdges = (id, port) => graph.edges.filter((e) => e.to.node === id && e.to.port === port);

  // 外す部品が、取り出したいものを探す。いちばん外側にあれば、取り出せる。
  // 内側（別の暗号化などの中）にしかなければ、外す順番がちがう。
  const lookup = (node, b, pred) => {
    const top = b.items.find(pred);
    if (!top && findNested(b.items, pred)) flow.orderIssues.push(node.id);
    return top;
  };

  const publicSet = new Set(flow.publicEdges);

  // ルールで使えない部品は、実際の流れでも、そこで止める
  const rc = ruleChecks(graph, rules);
  flow.edgeBlocked = rc.blockedEdges;

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
    if (rc.blockedEdges.has(e.id)) {
      flow.edgeValues.set(e.id, null);
      return null;
    }
    let v = outputs(e.from.node)[e.from.port] ?? null;
    // Mallory は、公開されている線の上のものを書き換える
    if (attack && ctx && v && publicSet.has(e.id)) v = attackValue(attack, e.id, v, ctx);
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

    if (rc.forbidden.has(node.id)) return set('blocked', rc.forbidden.get(node.id));

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
        // 大きなデータ（写真など）を送るステージでは、メッセージが別のものになる
        const text = rules.message ?? (rules.largeBody ? stage.largeMessage ?? '写真データ' : stageMessage(stage));
        flow.messageText = text;
        flow.msgKind = rules.msgKind ?? (rules.largeBody ? 'photo' : 'short');
        const msg = { t: 'msg', text, v: 'orig', size: msgSize };
        return set('ok', '', { out: newBundle([msg], stageMeta(stage)) });
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
          bundle: b,
        };
        return set('ok');
      }

      case 'key':
        return set('ok', '', { out: { kind: 'key', id: node.id } });

      case 'handkey':
        // 手渡しの鍵は、2つ1組（Alice のゾーンに1つ、Bob のゾーンに1つ）。同じ組は、同じ鍵。
        return set('ok', '', { out: { kind: 'key', id: node.params.pair ?? node.id } });

      case 'sealed': {
        const b = ins.data;
        const enc = { t: 'enc', alg: 'sealed', key: { kind: 'key', id: 'sealed' }, inner: b.items, by: node.id };
        return set('ok', '', { out: { ...b, items: [enc] } });
      }

      case 'unsealed': {
        const b = ins.data;
        const enc = lookup(node, b, (x) => x.t === 'enc' && x.alg === 'sealed');
        if (enc?.by) flow.pairs.push([enc.by, node.id]);
        if (!enc) return set('reject', '安全な箱に入っていません。');
        const items = enc.corrupt ? [{ t: 'garbage' }] : enc.inner;
        return set('ok', '', { out: { ...b, items } });
      }

      case 'seqstamp': {
        const b = ins.data;
        return set('ok', '', { out: { ...b, items: [...b.items, { t: 'seq', n: 1, by: node.id }] } });
      }

      case 'seqcheck': {
        const b = ins.data;
        const q = lookup(node, b, (x) => x.t === 'seq');
        if (q?.by) flow.pairs.push([q.by, node.id]);
        if (!q) return set('reject', '通し番号がありません。');
        if (b.replayed) return set('reject', 'この番号は、すでに受け取っています。再送された通信だと判断しました。');
        return set('ok', '', { out: { ...b, items: b.items.filter((x) => x !== q) } });
      }

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
        const enc = { t: 'enc', alg, key: { kind: 'key', id: ins.key.id }, inner: b.items, by: node.id };
        return set('ok', '', { out: { ...b, items: [enc] } });
      }

      case 'decrypt': {
        const alg = node.params.algorithm ?? 'caesar';
        const b = ins.data;
        const enc = lookup(
          node,
          b,
          (x) => x.t === 'enc' && x.alg === alg && x.key.kind === 'key' && x.key.id === ins.key.id
        );
        if (enc?.by) flow.pairs.push([enc.by, node.id]);
        const items = enc && !enc.corrupt ? enc.inner : [{ t: 'garbage' }];
        return set('ok', '', { out: { ...b, items } });
      }

      case 'pkenc': {
        const b = ins.data;
        if (b.items.some((x) => x.t === 'msg' && x.size === 'large')) {
          return set(
            'blocked',
            '写真のような大きなデータは、公開鍵暗号では直接暗号化できません（計算が重すぎます）。共通鍵暗号と組み合わせましょう。'
          );
        }
        const pub = ins.pub;
        const enc = {
          t: 'enc',
          alg: `rsa${pub.bits ?? 2048}`,
          key: { kind: 'pub', id: pub.id, owner: pub.owner },
          inner: b.items,
          by: node.id,
        };
        return set('ok', '', { out: { ...b, items: [enc] } });
      }

      case 'pkdec': {
        const b = ins.data;
        const enc = lookup(node, b, (x) => x.t === 'enc' && x.key.kind === 'pub' && x.key.id === ins.priv.id);
        if (enc?.by) flow.pairs.push([enc.by, node.id]);
        const items = enc && !enc.corrupt ? enc.inner : [{ t: 'garbage' }];
        return set('ok', '', { out: { ...b, items } });
      }

      case 'hash': {
        const b = ins.data;
        return set('ok', '', { out: { ...b, items: [...b.items, { t: 'hash', of: fingerprint(b.items), by: node.id }] } });
      }

      case 'hashcheck': {
        const b = ins.data;
        const h = lookup(node, b, (x) => x.t === 'hash');
        if (h?.by) flow.pairs.push([h.by, node.id]);
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
        const item = { t: 'mac', keyId: ins.key.id, of: fingerprint(b.items), by: node.id };
        return set('ok', '', { out: { ...b, items: [...b.items, item] } });
      }

      case 'maccheck': {
        const b = ins.data;
        const m = lookup(node, b, (x) => x.t === 'mac');
        if (m?.by) flow.pairs.push([m.by, node.id]);
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
        const item = { t: 'sig', signer: ins.priv.owner ?? 'alice', of: fingerprint(b.items), by: node.id };
        return set('ok', '', { out: { ...b, items: [...b.items, item] } });
      }

      case 'verify': {
        const b = ins.data;
        const s = lookup(node, b, (x) => x.t === 'sig');
        if (s?.by) flow.pairs.push([s.by, node.id]);
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
        const cert = { t: 'cert', subject: pub.owner, pubId: pub.id, owner: pub.owner, bits: pub.bits, signedByCA: true, by: node.id };
        return set('ok', '', { out: newBundle([cert]) });
      }

      case 'certcheck': {
        const b = ins.data;
        const c = lookup(node, b, (x) => x.t === 'cert');
        if (c?.by) flow.pairs.push([c.by, node.id]);
        if (!c) return set('reject', '証明書が付いていません。');
        if (!c.signedByCA) return set('reject', '証明書にCAの署名がありません。偽の証明書だと判断しました。');
        if (c.subject !== 'alice') return set('reject', '証明書の持ち主が Alice ではありません。');
        return set('ok', '', { pub: { kind: 'pub', id: c.pubId, owner: c.owner, bits: c.bits } });
      }

      case 'tls': {
        const b = ins.data;
        return set('ok', '', { out: { ...b, items: [{ t: 'tls', inner: b.items, by: node.id }] } });
      }

      case 'tlsopen': {
        const b = ins.data;
        const t = lookup(node, b, (x) => x.t === 'tls');
        if (t?.by) flow.pairs.push([t.by, node.id]);
        if (!t) return set('reject', 'TLSで包まれていません。');
        if (t.corrupt) return set('reject', 'TLSの検証に失敗しました。書き換えや偽造を検知しました。');
        if (b.replayed) return set('reject', '通信の順番が古いので、再送された通信だと判断しました。');
        return set('ok', '', { out: { ...b, items: t.inner } });
      }

      case 'vpn': {
        const b = ins.data;
        const outer = { dest: 'VPNサーバー', app: 'IPsec', outer: true };
        return set('ok', '', { out: { ...b, items: [{ t: 'vpn', inner: b.items, innerMeta: b.meta, by: node.id }], meta: outer } });
      }

      case 'vpnopen': {
        const b = ins.data;
        const v = lookup(node, b, (x) => x.t === 'vpn');
        if (v?.by) flow.pairs.push([v.by, node.id]);
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

// ルール（使えない部品）の判定。
//   problems     : 画面に出す説明
//   blockedEdges : 通せない線（edgeId → { note, short }）。いまは使っていない（空）
//   forbidden    : 使えない部品（nodeId → 説明）
//   鍵を事前に共有できない、というルールは、ゾーンの考え方に置き換わった:
//   鍵をほかのゾーンに渡す線は、公開ゾーンを通るので、攻撃者に見つかる危険がある。
export function ruleChecks(graph, rules) {
  const problems = [];
  const blockedEdges = new Map();
  const forbidden = new Map();

  const only = rules.onlyComponents;
  graph.nodes.forEach((n) => {
    const def = COMPONENTS[n.type];
    if (def.removable === false) return;
    if (Array.isArray(only) && !only.includes(n.type)) {
      const note = `「${def.label}」は、このクリア条件では使えません。`;
      problems.push(note);
      forbidden.set(n.id, note);
    }
  });

  return { problems: [...new Set(problems)], blockedEdges, forbidden };
}

export function checkRules(stage, graph, rules) {
  return ruleChecks(graph, rules).problems;
}

export function wiringProblems(graph, flow, hasRuleProblems = false) {
  const problems = [];
  if (!graph.edges.some((e) => e.from.node === 'alice')) {
    problems.push('Alice から出ている線がありません。Alice の出口から線を引きましょう。');
  }
  const rel = relevantNodes(graph);
  flow.info.forEach(({ status, note }, id) => {
    if (status === 'blocked' && rel.has(id)) problems.push(note);
  });
  // ルール違反で止まっているときは、「届いていない」ではなく、ルールの説明だけを出す
  if (problems.length === 0 && !hasRuleProblems) {
    if (flow.bob.status === 'none') {
      problems.push('メッセージが Bob に届いていません。Alice から Bob まで、線をつなぎましょう。');
    }
  }
  return [...new Set(problems)];
}

/* ==========================================================
   8. Eve（盗聴）の分析
   ========================================================== */
const algOf = (it) => (it.t === 'enc' ? it.alg : it.t);

// 攻撃者が、公開ゾーンで調べたことから、何を読めるか。
//   計算能力（compute）: 暗号文を解読できる強さ
//   探すもの（looksFor）: 'messages' = メッセージの線だけ / 'keys' も = 線と置き場所から鍵も探す
//   行動の順番（steps）は、画面で、歩き回るようすとして見せる:
//     ① 公開されている線を調べて、流れているものをコピーする
//     ② 鍵を探す（探すものに鍵が入っているとき）: 線の上と、公開ゾーンに置かれた部品
//     ③ 手に入れた暗号文を、解読・鍵で開けてみる
//     ④ メッセージを読めたか
export function analyzeAttackerView(graph, flow, caps) {
  const level = computeInfo(caps.compute).level;
  const seeks = new Set(caps.looksFor ?? ['messages']);
  const steps = [];
  const captures = [];
  const stolen = new Map(); // 'key:ID' / 'priv:ID' → { key, edgeId?, nodeId? }

  // ① 公開されている線
  graph.edges.filter((e) => isPublicEdge(graph, e)).forEach((e) => {
    const v = flow.edgeValues.get(e.id);
    if (!v) return;
    if (v.items) {
      captures.push({ edgeId: e.id, bundle: v });
      steps.push({ kind: 'capture', edgeId: e.id, bundle: v });
    } else if (v.kind && seeks.has('keys')) {
      const secret = v.kind !== 'pub';
      steps.push({ kind: 'key-line', edgeId: e.id, key: v, secret });
      if (secret) stolen.set(`${v.kind}:${v.id}`, { key: v, edgeId: e.id });
    }
  });

  // ② 公開ゾーンに置かれた鍵
  if (seeks.has('keys')) {
    graph.nodes
      .filter((n) => zoneOf(n) === 'public' && (n.type === 'key' || n.type === 'handkey' || n.type === 'keypair'))
      .forEach((n) => {
        const out = flow.outputs?.get(n.id) ?? {};
        const found = Object.values(out).filter((v) => v?.kind && v.kind !== 'pub');
        steps.push({ kind: 'key-node', nodeId: n.id, found: found.length > 0 });
        found.forEach((v) => stolen.set(`${v.kind}:${v.id}`, { key: v, nodeId: n.id }));
      });
    if (stolen.size === 0) steps.push({ kind: 'key-none' });
  }

  // ③ 手に入れたものを、開けられるだけ開けていく
  const opened = new Map(); // アイテム → 開けるのに破った方式の一覧
  const known = new Map(); // 'key:ID' / 'priv:ID' → 入手に使った方式の一覧
  stolen.forEach((_, k) => known.set(k, []));
  let msgChain = null;
  let topLevelMsg = false;
  let changed = true;

  while (changed) {
    changed = false;
    msgChain = null;
    topLevelMsg = false;

    const walk = (items, chain, top, edgeId) => {
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
            let method = null;
            if (breakLevelFor(algOf(it), flow.msgKind) <= level) {
              how = [...chain, algOf(it)];
              method = 'brute';
            } else if (it.t === 'enc') {
              const k = `${it.key.kind === 'pub' ? 'priv' : 'key'}:${it.key.id}`;
              if (known.has(k)) {
                how = [...new Set([...chain, ...known.get(k)])];
                method = 'key';
              }
            }
            if (how) {
              opened.set(it, how);
              steps.push({ kind: 'open', method, alg: algOf(it), edgeId, level: breakLevelFor(algOf(it), flow.msgKind) });
              changed = true;
            }
          }
          if (opened.has(it)) walk(it.inner, opened.get(it), false, edgeId);
        }
      });
    };
    captures.forEach((c) => walk(c.bundle.items, [], true, c.edgeId));
  }

  const res = {
    msgRead: false,
    how: null, // 'plain' | 'cracked' | 'keyleak'
    crackedAlgs: [],
    msgKind: flow.msgKind,
    stolenKeys: [...stolen.values()].map((s2) => s2.key),
    blocker: null,
    metaReveals: false,
    meta: null,
    captures: captures.map((c) => c.edgeId),
    seeks: [...seeks],
    steps,
  };

  const reveal = captures.find((c) => c.bundle.meta && !c.bundle.meta.outer);
  res.metaReveals = Boolean(reveal && caps.seesMetadata !== false);
  res.meta = (reveal ?? captures.find((c) => c.bundle.meta))?.bundle.meta ?? null;

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
    for (const c of captures) {
      const b = findBlocker(c.bundle.items);
      if (b) {
        res.blocker = b;
        break;
      }
    }
  }

  // 開けられなかったもの
  captures.forEach((c) => {
    c.bundle.items.forEach((it) => {
      if (OPAQUE.includes(it.t) && !opened.has(it)) steps.push({ kind: 'open-fail', alg: algOf(it), edgeId: c.edgeId });
    });
  });
  steps.push({ kind: 'read', ok: res.msgRead, how: res.how });
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
  if (x.msgRead) {
    if (x.how === 'plain') {
      return {
        key: 'confidentiality',
        label,
        met: false,
        reason: 'メッセージが暗号化されないまま、公開されている線を流れました。攻撃者は、線を調べて、そのまま読めました。',
      };
    }
    if (x.how === 'keyleak') {
      const where = x.stolenKeys.length
        ? '暗号を開ける鍵が、公開ゾーン（線の上や、置いてある場所）にありました。攻撃者はそれを見つけて、暗号文を開けました。'
        : '暗号を開ける鍵が、暗号化されないまま、公開されている線を流れていました。盗まれた鍵で、本文を開けられてしまいました。';
      return { key: 'confidentiality', label, met: false, reason: where };
    }
    const algs = x.crackedAlgs.map((a) => ({ id: a, info: algorithmInfo(a), lv: breakLevelFor(a, x.msgKind) }));
    const weakest = algs.sort((a, b) => a.lv - b.lv).pop();
    return {
      key: 'confidentiality',
      label,
      met: false,
      reason: `攻撃者（${attacker.label}）に「${weakest.info.label}」を解読され、本文を読まれました。${weaknessFor(weakest.id, x.msgKind)}`,
    };
  }
  if (x.blocker) {
    const name = algorithmInfo(algOf(x.blocker)).label;
    return {
      key: 'confidentiality',
      label,
      met: true,
      reason: `攻撃者は暗号文を手に入れましたが、「${name}」を破れませんでした（攻撃者: ${attacker.label}）。`,
    };
  }
  return { key: 'confidentiality', label, met: true, reason: '攻撃者が調べた線から、読めるメッセージは見つかりませんでした。' };
}

function metadataCheck(x) {
  const label = REQUIREMENTS.metadata.label;
  if (x.metaReveals) {
    return {
      key: 'metadata',
      label,
      met: false,
      reason: `通信の宛先（${x.meta.dest}）やアプリ（${x.meta.app}）が、公開されている線から見えてしまいます。本文を暗号化しても、通信相手などは隠せません。`,
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
      reason:
        'Alice は「そんなメッセージ、送っていない」と言い張りたくなっても、できません。Bob の手元には、Alice の秘密鍵でしか作れない署名があります。Bob は「これは Alice が送った」と、第三者にも説明できます。',
    };
  }
  if (v.some((x) => x.kind === 'mac')) {
    return {
      key: 'nonrepudiation',
      label,
      met: false,
      reason:
        'Alice は「送っていない」と言い張れます。MAC は、同じ共通鍵を持つ Bob 自身にも作れる印です。Bob が「Alice が送った」と言っても、第三者には、Bob が自分で作ったものかもしれない、と疑われます。',
    };
  }
  return {
    key: 'nonrepudiation',
    label,
    met: false,
    reason:
      'Alice は「送っていない」と言い張れます。Bob の手元に、Alice だけが作れる印（デジタル署名）がないので、Bob は「Alice が送った」証拠を、示せません。',
  };
}

function deliveryCheck(flow, graph) {
  const b = flow.bob;
  const ok = Boolean(b.msg) && b.msg.v === 'orig' && !b.replayed;
  let reason = 'Bob は元のメッセージを読めました。';
  if (!ok) {
    if (flow.orderIssues?.length > 0) {
      const n = graph.nodes.find((x) => x.id === flow.orderIssues[0]);
      reason = `「${COMPONENTS[n.type].label}」を外す順番がちがいます。かけた順番と、逆の順番で外す必要があります（最後にかけたものを、最初に外します）。`;
    } else if (b.status === 'unreadable') reason = 'Bob に届いたメッセージが、まだ暗号化・包装されたままです。復号やほどく部品を足しましょう。';
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
  const ruleProblems = checkRules(stage, graph, rules);
  const problems = [...ruleProblems, ...wiringProblems(graph, honest, ruleProblems.length > 0)];
  const result = { key, caps, rules, honest, attacks: [], exposure: null, checks: [], problems, met: false, status: 'done' };

  if (problems.length > 0) {
    result.status = 'incomplete';
    return result;
  }

  // 攻撃者は、公開ゾーンを調べる。Mallory は、その調べたことをもとに、公開されている線を書き換える
  const x = analyzeAttackerView(graph, honest, caps);
  result.exposure = x;
  const ctx = buildAttackContext(graph, honest, x);

  (caps.attacks ?? []).forEach((name) => {
    const flow = runFlow(stage, graph, rules, name, ctx);
    result.attacks.push({ name, flow, outcome: classify(flow) });
  });
  result.attacks.forEach((a) => { a.text = describeAttack(a, graph); });

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

// 評価に使う、部品の取り外しの仕組み
//   ・データが通り抜ける部品（暗号化・ハッシュ・署名など）は、外すと、前後の線がつながる
//   ・外したあとに、どこにも使われなくなった鍵などは、一緒に外れる
// 評価に使う目標は、本編（最初の目標）だけ。EX（やりこみ）は、評価に入れない
const ratingKeys = (stage) => objectiveKeys(stage).slice(0, 1);

function meetsAll(stage, graph) {
  return ratingKeys(stage).every((k) => evaluateObjective(stage, graph, k).met);
}

const isFixedNode = (n) => COMPONENTS[n.type].removable === false;

// 部品を1つ外す。通り抜ける部品なら、前の線と後ろの線を、直接つなぐ。
function removeNodeBypass(graph, id) {
  const node = graph.nodes.find((n) => n.id === id);
  const def = COMPONENTS[node.type];
  const dataIns = def.inputs.filter((p) => p.type === DATA);
  const passThrough = dataIns.length === 1 && def.outputs.length === 1 && def.outputs[0].type === DATA;

  const extra = [];
  if (passThrough) {
    const ins = graph.edges.filter((e) => e.to.node === id && e.to.port === dataIns[0].id);
    const outs = graph.edges.filter((e) => e.from.node === id);
    ins.forEach((a) =>
      outs.forEach((o) => extra.push({ id: `bp-${a.id}-${o.id}`, type: a.type, from: a.from, to: o.to }))
    );
  }
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.from.node !== id && e.to.node !== id).concat(extra),
  };
}

// 出力がどこにもつながっていない部品（使われなくなった鍵など）を、取り除く
function pruneDeadEnds(graph) {
  let g = graph;
  const removed = [];
  for (;;) {
    const dead = g.nodes.find((n) => !isFixedNode(n) && !g.edges.some((e) => e.from.node === n.id));
    if (!dead) break;
    removed.push(dead.id);
    g = removeNodeBypass(g, dead.id);
  }
  return { graph: g, removed };
}


/* ==========================================================
   評価（S / A / B / C）
   ========================================================== */
// 実際に通信を実行したときの様子（流れ）をもとに決める。
//
//   ペア: 「かける動作」と「外す動作」（暗号化と復号、ハッシュを付けると照合 など）。
//         どれとどれがペアかは、実行中に「どの部品が作ったものを、どの部品が取り出したか」で決まる。
//   数えるのは、Alice → … → Bob の通信につながっている部品だけ（つながっていない部品は数えない）。
//   ペアの数と、パーツ（部品）の数の、両方を数える。鍵などのペアにならない部品や、
//   片方しかない部品（照合のないハッシュ など）は、パーツの数のほうで数える。
//
//   C  : Bob に読める形で届かない／満たした要件が1つもない
//   B  : 要件を1つ以上は満たしたが、全部は満たせていない
//   A  : すべて満たしたが、
//        ・各ペアをいったん無効にして全パターンを試すと、もっと少ない部品でも通る、または
//        ・想定解より、ペアかパーツが多い
//   S  : すべて満たし、想定解と同じ数か、それより少ない数
//        （想定解より少ないときは、評価は S のまま、「すごい！」のひとことだけ添える）

const SUPPORT_TYPES = new Set(['key', 'handkey', 'keypair']); // ペアにならず、使う部品に付いてくる部品

// Alice から Bob へつながっている部品（Bob に届く道のりの、上流にあるもの）
function connectedNodes(graph) {
  const seen = new Set(['bob']);
  const stack = ['bob'];
  while (stack.length) {
    const id = stack.pop();
    graph.edges.forEach((e) => {
      if (e.to.node === id && !seen.has(e.from.node)) {
        seen.add(e.from.node);
        stack.push(e.from.node);
      }
    });
  }
  return graph.nodes.filter((n) => seen.has(n.id) && !isFixedNode(n));
}

// 実行で見つかったペアを、1つの「ユニット」にまとめる。ペアの相手がない部品は、1つだけのユニット。
function buildUnits(counted, pairs) {
  const ids = new Set(counted.map((n) => n.id));
  const parent = new Map();
  const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  pairs.filter(([a, b]) => ids.has(a) && ids.has(b)).forEach(([a, b]) => {
    add(a);
    add(b);
    parent.set(find(a), find(b));
  });
  counted.filter((n) => !SUPPORT_TYPES.has(n.type) && !parent.has(n.id)).forEach((n) => add(n.id));

  const groups = new Map();
  parent.forEach((_, id) => {
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(id);
  });
  return [...groups.values()];
}

function measure(graph, pairs) {
  const counted = connectedNodes(graph);
  const units = buildUnits(counted, pairs);
  return { parts: counted.length, pairs: units.filter((u) => u.length >= 2).length, units };
}

function unitLabel(graph, unit) {
  const names = unit.map((id) => COMPONENTS[graph.nodes.find((n) => n.id === id).type].label);
  return names.join('・');
}

// 想定解（いちばん最後の目標の想定解）の、ペアとパーツの数
const baselineCache = new Map();

function graphFromSolution(sol) {
  const g = {
    nodes: ['alice', 'bob'].map((id) => ({ id, type: id, params: {}, zone: id })),
    edges: [],
  };
  Object.entries(sol.nodes).forEach(([id, [type, params, zone]]) =>
    g.nodes.push({ id, type, params: { ...(params ?? {}) }, zone: zone ?? DEFAULT_ZONE[type] })
  );
  sol.edges.forEach((str, i) => {
    const [a, b] = str.split('>');
    const [an, ap] = a.split('.');
    const [bn, bp] = b.split('.');
    const from = g.nodes.find((n) => n.id === an);
    const port = COMPONENTS[from.type].outputs.find((o) => o.id === ap);
    g.edges.push({ id: `s${i}`, type: port.type, from: { node: an, port: ap }, to: { node: bn, port: bp } });
  });
  return g;
}

function baselineMetrics(stage) {
  const keys = ratingKeys(stage);
  const sol = stage.solutions?.[keys[keys.length - 1]];
  if (!sol) return null;
  const cacheKey = `${stage.id}:${JSON.stringify(sol)}`;
  if (baselineCache.has(cacheKey)) return baselineCache.get(cacheKey);
  const g = graphFromSolution(sol);
  const pairs = keys.flatMap((k) => runFlow(stage, g, rulesFor(stage, k), null).pairs);
  const m = measure(g, pairs);
  const result = { parts: m.parts, pairs: m.pairs };
  baselineCache.set(cacheKey, result);
  return result;
}

// 各ペア（ユニット）を、コメントアウトのように無効にして、全パターンを試す。
// いまより少ない部品で、すべての目標を満たせるパターンがあれば、それを返す。
function searchReduction(stage, graph, cur) {
  const units = cur.units;
  const n = units.length;
  if (n === 0) return null;
  const maxDisable = n <= 8 ? n : 3;
  let best = null;

  for (let mask = 1; mask < 2 ** n; mask += 1) {
    let count = 0;
    for (let i = 0; i < n; i += 1) if (mask & (1 << i)) count += 1; // eslint-disable-line no-bitwise
    if (count > maxDisable) continue;

    let g = graph;
    units.forEach((unit, i) => {
      if (mask & (1 << i)) unit.forEach((id) => { g = removeNodeBypass(g, id); }); // eslint-disable-line no-bitwise
    });
    const pruned = pruneDeadEnds(g);
    const remaining = connectedNodes(pruned.graph).length;
    if (remaining >= (best ? best.remaining : cur.parts)) continue; // いまより少なくならない
    if (meetsAll(stage, pruned.graph)) {
      best = { remaining, disabled: units.filter((_, i) => mask & (1 << i)) }; // eslint-disable-line no-bitwise
    }
  }
  return best;
}

export function rateStage(stage, graph, objectives) {
  const list = ratingKeys(stage).map((k) => objectives[k]);
  const delivered = list.some((o) => o.status === 'done' && o.checks[0]?.met);
  const metReq = list.reduce(
    (sum, o) => sum + (o.status === 'done' ? o.checks.filter((c) => c.key !== 'delivery' && c.met).length : 0),
    0
  );
  const allMet = list.every((o) => o.met);

  const pairs = list.flatMap((o) => o.honest?.pairs ?? []);
  const cur = measure(graph, pairs);
  const base = baselineMetrics(stage);
  const info = {
    parts: cur.parts,
    pairs: cur.pairs,
    baseParts: base?.parts ?? null,
    basePairs: base?.pairs ?? null,
    removable: [],
    reason: '',
  };

  if (!allMet) {
    if (!delivered) {
      const order = list.some((o) => o.honest?.orderIssues?.length > 0);
      info.reason = order
        ? '外す順番が、かけた順番と逆になっていません。部品は同じでも、順番がちがうと、元に戻せません。'
        : 'Bob に、読める形でメッセージが届いていません。';
      return { rating: 'C', info };
    }
    if (metReq >= 1) {
      info.reason = '一部の条件は満たせましたが、すべては満たせていません。';
      return { rating: 'B', info };
    }
    info.reason = '重要な条件を満たせていません。';
    return { rating: 'C', info };
  }

  // すべて満たしているとき: 無駄がないか、想定解と比べてどうか
  const reduction = searchReduction(stage, graph, cur);
  if (reduction) {
    info.removable = reduction.disabled.map((u) => unitLabel(graph, u));
    info.reason = `無効にしても条件を満たせる部品があります（${info.removable.join(' / ')}）。もっと少ない部品で通せます。`;
    return { rating: 'A', info };
  }
  if (base) {
    if (cur.parts > base.parts || cur.pairs > base.pairs) {
      info.reason = '条件はすべて満たしていますが、想定解より部品が多いです。想定解のやり方に合わせれば、もっと少なくできます。';
      return { rating: 'A', info };
    }
    if (cur.parts < base.parts || cur.pairs < base.pairs) {
      // 評価は S のまま。「想定解より少ない」ことを、ひとことだけ伝える（評価の目的にはしない）
      info.fewer = true;
      info.reason = 'すごい！ 想定解よりも少ない部品で、すべての条件を満たしました。';
      return { rating: 'S', info };
    }
  }
  info.reason = '無駄がなく、想定解と同じ数の部品で、すべての条件を満たしました。';
  return { rating: 'S', info };
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

export function evaluateStage(stage, graph) {
  const objectives = {};
  objectiveKeys(stage).forEach((key) => {
    objectives[key] = evaluateObjective(stage, graph, key);
  });
  const { rating, info } = rateStage(stage, graph, objectives);
  const first = objectives[objectiveKeys(stage)[0]];
  return {
    objectives,
    rating,
    ratingInfo: info,
    cleared: Boolean(first?.met),
    flow: describeRoute(graph),
  };
}

// 実演（現実の脅威）。クリアした回路を、stage.demo の条件（攻撃者・メッセージなど）で、もう一度評価する。
//   stage.demo = { attackerOverride, rules, require, lock, unlock }
export function evaluateDemo(stage, graph) {
  if (!stage.demo) return null;
  const d = stage.demo;
  const clone = {
    ...stage,
    objectives: { DEMO: { require: d.require ?? [], attackerOverride: d.attackerOverride, rules: d.rules, lock: d.lock, unlock: d.unlock } },
  };
  return evaluateObjective(clone, graph, 'DEMO');
}
