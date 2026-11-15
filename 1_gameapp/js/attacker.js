// attacker.js
// 実験室（lab.html）：会話文を書き換えて、本物の暗号（AES-GCM）で、攻撃者に解読させる
//   1 見る（Eve）  2 書き換える（Mallory）  3 守ってみる  4 本物の攻撃者は、何を狙う？
// ・暗号は、ブラウザの WebCrypto（AES-GCM / PBKDF2）で、本物を動かす。シーザー暗号は、自前（教材用）。
// ・通信はすべて、このページの中だけ。外部には、何も、送らない。

import { makeCharacter } from './characters.js';
import { isStageCleared, isDev } from './progress.js';

const DONE_KEY = 'crypta:attackerView';
const enc = new TextEncoder();
const dec = new TextDecoder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
const hex = (u8, max = 40) => {
  const s = [...u8].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  return u8.length > max ? `${[...u8.slice(0, max)].map((b) => b.toString(16).padStart(2, '0')).join(' ')} …` : s;
};
const chr = (kind, w) => makeCharacter(kind, { width: w, height: Math.round(w * 1.28), className: 'character' });

// ---------- シーザー暗号（教材用。英字・数字・ひらがな・カタカナを、ずらす） ----------
const GROUPS = [[0x41, 26], [0x61, 26], [0x30, 10], [0x3041, 83], [0x30a1, 86]];
function shiftChar(ch, k) {
  const c = ch.codePointAt(0);
  for (const [b, n] of GROUPS) {
    if (c >= b && c < b + n) return String.fromCodePoint(b + ((((c - b + k) % n) + n) % n));
  }
  return ch;
}
const caesar = (text, k) => [...text].map((c) => shiftChar(c, k)).join('');
const CAESAR_KEY = 3;
const hasShiftable = (t) => [...t].some((c) => shiftChar(c, 1) !== c);

// ---------- AES-GCM（本物） ----------
async function newAesKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function aesEncrypt(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  return { iv, ct };
}
async function aesDecrypt(key, iv, ct) {
  try {
    return { ok: true, text: dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)) };
  } catch {
    return { ok: false };
  }
}
async function keyFromPass(pass, iterations = 1000) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('crypta-demo-salt'), iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

// ---------- 状態 ----------
const S = {
  act: 0,
  message: 'あしたの6じに、えきまえで あおう',
  mode: 'none', // none | caesar | aes
  sent: null, // { plain, mode, wire(string|Uint8Array), iv, key }
  wireNow: null, // いま線の上にあるもの（Mallory が書き換えると、変わる）
  flags: {},
  target: null,
};
const flag = (k) => !!S.flags[k];
const setFlag = (k) => { S.flags[k] = true; };

const ACTS = [
  { title: '見る', sub: 'Eve になる' },
  { title: '書き換える', sub: 'Mallory になる' },
  { title: '守ってみる', sub: '自分で設定する' },
  { title: '本当の攻撃者', sub: '何を狙う？' },
];

const app = document.getElementById('app');

// ---------- 画面の骨組み ----------
function frame(actIndex, { name, lead, tasks, note, who }, body, nav) {
  const root = el('div');
  const steps = el('ol', 'atk-steps');
  ACTS.forEach((a, i) => {
    const li = el('li', i === actIndex ? 'is-now' : i < actIndex ? 'is-done' : '');
    li.append(`${i + 1}. ${a.title}`, Object.assign(el('small'), { textContent: a.sub }));
    steps.append(li);
  });
  const grid = el('div', 'atk-grid');
  const panel = el('section', 'atk-panel');
  panel.append(el('h2', null, name), el('p', 'atk-lead', lead), body, nav);
  const guide = el('aside', 'atk-guide');
  const head = el('div', 'atk-guide-head');
  head.append(chr(who, 46), el('p', 'atk-guide-title', 'やること'));
  const list = el('ul', 'atk-tasks');
  list.id = 'atk-tasks';
  tasks.forEach(([key, text]) => {
    const li = el('li', flag(key) ? 'is-done' : '', text);
    li.dataset.key = key;
    list.append(li);
  });
  guide.append(head, list);
  if (note) guide.append(el('p', 'atk-guide-note', note));
  grid.append(panel, guide);
  root.append(steps, grid);
  return root;
}
function tick(key) {
  setFlag(key);
  document.querySelector(`#atk-tasks li[data-key="${key}"]`)?.classList.add('is-done');
  refreshNav();
}
let navCondition = () => true;
function refreshNav() {
  const b = document.getElementById('atk-next');
  if (!b) return;
  const ok = navCondition();
  b.disabled = !ok;
  b.classList.toggle('is-next', ok);
}
function makeNav(prevLabel, nextLabel, cond, onPrev, onNext) {
  const nav = el('div', 'atk-nav');
  const prev = el('button', 'button button-secondary', prevLabel);
  prev.type = 'button';
  prev.onclick = onPrev;
  const next = el('button', 'button button-primary', nextLabel);
  next.type = 'button';
  next.id = 'atk-next';
  next.onclick = onNext;
  nav.append(prev, next);
  navCondition = cond;
  queueMicrotask(refreshNav);
  return nav;
}

// ---------- 実験台（Alice → 線 → Bob と、Eve / Mallory のボタン） ----------
const MODES = {
  none: { label: '暗号なし', desc: 'そのまま送る' },
  caesar: { label: 'シーザー暗号', desc: '文字を3つずらす（昔の暗号）' },
  aes: { label: 'AES-GCM', desc: '今の暗号。鍵を持たない人には読めず、書き換えも見抜ける' },
};

function bench({ modes, eve, mallory, onSendDone, onEve, onMallory }) {
  const wrap = el('div');
  const field = el('label', 'atk-field', '① Alice が Bob に送る文（自由に書き換えてください）');
  const input = el('input');
  input.type = 'text';
  input.maxLength = 60;
  input.value = S.message;
  field.append(input);
  input.addEventListener('input', () => { S.message = input.value; });

  const modeBox = el('div', 'atk-modes');
  const modeBtns = {};
  modes.forEach((m) => {
    const b = el('button', 'atk-mode');
    b.type = 'button';
    b.append(el('b', null, MODES[m].label), MODES[m].desc);
    b.onclick = () => { S.mode = m; paintModes(); };
    modeBtns[m] = b;
    modeBox.append(b);
  });
  if (!modes.includes(S.mode)) S.mode = modes[0];
  const paintModes = () => Object.entries(modeBtns).forEach(([m, b]) => b.classList.toggle('is-on', m === S.mode));
  paintModes();

  // 登場人物と、線
  const stage = el('div', 'atk-stage');
  const alice = el('div', 'atk-person'); alice.append(chr('alice', 54), 'Alice');
  const bobP = el('div', 'atk-person'); bobP.append(chr('bob', 54), 'Bob');
  const mid = el('div', 'atk-wire');
  mid.append(el('div', 'atk-wire-label', '② 線の上（誰でも見られる場所）'));
  const wireBox = el('div', 'atk-wire-box is-empty', '（まだ何も流れていません）');
  mid.append(wireBox);
  const bobSay = el('div', 'atk-bubble', 'Bob：まだ何も届いていません');
  bobP.append(bobSay);
  stage.append(alice, mid, bobP);

  const out = el('div'); // Eve / Mallory の結果欄
  const actions = el('div', 'atk-actions');
  const send = el('button', 'button button-primary', '送信する');
  send.type = 'button';
  actions.append(send);
  const eveBtn = el('button', 'button btn-eve', 'Eve：盗み見て、解読してみる');
  eveBtn.type = 'button';
  eveBtn.hidden = !eve;
  const malBtn = el('button', 'button btn-mal', 'Mallory：書き換えてみる');
  malBtn.type = 'button';
  malBtn.hidden = !mallory;
  actions.append(eveBtn, malBtn);

  const malBox = el('div', 'atk-sub');
  malBox.hidden = true;
  const forgeField = el('label', 'atk-field', '偽のメッセージ（Mallory が Bob に信じ込ませたい文）');
  const forgeIn = el('input');
  forgeIn.type = 'text';
  forgeIn.maxLength = 60;
  forgeIn.value = 'あしたは こなくていい';
  forgeField.append(forgeIn);
  const malActs = el('div', 'atk-actions');
  const flipBtn = el('button', 'button btn-mal', '線の上の1文字を壊す');
  flipBtn.type = 'button';
  const forgeBtn = el('button', 'button btn-mal', '偽メッセージに差し替える');
  forgeBtn.type = 'button';
  malActs.append(flipBtn, forgeBtn);
  malBox.append(forgeField, malActs);

  wrap.append(field, el('h3', null, '暗号の方式'), modeBox, stage, actions, malBox, out);

  const bobReceive = async (w) => {
    let r;
    if (w.mode === 'none') r = { ok: true, text: w.wire };
    else if (w.mode === 'caesar') r = { ok: true, text: caesar(w.wire, -CAESAR_KEY) };
    else r = await aesDecrypt(w.key, w.iv, w.wire);
    if (r.ok) {
      const changed = r.text !== S.sent.plain;
      bobSay.className = `atk-bubble ${changed ? 'is-bad' : 'is-ok'}`;
      bobSay.textContent = `Bob：「${r.text}」を受け取りました${changed ? '（Alice が送った文とは違いますが、Bob には分かりません）' : ''}`;
    } else {
      bobSay.className = 'atk-bubble is-ok';
      bobSay.textContent = 'Bob：このメッセージは、改ざんされています。受け取りません。';
    }
    return r;
  };
  const showWire = (w, bad = false) => {
    const isCipher = w.mode !== 'none';
    wireBox.className = `atk-wire-box ${isCipher ? 'is-cipher' : ''} ${bad ? 'is-bad' : ''}`;
    wireBox.textContent = w.mode === 'aes' ? hex(w.wire) : w.wire;
  };

  send.onclick = async () => {
    const plain = S.message.trim();
    if (!plain) { alert('送る文を入力してください'); return; }
    if (S.mode === 'caesar' && !hasShiftable(plain)) {
      alert('この文には、ずらせる文字（英数字・ひらがな・カタカナ）がありません。入れてください。');
      return;
    }
    out.replaceChildren();
    malBox.hidden = true;
    let w;
    if (S.mode === 'none') w = { mode: 'none', wire: plain };
    else if (S.mode === 'caesar') w = { mode: 'caesar', wire: caesar(plain, CAESAR_KEY) };
    else {
      const key = await newAesKey();
      const { iv, ct } = await aesEncrypt(key, plain);
      w = { mode: 'aes', wire: ct, iv, key };
    }
    S.sent = { plain, ...w };
    S.wireNow = { ...w };
    showWire(w);
    await bobReceive(S.wireNow);
    S.flags[`sent_${S.mode}`] = true;
    onSendDone?.();
  };

  const needSent = () => {
    if (!S.sent) { alert('先に「送信する」を押してください'); return false; }
    return true;
  };

  // ---- Eve ----
  eveBtn.onclick = async () => {
    if (!needSent()) return;
    out.replaceChildren();
    const w = S.wireNow;
    const box = el('div', 'atk-sub');
    box.append(chr('eve', 40));
    out.append(box);
    if (w.mode === 'none') {
      box.append(el('p', null, `Eve：線の上の文字を、そのまま読めました → 「${w.wire}」`));
      box.append(el('div', 'atk-verdict is-bad', '暗号がないので、盗み見るだけで、読まれます。'));
      S.flags.eve_none = true;
      onEve?.('none');
    } else if (w.mode === 'caesar') {
      box.append(el('p', null, 'Eve：ずらし幅は、25通りしかない。全部、試す。読める行を、クリックしてください。'));
      const list = el('ul', 'atk-brute');
      box.append(list);
      for (let k = 1; k <= 25; k += 1) {
        const li = el('li');
        li.append(el('span', 'k', `幅 ${k}`), el('span', null, caesar(w.wire, -k)));
        li.dataset.k = String(k);
        list.append(li);
        // eslint-disable-next-line no-await-in-loop
        await sleep(35);
      }
      list.addEventListener('click', (ev) => {
        const li = ev.target.closest('li');
        if (!li || list.dataset.done) return;
        if (Number(li.dataset.k) === CAESAR_KEY) {
          li.classList.add('is-hit');
          list.dataset.done = '1';
          box.append(el('div', 'atk-verdict is-bad', 'ずらし幅 3 と分かりました。25回試すだけで、人の目でも破れます。'));
          S.flags.eve_caesar = true;
          onEve?.('caesar');
        } else {
          li.classList.add('is-miss');
          if (!li.dataset.said) {
            li.dataset.said = '1';
            box.append(el('p', 'atk-lead', '意味が通りません。他の行も見てみましょう。'));
          }
        }
      });
    } else {
      box.append(el('p', null, 'Eve：鍵が分からない。鍵を、片っ端から、試す。'));
      const meter = el('div', 'atk-meter', '試した鍵：0 個　読めた：0 件');
      box.append(meter);
      let tried = 0;
      const probe = new Uint8Array(w.wire);
      for (let batch = 0; batch < 20; batch += 1) {
        for (let i = 0; i < 100; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const k = await newAesKey();
          // eslint-disable-next-line no-await-in-loop
          await aesDecrypt(k, w.iv, probe);
          tried += 1;
        }
        meter.textContent = `試した鍵：${tried.toLocaleString()} 個　読めた：0 件`;
        // eslint-disable-next-line no-await-in-loop
        await sleep(0);
      }
      box.append(el('div', 'atk-verdict is-ok',
        `${tried.toLocaleString()} 個の鍵を試して、読めたのは 0 件。AES-256 の鍵は 2^256（約 1.2×10^77）通りあります。` +
        '1秒に 10^18 回（世界最速級のスーパーコンピュータの規模）試せても、約 10^51 年。宇宙の年齢（約 1.4×10^10 年）より、はるかに長い時間です。'));
      S.flags.eve_aes = true;
      onEve?.('aes');
    }
    refreshNav();
  };

  // ---- Mallory ----
  malBtn.onclick = () => {
    if (!needSent()) return;
    malBox.hidden = false;
    out.replaceChildren();
  };
  const afterMal = async (what, w) => {
    S.wireNow = w;
    showWire(w, true);
    const r = await bobReceive(w);
    const box = el('div', 'atk-sub');
    box.append(chr('mallory', 40));
    const accepted = r.ok;
    if (w.mode === 'aes') {
      box.append(el('div', 'atk-verdict is-ok',
        what === 'flip'
          ? 'AES-GCM には、改ざん検知用の「タグ」が付いています。1文字でも変わると、Bob の復号は失敗し、受け取りません。'
          : 'Mallory は鍵を持っていないので、自分の鍵で暗号化した偽物を作るしかありません。Bob の鍵では復号できず、拒否されます。'));
      S.flags.mal_aes_rejected = true;
    } else if (accepted && what === 'forge') {
      box.append(el('div', 'atk-verdict is-bad',
        `偽のメッセージ「${r.text}」を、Bob は本物として受け取りました。暗号が弱い、または暗号がないと、書き換えを見抜けません。`));
      S.flags.mal_forged = true;
    } else {
      box.append(el('div', 'atk-verdict is-bad', 'Bob は、壊れたデータを受け取りました。「壊れている」ことにすら、気づけていません。'));
      S.flags.mal_flipped = true;
    }
    out.replaceChildren(box);
    onMallory?.(what, w.mode, accepted);
    refreshNav();
  };
  flipBtn.onclick = async () => {
    if (!needSent()) return;
    const base = S.sent;
    let w;
    if (base.mode === 'aes') {
      const ct = new Uint8Array(base.wire);
      ct[0] ^= 0x01;
      w = { ...base, wire: ct };
    } else {
      const arr = [...base.wire];
      const i = Math.max(0, arr.length - 2);
      arr[i] = '■';
      w = { ...base, wire: arr.join('') };
    }
    await afterMal('flip', w);
  };
  forgeBtn.onclick = async () => {
    if (!needSent()) return;
    const forged = forgeIn.value.trim();
    if (!forged) { alert('偽のメッセージを入力してください'); return; }
    const base = S.sent;
    let w;
    if (base.mode === 'none') w = { ...base, wire: forged };
    else if (base.mode === 'caesar') w = { ...base, wire: caesar(forged, CAESAR_KEY) };
    else {
      const mine = await newAesKey();
      const { iv, ct } = await aesEncrypt(mine, forged);
      w = { ...base, wire: ct, iv };
    }
    await afterMal('forge', w);
  };

  return wrap;
}

// ---------- 各幕 ----------
function act0() {
  const body = bench({
    modes: ['none', 'caesar'],
    eve: true,
    mallory: false,
    onSendDone: refreshNav,
    onEve: (m) => tick(m === 'none' ? 't0_none' : 't0_caesar'),
  });
  const nav = makeNav('← トップへ', '次へ：Mallory になる →',
    () => flag('t0_none') && flag('t0_caesar'),
    () => showHub(),
    () => go(1));
  return frame(0, {
    name: '1. Eve になって、通信を見る',
    lead: 'あなたは今、Eve。線の上を流れるデータを、ただ眺められる立場です。Alice と Bob の会話を、自分で書き換えて、Eve がどこまで読めるかを確かめましょう。',
    who: 'eve',
    tasks: [
      ['t0_none', '方式「暗号なし」で、自分で書いた文を送り、Eve ボタンで読む'],
      ['t0_caesar', '方式を「シーザー暗号」に変えて送り、Eve ボタンを押して、読める行を探してクリックする'],
    ],
    note: '「送信する」→「Eve：盗み見て…」の順に押します。2つとも終わると、「次へ」が光ります。',
  }, body, nav);
}

function act1() {
  const body = bench({
    modes: ['none', 'caesar'],
    eve: false,
    mallory: true,
    onSendDone: refreshNav,
    onMallory: (what, mode, ok) => {
      if (what === 'flip') tick('t1_flip');
      if (what === 'forge' && ok) tick('t1_forge');
    },
  });
  const nav = makeNav('← 戻る', '次へ：守ってみる →',
    () => flag('t1_flip') && flag('t1_forge'),
    () => go(0), () => go(2));
  return frame(1, {
    name: '2. Mallory になって、書き換える',
    lead: '今度は Mallory。線の上のデータを、書き換えて Bob に渡せる立場です。Alice が送った文を、Bob がそのまま信じてしまうか、試してみましょう。',
    who: 'mallory',
    tasks: [
      ['t1_flip', '送信したあと「Mallory：書き換えてみる」→「1文字を壊す」を押す'],
      ['t1_forge', '「偽メッセージに差し替える」で、Bob に偽の文を受け取らせる'],
    ],
    note: '方式は「暗号なし」でも「シーザー暗号」でも構いません。暗号が弱いと、Mallory は偽物を作れてしまいます。',
  }, body, nav);
}

function act2() {
  const check = () => {
    if (S.flags.eve_aes && S.flags.mal_aes_rejected) tick('t2_win');
  };
  const body = bench({
    modes: ['none', 'caesar', 'aes'],
    eve: true,
    mallory: true,
    onEve: (m) => { if (m === 'aes') { tick('t2_eve'); check(); } },
    onMallory: (what, mode) => { if (mode === 'aes') { tick('t2_mal'); check(); } },
  });
  const nav = makeNav('← 戻る', '次へ：本当の攻撃者は？ →',
    () => flag('t2_win'),
    () => go(1), () => go(3));
  // 守り方を探すヒント
  const hint = el('p', 'atk-lead', 'ヒント：Eve に読まれず、Mallory の書き換えも見抜ける方式を探してみましょう。');
  body.prepend(hint);
  return frame(2, {
    name: '3. 守る側に回って、設定してみる',
    lead: 'Alice と Bob の通信を、あなたが設定して守ります。Eve と Mallory の攻撃を、どちらも防げる方式を探してください。',
    who: 'eve',
    tasks: [
      ['t2_eve', 'Eve の解読を、失敗させる方式にして、Eve ボタンを押す'],
      ['t2_mal', '同じ方式で、Mallory の書き換えを、見抜けるか試す'],
      ['t2_win', '2つとも防げた状態にする（AES-GCM）'],
    ],
    note: '防げたら、「次へ」が光ります。',
  }, body, nav);
}

// ---------- 4幕：本物の攻撃者は、何を狙うか ----------
const WORDS = ['password', 'qwerty', 'admin', 'letmein', 'welcome', 'monkey', 'dragon', 'sunshine', 'iloveyou', 'login',
  'abc', 'alice', 'bob', 'secret', 'himitsu', 'sakura', 'tokyo', 'soccer', 'baseball', 'princess', 'master', 'hello', 'test',
  'guest', 'user', 'root', 'cat', 'dog', 'love', 'happy', 'summer', 'winter', 'football', 'shadow', 'michael', 'jordan', 'cookie',
  'mypass', 'pass', 'passwd', 'computer', 'internet', 'service', 'google', 'family', 'friend', 'angel', 'flower', 'tiger', 'ninja'];
const SUFFIX = ['', '1', '12', '123', '1234', '!', '2026', '2025', '01', '777'];
function candidates() {
  const list = [];
  WORDS.forEach((w) => SUFFIX.forEach((s) => {
    list.push(w + s);
    if (s) list.push(w[0].toUpperCase() + w.slice(1) + s);
  }));
  for (let i = 0; i < 1000; i += 1) list.push(String(i).padStart(i < 10 ? 4 : i < 100 ? 4 : 4, '0'));
  for (let i = 1000; i < 10000; i += 13) list.push(String(i)); // 数字だけの合言葉（一部）
  return [...new Set(list)];
}
function guessTime(pass) {
  let pool = 0;
  if (/[a-z]/.test(pass)) pool += 26;
  if (/[A-Z]/.test(pass)) pool += 26;
  if (/[0-9]/.test(pass)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pass)) pool += 33;
  const total = Math.pow(Math.max(pool, 1), pass.length);
  const sec = total / 2 / 1e10; // 1秒に 100 億回（専用機での、遅くしていない合言葉の想定）
  if (sec < 1) return '1秒未満';
  if (sec < 3600) return `約 ${Math.ceil(sec / 60)} 分`;
  if (sec < 86400 * 365) return `約 ${Math.ceil(sec / 86400)} 日`;
  if (sec < 86400 * 365 * 1e6) return `約 ${Math.round(sec / 86400 / 365).toLocaleString()} 年`;
  return '宇宙の年齢より長い時間';
}

function act3() {
  const root = el('div');
  const body = el('div');
  const intro = el('div', 'atk-verdict is-ok');
  intro.textContent = 'AES-GCM は、Eve にも Mallory にも、破れませんでした。暗号そのものは、もう、攻撃者にも破れません。では、本物の攻撃者は、どこを狙うでしょう？';
  body.append(intro);

  const targets = el('div', 'atk-targets');
  const defs = [
    ['crypto', '暗号そのものを破る', '数学の壁に、正面から挑む'],
    ['config', '設定のミスを突く', '暗号は強くても、鍵のもとになる「合言葉」が弱かったら？'],
    ['human', '人をだます', '暗号を破らずに、持ち主から、聞き出す'],
  ];
  const tBtns = {};
  const sub = el('div');
  defs.forEach(([k, t, d]) => {
    const b = el('button', 'atk-target');
    b.type = 'button';
    b.append(el('b', null, t), el('small', null, d));
    b.onclick = () => {
      S.target = k;
      Object.entries(tBtns).forEach(([kk, bb]) => bb.classList.toggle('is-on', kk === k));
      sub.replaceChildren(k === 'crypto' ? subCrypto() : k === 'config' ? subConfig() : subHuman());
    };
    tBtns[k] = b;
    targets.append(b);
  });
  const mark = (k) => { tBtns[k].classList.add('is-done'); tick(`t3_${k}`); };

  function subCrypto() {
    const box = el('div', 'atk-sub');
    box.append(el('p', null, 'ステージ1〜11で学んだ守りを、すべて組み合わせた通信は、数学的に、現実的な時間では破れません。'));
    const b = el('button', 'button btn-eve', '暗号を破りにいく（もう一度）');
    b.type = 'button';
    const res = el('div');
    b.onclick = async () => {
      res.replaceChildren();
      const key = await newAesKey();
      const { iv, ct } = await aesEncrypt(key, 'ひみつの はなし');
      let n = 0;
      const meter = el('div', 'atk-meter', '試した鍵：0 個');
      res.append(meter);
      for (let i = 0; i < 1500; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await aesDecrypt(await newAesKey(), iv, ct);
        n += 1;
        if (n % 150 === 0) { meter.textContent = `試した鍵：${n.toLocaleString()} 個　読めた：0 件`; await sleep(0); } // eslint-disable-line no-await-in-loop
      }
      res.append(el('div', 'atk-verdict is-ok', '失敗。ここに時間をかけても、攻撃者には、割に合いません。'));
      mark('crypto');
    };
    box.append(b, res);
    return box;
  }

  function subConfig() {
    const box = el('div', 'atk-sub');
    box.append(el('p', null, 'Alice と Bob は、同じ「合言葉」から、AES の鍵を作って通信しています。合言葉は、あなたが決めてください。（この画面の中だけで使い、どこにも送りません）'));
    const f = el('label', 'atk-field', '合言葉');
    const input = el('input');
    input.type = 'text';
    input.value = 'password123';
    input.maxLength = 40;
    input.autocomplete = 'off';
    f.append(input);
    const quick = el('div', 'atk-actions');
    [['よくある合言葉', 'password123'], ['自分の名前と誕生日っぽいもの', 'Taro0415'], ['長くてランダム', 'k3v-Rq8-xw2-ZtL-7mP-9sd']].forEach(([l, v]) => {
      const q = el('button', 'button button-secondary button-quiet', l);
      q.type = 'button';
      q.onclick = () => { input.value = v; };
      quick.append(q);
    });
    const go = el('button', 'button btn-eve', 'Eve：合言葉を、当てにいく');
    go.type = 'button';
    const res = el('div');
    go.onclick = async () => {
      const pass = input.value;
      if (!pass) { alert('合言葉を入れてください'); return; }
      go.disabled = true;
      res.replaceChildren();
      const secret = 'ぜんぶ、よまれる！';
      const key = await keyFromPass(pass);
      const { iv, ct } = await aesEncrypt(key, secret);
      const list = candidates();
      const meter = el('div', 'atk-meter');
      res.append(meter);
      let found = null;
      for (let i = 0; i < list.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const r = await aesDecrypt(await keyFromPass(list[i]), iv, ct);
        if (r.ok) { found = { pass: list[i], text: r.text }; break; }
        if (i % 40 === 0) {
          meter.textContent = `試した合言葉：${i + 1} / ${list.length}　：${list[i]}`;
          await sleep(0); // eslint-disable-line no-await-in-loop
        }
      }
      if (found) {
        meter.textContent = `試した合言葉：当たり！ ${found.pass}`;
        res.append(el('div', 'atk-verdict is-bad',
          `破られました。合言葉は「${found.pass}」。AES は破れていません。鍵のもとになる合言葉が、よくあるものだったので、正面から当てられました。復号結果：「${found.text}」`));
      } else {
        res.append(el('div', 'atk-verdict is-ok',
          'この辞書（約 1,800 語）では、当たりませんでした。ただし、本物の攻撃者の辞書は、もっと大きく、漏れた実際の合言葉も、使います。'));
      }
      res.append(el('p', 'atk-lead', `合言葉の長さと文字の種類から見た、辞書にある合言葉は一瞬で当てられます。辞書にない場合の、総当たりの目安：${guessTime(pass)}（1秒に100億回試せる専用機を想定した、簡易の計算）`));
      go.disabled = false;
      mark('config');
    };
    box.append(f, quick, go, res);
    return box;
  }

  function subHuman() {
    const box = el('div', 'atk-sub');
    box.append(el('p', null, 'Mallory は、暗号に触れず、Alice に「Bob のふりをした連絡」を送ります。この画面では、だます側が使う手口の「特徴」を選ぶと、Alice がだまされる確率の目安が、出ます。（架空の数値による、簡易モデルです）'));
    const cues = [
      ['急ぎだ、と焦らせる', 25],
      ['Bob のいつもの口調で書く', 20],
      ['Bob しか知らないはずの話題を入れる（Eve が盗み見て、知ったもの）', 30],
      ['「電話で確認しないで」と、念を押す', 15],
    ];
    const sel = new Set();
    const bar = el('div', 'atk-bar');
    const fill = el('i');
    bar.append(fill);
    const label = el('div', 'atk-meter');
    const safe = el('input');
    safe.type = 'checkbox';
    const checks = el('div', 'atk-checks');
    cues.forEach(([t, v], i) => {
      const l = el('label');
      const c = el('input');
      c.type = 'checkbox';
      c.onchange = () => { c.checked ? sel.add(i) : sel.delete(i); paint(); };
      l.append(c, t);
      checks.append(l);
    });
    const sl = el('label');
    sl.append(safe, '【Alice の対策】本人に、別の連絡手段（電話・対面）で、確かめる');
    safe.onchange = () => paint();
    const paint = () => {
      let p = 10;
      sel.forEach((i) => { p += cues[i][1]; });
      p = Math.min(95, p);
      if (safe.checked) p = 5;
      fill.style.width = `${p}%`;
      label.textContent = `Alice がだまされる確率（目安）：${p}%`;
      if (sel.size >= 2 && !S.flags.human_seen) { S.flags.human_seen = true; }
    };
    paint();
    checks.append(sl);
    const done = el('button', 'button btn-mal', 'この内容で、Alice に送る（想定）');
    done.type = 'button';
    const res = el('div');
    done.onclick = () => {
      const p = parseInt(label.textContent.replace(/\D+/g, ''), 10);
      res.replaceChildren(el('div', `atk-verdict ${p >= 50 ? 'is-bad' : 'is-ok'}`,
        p >= 50
          ? '暗号は 1 ビットも破られていないのに、Alice が自分から、合言葉や情報を、渡してしまいました。'
          : '「別の手段で本人に確かめる」だけで、この攻撃は、ほとんど成り立たなくなります。'));
      mark('human');
    };
    box.append(checks, bar, label, done, res);
    return box;
  }

  body.append(targets, sub);
  const nav = makeNav('← 戻る', 'まとめを見る →',
    () => flag('t3_config') && flag('t3_human'),
    () => go(2), () => go(4));
  const tail = frame(3, {
    name: '4. 本物の攻撃者は、何を狙う？',
    lead: '3つの狙い目を、順に試してください。',
    who: 'mallory',
    tasks: [
      ['t3_crypto', '「暗号そのものを破る」を試す'],
      ['t3_config', '「設定のミスを突く」を試す（合言葉を選ぶ）'],
      ['t3_human', '「人をだます」を試す'],
    ],
    note: '3つとも試すと、「まとめを見る」が光ります。',
  }, body, nav);
  root.append(tail);
  return root;
}

function finale() {
  localStorage.setItem(DONE_KEY, '1');
  const root = el('div', 'atk-panel');
  const f = el('div', 'atk-final');
  f.append(chr('alice', 56));
  f.append(el('h2', null, '暗号は、もう、破れない。破られるのは、「人」と「設定」。'));
  f.append(el('p', null, 'あなたが学んだ暗号・MAC・署名・証明書・TLS は、数学の力で、通信を守ります。だから本物の攻撃者は、そこを避けて、守る側の「人」と「設定のミス」を狙います。'));
  const ul = el('ul');
  [
    '合言葉は、長く、使い回さない（弱いと、AES でも、正面から当てられる）',
    '急ぎの連絡・いつもと違う頼みごとは、別の手段（電話・対面）で、本人に確かめる',
    '設定は、初期値のままにしない。更新を、後回しにしない',
    '守りに 100% は、ない。だから、仕組みを知って、考え続ける',
  ].forEach((t) => ul.append(el('li', null, t)));
  f.append(ul);
  f.append(el('p', 'atk-big', '今送ったその情報、本当に大丈夫？'));
  const row = el('div', 'atk-actions');
  const home = el('button', 'button button-secondary', 'ステージ一覧へ戻る');
  home.type = 'button';
  home.onclick = () => showHub();
  const again = el('button', 'button button-secondary', 'もう一度、やってみる');
  again.type = 'button';
  again.onclick = () => { S.flags = {}; S.sent = null; S.mode = 'none'; go(0); };
  row.append(home, again);
  f.append(row);
  f.append(el('p', 'atk-guide-note', 'これは教材用のシミュレーションです。実在の通信・他人のアカウントに、同じことをしてはいけません。'));
  root.append(f);
  return root;
}

const RENDER = [act0, act1, act2, act3, finale];
function go(i) {
  S.act = i;
  S.sent = null;
  S.wireNow = null;
  app.replaceChildren(RENDER[i]());
  window.scrollTo({ top: 0 });
  refreshNav();
}

function locked() {
  app.replaceChildren();
  const p = el('div', 'atk-locked');
  p.append(el('p', null, 'この画面は、エピローグをクリアすると、遊べます。'));
  const a = el('a', 'button button-primary', 'トップへ戻る');
  a.href = 'index.html';
  p.append(a);
  app.append(p);
}

// 一覧（裏面のホーム）へ戻る
function showHub() { location.href = 'attacker.html'; }

go(0);
