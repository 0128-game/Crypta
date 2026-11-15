// atk-play.js
// 攻撃者ステージの「遊ぶ画面」。マイクラのように、道具を選んで、物をクリックして操作する。
//   拾う（コピー）/ 奪う / 取り替える / 合わせる / 計算する / 書き換える / 再送する / 遅らせる / 試す / 調べる
// 判定は、台本ではなく、ステージごとの「受け取る側のルール」（scenario.bob）で行う。
// 通信はすべて、この画面の中だけ。外部には、何も、送らない。

import { makeCharacter } from './characters.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ---------- 道具の部品（教材用のしくみ） ----------
export function fnv(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}
const GROUPS = [[0x41, 26], [0x61, 26], [0x30, 10], [0x3041, 83], [0x30a1, 86]];
export function caesar(text, k) {
  return [...text].map((ch) => {
    const c = ch.codePointAt(0);
    for (const [b, n] of GROUPS) if (c >= b && c < b + n) return String.fromCodePoint(b + ((((c - b + k) % n) + n) % n));
    return ch;
  }).join('');
}
function scramble(seed, n = 12) {
  let h = parseInt(fnv(seed), 16);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    out.push((h >>> 24).toString(16).padStart(2, '0'));
  }
  return out.join(' ');
}
let UID = 0;
export const uid = () => { UID += 1; return `i${UID}`; };
export const pkt = (o = {}) => ({ id: uid(), kind: 'packet', from: 'alice', to: 'bob', body: '', enc: null, hash: null, mac: null, sig: null, seq: null, cert: null, ...o });
export const item = (o = {}) => ({ id: uid(), ...o });
const clone = (x) => ({ ...JSON.parse(JSON.stringify(x)), id: uid() });

export function shownText(p) {
  if (p.corrupt) return '▒▒▒▒▒▒';
  if (!p.enc) return p.body;
  if (p.enc.alg === 'caesar' || p.enc.alg === 'tls10') return caesar(p.body, 3);
  return `${scramble(p.enc.keyId + p.body)} …`;
}
const ALG = { caesar: 'シーザー', aes: 'AES', rsa: 'RSA', rsa2048: 'RSA-2048', tls13: 'TLS 1.3', tls10: 'TLS 1.0（古い）' };
function chips(p) {
  const c = [];
  if (p.enc) c.push(`暗号：${ALG[p.enc.alg] ?? p.enc.alg}`);
  if (p.hash) c.push(`指紋 ${p.hash.slice(0, 4)}`);
  if (p.mac) c.push('MAC');
  if (p.sig) c.push('署名');
  if (p.seq != null) c.push(`番号 ${p.seq}`);
  if (p.cert) c.push(p.cert.valid ? '証明書' : '自己署名の証明書');
  return c;
}
function itemTitle(it) {
  if (it.kind === 'packet') return it.invTitle ?? it.label ?? '通信';
  return it.label ?? it.kind;
}
function itemBody(it) {
  if (it.kind === 'packet') return shownText(it);
  if (it.kind === 'key') return `鍵：${it.keyName ?? it.keyId}`;
  if (it.kind === 'hash') return `指紋 ${it.value}`;
  if (it.kind === 'mac') return `MAC ${it.value}`;
  if (it.kind === 'text') return it.text;
  return it.text ?? '';
}

// ---------- 止め方の説明（結果パネルと、表面で止まる様子を見て戻ったときの画面で、共通） ----------
export function defenseBlock(sc) {
  const out = [];
  out.push(el('p', 'atk-principle', `考え方：${sc.principle}`));
  const df = el('div', 'atk-defense');
  df.append(el('b', null, '止め方'), el('p', null, `止める技術：${sc.tech ?? ''}`), el('p', null, `守る側（表面）は、どう考えれば防げたか：${sc.defense}`));
  out.push(df);
  if (sc.challenge) {
    const cb = el('button', 'button button-secondary button-quiet atk-ch-open', `${sc.challenge.title}（評価には関係しません）`); cb.type = 'button'; cb.id = 'atk-challenge';
    cb.onclick = () => openChallengeFor(sc); out.push(cb);
  }
  if (sc.id === 'a10') {
    out.push(el('p', 'atk-closing', '守るために、知る。——これが、この裏面の、はじめから終わりまでの目的でした。'));
    out.push(el('p', 'atk-closing', '今回作ったツールみたいに、自分が作りたいものも、プログラムで作ってみよう。'));
  }
  return out;
}
// 自作チャレンジ：ゲームの外でツールを作り、出てきた答えを入力する（評価には、関係しない）
export function openChallengeFor(sc) {
  const ch = sc.challenge; if (!ch) return;
  const back = el('div', 'atk-modal-back'); const box = el('div', 'atk-modal');
  box.append(el('h2', null, ch.title), el('p', 'atk-lead', ch.text));
  if (ch.show) box.append(el('p', 'atk-slide-out', `暗号文：${ch.show}`));
  if (ch.hint) box.append(el('p', 'atk-lead', ch.hint));
  box.append(el('p', 'atk-lead', '自分で書いても、AI に頼んでもかまいません。ゲームは、答えが合っているかだけを、確かめます（評価には、関係しません）。'));
  box.append(el('p', 'atk-lead', 'AI を使えば、プログラミングが苦手な人でも、攻撃のツールが作れてしまう。それが、今の攻撃の現実です。'));
  const input = document.createElement('input'); input.type = 'text'; input.id = 'atk-ch-input'; input.maxLength = 120;
  const f = el('label', 'atk-field', '答え'); f.append(input);
  const res = el('p', 'atk-lead', ''); res.id = 'atk-ch-res';
  const row = el('div', 'atk-modal-actions');
  const c = el('button', 'button button-secondary', 'とじる'); c.type = 'button';
  const okb = el('button', 'button button-primary', '答えを確かめる'); okb.type = 'button'; okb.id = 'atk-ch-ok';
  c.onclick = () => back.remove();
  okb.onclick = () => { res.textContent = input.value.trim() === ch.answer ? '正解です。ツールは、うまく動いています。' : '答えが、合っていません。もう一度、確かめてみよう。'; };
  row.append(c, okb); box.append(f, res, row); back.append(box); document.body.append(back);
}

// ---------- 画面 ----------
export function playScenario(root, scenario, hooks = {}) {
  const S = {
    phase: 0, tool: 'pick', sel: null, tick: 0, round: 0,
    inv: [], wire: [], lying: [], log: [], flags: {}, msgs: [], effort: [], done: false, moves: 0, brute: false,
  };
  const agg = {};
  const P = () => scenario.phases[S.phase];

  const tools = {
    pick: ['拾う', 'コピーを持ち物に入れる。元の物は、そのまま流れる'],
    grab: ['奪う', '流れている物を、持ち物に入れる。Bob には、届かなくなる'],
    swap: ['取り替える', '持ち物の物を選び、流れている物をクリックして、差し替える'],
    combine: ['合わせる', '持ち物から2つ選ぶ（暗号文＋鍵、通信＋指紋 など）'],
    compute: ['計算する', '持ち物の物から、指紋（ハッシュ）や MAC を作る'],
    edit: ['書き換える', '持ち物の物の、本文を書き換える'],
    replay: ['再送する', '持ち物の物を、もう一度、線に流す'],
    reorder: ['順番を入れ替える', '流れている通信と、次の通信の、届く順番を入れ替える'],
    delay: ['遅らせる', '流れている物を、2ステップ遅らせる'],
    try: ['試す', '解読を試す。手間の見積もりも、出る'],
    inspect: ['調べる', '物の種類・置き場所・手間を、確かめる'],
    compose: ['文面を作る', '連絡の文面を、手口を選んで作る'],
  };

  // 短い通知：盤面の上に、一瞬だけ出す（メッセージボックスの「結果」列は、廃止）
  let toastTimer = null;
  function say(text, tone = '') {
    S.msgs.unshift({ text, tone }); S.msgs = S.msgs.slice(0, 6);
    let t = document.getElementById('atk-toast');
    if (!t) { t = el('div', 'toast atk-toast'); t.id = 'atk-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.append(t); }
    t.textContent = text; t.hidden = false; t.dataset.tone = tone;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
  }
  const flag = (k) => { S.flags[k] = true; };
  const api = { S, say, flag, pkt, item, clone, fnv, caesar, shownText };

  function startPhase(i) {
    if (i === 0) Object.keys(agg).forEach((k) => delete agg[k]);
    S.phase = i; S.moves = 0; S.brute = false; S.round = 0; S.tick = 0; S.log = []; S.flags = {}; S.msgs = []; S.effort = []; S.pick = null; S.pending = null; S.recorded = false; S.celebrated = false; S.resultClosed = false; S.stopSeen = false;
    S.inv = (P().inv?.(api) ?? []).map((x) => ({ ...x }));
    S.lying = (P().lying?.(api) ?? []).map((x) => ({ ...x }));
    newWire();
    S.tool = P().tools[0];
    S.sel = null;
    view.touched = false;
    render();
  }
  function newWire() {
    const list = P().makeWire(S.round, api) ?? [];
    S.wire = list.map((p, i) => ({ p, eta: i + 1, state: 'wait', id: uid() }));
    S.tick = 0;
  }

  // ----- 操作 -----
  const find = (id) => S.inv.find((x) => x.id === id);
  const slotOf = (id) => S.wire.find((s) => s.id === id);
  const addInv = (it) => { S.inv.push(it); if (S.inv.length > 12) S.inv.shift(); };

  async function onTarget(type, id) {
    const T = S.tool;
    if (S.done) return;
    // ---- 流れている物 ----
    if (type === 'slot') {
      const s = slotOf(id);
      if (!s || s.state !== 'wait') return;
      const p = s.p;
      if (T === 'pick' || T === 'inspect' || T === 'try') s.analysed = true;
      if (T === 'pick') { const cp = clone(p); cp.invTitle = `線 ${S.wire.indexOf(s) + 1} のコピー`; addInv(cp); flag('pick'); flag(`pick:${p.label ?? p.kind}`); say('コピーを持ち物に入れた。元の通信は、そのまま流れる。', 'ok'); P().onUse?.('pick', p, api); }
      else if (T === 'grab') { s.state = 'grabbed'; addInv(clone(p)); S.log.push({ pkt: p, res: { ok: false, missed: true, note: 'Bob には、届きませんでした' } }); flag('grab'); say('通信を奪った。Bob には、届かない。', 'ok'); }
      else if (T === 'delay') { s.eta += 2; s.modified = true; flag('delay'); say(`この通信を、2ステップ遅らせた（届くのは ${s.eta} ステップ目）。`, 'ok'); }
      else if (T === 'reorder') {
        const other = S.wire.filter((x) => x.state === 'wait' && x.id !== s.id).sort((a, b) => a.eta - b.eta)[0];
        if (!other) say('入れ替える相手の通信が、ありません。', 'bad');
        else { const t = s.eta; s.eta = other.eta; other.eta = t; s.modified = true; flag('reorder'); say('届く順番を、入れ替えた。', 'ok'); }
      }
      else if (T === 'inspect') { say(`線 ${S.wire.indexOf(s) + 1}：${wireInfo(p).text}`, ''); flag('inspect'); flag(`inspect:${p.label ?? p.kind}`); P().onUse?.('inspect', p, api); }
      else if (T === 'try') { await doTry(p); }
      else if (T === 'swap') {
        const src = S.sel && find(S.sel);
        if (!src) { say('先に、持ち物から、差し替えたい物を選んでください。', 'bad'); }
        else if (src.kind !== 'packet') { say('通信（手紙）の形をした物しか、取り替えられません。', 'bad'); }
        else { S.log.push({ note: `取り替え：${p.label ?? '通信'} → ${src.label ?? '通信'}` }); s.p = { ...src, id: uid() }; s.modified = true; S.inv = S.inv.filter((x) => x.id !== src.id); addInv(clone(p)); S.sel = null; flag('swap'); say('通信を取り替えた。「流す」が押せるようになったら、流そう。', 'ok'); }
      }
      else say('この道具では、流れている物は、操作できません。', 'bad');
      render();
      return;
    }
    // ---- 公開ゾーンに落ちている物 ----
    if (type === 'lying') {
      const it = S.lying.find((x) => x.id === id);
      if (!it) return;
      if (T === 'pick' || T === 'grab') {
        if (it.noPick) { say('これは、持ち出せません。調べるだけにしましょう。', 'bad'); }
        else { addInv(clone(it)); flag('pick'); flag(`pick:${it.label}`); say(`「${it.label}」のコピーを、持ち物に入れた。`, 'ok'); it.onPick?.(api); P().onUse?.('pick', it, api); }
      } else if (T === 'inspect') { it.revealed = true; flag(`inspect:${it.label}`); P().onUse?.('inspect', it, api); }
      else if (T === 'try') { await doTry(it); }
      else say('この道具では、これは、操作できません。', 'bad');
      render();
      return;
    }
    // ---- 持ち物 ----
    if (type === 'inv') {
      const it = find(id);
      if (!it) return;
      if (T === 'inspect') {
        flag('inspect'); flag(`inspect:${it.label ?? it.kind}`);
        if (it.kind === 'packet' && (it.enc?.alg === 'caesar' || it.enc?.alg === 'tls10') && !it.corrupt) { S.moves += 1; await doTry(it); } // 総当たりは、何通り試しても1手
        else say(`${itemTitle(it)}：${it.kind === 'packet' ? wireInfo(it).text : itemBody(it)}`, '');
      }
      else if (T === 'swap') { S.sel = S.sel === id ? null : id; say(S.sel ? '選んだ。次に、流れている通信をクリックして、取り替えます。' : '選択を外した。', ''); }
      else if (T === 'combine') {
        if (!S.sel || S.sel === id) { S.sel = id; say('1つ目を選んだ。もう1つ、合わせたい物をクリック。', ''); }
        else { const a = find(S.sel); S.sel = null; combine(a, it); }
      } else if (T === 'compute') { await computeMenu(it); }
      else if (T === 'edit') { await editItem(it); }
      else if (T === 'replay') {
        if (it.kind !== 'packet') say('通信の形をした物だけ、再送できます。', 'bad');
        else { S.wire.push({ p: { ...JSON.parse(JSON.stringify(it)), id: uid(), replayed: true }, eta: S.wire.filter((s) => s.state === 'wait').length + S.tick + 1, state: 'wait', id: uid() }); flag('replay'); say('持ち物の通信を、もう一度、線に流した。', 'ok'); }
      } else if (T === 'try') { await doTry(it); }
      else if (T === 'pick') say('持ち物の物は、すでに、持っています。', '');
      else say('この道具では、持ち物は、操作できません。', 'bad');
      render();
    }
  }

  async function doTry(it) {
    flag('try'); flag(`try:${it.label ?? it.kind}`);
    if (it.kind === 'packet' && it.enc?.alg && (it.enc.alg === 'caesar' || it.enc.alg === 'tls10')) {
      const out = await bruteCaesar(it);
      if (out) { addInv(item({ kind: 'text', label: '解読した本文', text: it.body })); flag('decoded'); say('解読できた。本文が、持ち物に入った。', 'ok'); P().onUse?.('decoded', it, api); }
      return;
    }
    if (it.tryResult) {
      const r = it.tryResult(api);
      say(r.text, r.ok ? 'ok' : 'bad');
      if (r.ok && r.gain) { addInv(r.gain); }
      if (r.effort) S.effort.push(r.effort);
      return;
    }
    if (it.kind === 'packet' && it.enc) {
      if (!P().noBrute) S.brute = true; // 力ずくで試した
      say(`${ALG[it.enc.alg] ?? '暗号'}は、試しても、解けませんでした。手間：${it.attackCost ?? 'ほぼ、無限'}。`, 'bad');
      return;
    }
    say('試せる物ではありません。', 'bad');
  }

  // 内蔵ツール：シフト量のスライダー（26通りを切り替えて試せる）。26通りを一度に出すのは、力ずく
  async function bruteCaesar(it) {
    return new Promise((resolve) => {
      const back = el('div', 'atk-modal-back'); const box = el('div', 'atk-modal');
      box.append(el('h2', null, '内蔵ツール：ずらし幅を、動かして、試す'), el('p', 'atk-lead', 'スライダーを動かすと、その幅で、元に戻した文が出ます。読めたら「これで読めた」。'));
      const cipher = shownText(it);
      const lab = el('p', 'atk-slide-k', '幅 0'); const out = el('p', 'atk-slide-out', cipher); const note = el('p', 'atk-lead', '');
      const sl = document.createElement('input'); sl.type = 'range'; sl.min = '0'; sl.max = '25'; sl.value = '0'; sl.id = 'atk-slider'; sl.className = 'atk-slider';
      let last = 0;
      sl.oninput = () => { const k = Number(sl.value); lab.textContent = `幅 ${k}`; out.textContent = caesar(cipher, -k); last = k; note.textContent = ''; };
      const row = el('div', 'atk-modal-actions');
      const cancel = el('button', 'button button-secondary', 'やめる'); cancel.type = 'button';
      const all = el('button', 'button button-secondary', '26通りを一度に出す（総当たり）'); all.type = 'button'; all.id = 'atk-slide-all';
      const okb = el('button', 'button button-primary', 'これで読めた'); okb.type = 'button'; okb.id = 'atk-slide-ok';
      okb.onclick = () => { if (last === 3) { back.remove(); resolve(true); } else note.textContent = 'まだ、読めません。'; };
      cancel.onclick = () => { back.remove(); resolve(false); };
      all.onclick = () => {
        // 総当たりは、何通り試しても、まとめて1手（「調べる」の1手に含まれる）。弱点そのものなので、力ずくには数えない
        const list = el('ul', 'atk-brute');
        for (let k = 1; k <= 25; k += 1) { const li = el('li'); li.append(el('span', 'k', `幅 ${k}`), el('span', null, caesar(cipher, -k))); li.dataset.k = String(k); list.append(li); }
        list.onclick = (ev) => { const li = ev.target.closest('li'); if (!li) return; if (Number(li.dataset.k) === 3) { back.remove(); resolve(true); } else li.classList.add('is-miss'); };
        box.replaceChildren(el('h2', null, '総当たり：全部の幅を、一度に出す'), el('p', 'atk-lead', '読める行を、クリックしてください。'), list, cancel);
      };
      row.append(cancel, all, okb);
      box.append(lab, sl, out, note, row); back.append(box); document.body.append(back);
    });
  }

  function combine(a, b) {
    const pair = (x, y) => [a, b].find((i) => i.kind === x) && [a, b].find((i) => i.kind === y);
    const get = (k) => [a, b].find((i) => i.kind === k);
    if (a.kind === 'packet' && b.kind === 'packet') {
      const kp = [a, b].find((x) => x.carries); const cp = [a, b].find((x) => x.enc);
      if (kp && cp) {
        if (cp.enc.keyId === kp.carries.keyId) { addInv(item({ kind: 'text', label: '解読した本文', text: cp.body })); flag('decoded'); say('鍵が合った。本文が、持ち物に入った。', 'ok'); P().onUse?.('decoded', cp, api); }
        else say('鍵が合いません。壊れたデータが出てきただけでした。', 'bad');
        return;
      }
    }
    if (pair('packet', 'key')) {
      const p = get('packet'); const k = get('key');
      if (!p.enc) { say('この通信は、暗号化されていません。鍵は、要りません。', ''); return; }
      if (p.enc.alg === 'tls13') { say('TLS 1.3 の通信は、手元の鍵では、開きません。', 'bad'); return; }
      if (k.opens?.includes(p.enc.keyId)) {
        addInv(item({ kind: 'text', label: '解読した本文', text: p.body })); flag('decoded'); say('鍵が合った。本文が、持ち物に入った。', 'ok'); P().onUse?.('decoded', p, api);
      } else { say('鍵が合いません。壊れたデータが出てきただけでした。', 'bad'); }
      return;
    }
    if (pair('packet', 'hash')) {
      const p = clone(get('packet')); p.hash = get('hash').value; S.inv = S.inv.filter((x) => x.id !== a.id && x.id !== b.id); addInv(p); say('通信に、指紋を付けた。', 'ok'); flag('attachHash'); return;
    }
    if (pair('packet', 'mac')) {
      const p = clone(get('packet')); p.mac = { keyId: get('mac').keyId, tag: get('mac').value }; S.inv = S.inv.filter((x) => x.id !== a.id && x.id !== b.id); addInv(p); say('通信に、MAC を付けた。', 'ok'); return;
    }
    say('この2つは、合わせられません。', 'bad');
  }

  async function computeMenu(it) {
    if (it.kind !== 'packet' && it.kind !== 'text') { say('通信か、本文だけ、計算できます。', 'bad'); return; }
    const body = it.kind === 'packet' ? it.body : it.text;
    const back = el('div', 'atk-modal-back');
    const box = el('div', 'atk-modal');
    box.append(el('h2', null, '何を計算する？'), el('p', 'atk-lead', `対象の本文：「${body}」`));
    const row = el('div', 'atk-modal-actions');
    const h = el('button', 'button button-primary', '指紋（ハッシュ）');
    const macKey = S.inv.find((x) => x.kind === 'key' && x.macKey);
    const m = el('button', 'button btn-mal', macKey ? 'MAC（鍵つきの指紋）' : 'MAC（鍵がないので、作れない）');
    if (!macKey) { m.disabled = true; m.title = 'MAC を作る鍵は、Alice と Bob の霧の中にあり、拾えません'; }
    const c = el('button', 'button button-secondary', 'やめる');
    [h, m, c].forEach((b) => { b.type = 'button'; });
    row.append(c, m, h); box.append(row); back.append(box); document.body.append(back);
    await new Promise((resolve) => {
      c.onclick = () => { back.remove(); resolve(); };
      h.onclick = () => {
        back.remove();
        addInv(item({ kind: 'hash', label: '指紋', value: fnv(body), of: body }));
        flag('computeHash'); say('指紋を計算した。誰でも作れる。持ち物に入った。', 'ok'); render(); resolve();
      };
      m.onclick = () => {
        const key = S.inv.find((x) => x.kind === 'key' && x.macKey);
        if (!key) { flag('macFailed'); say('MAC は、鍵がないと、作れません。その鍵は、Alice と Bob の霧の中にあり、拾えません。', 'bad'); }
        else { addInv(item({ kind: 'mac', label: 'MAC', value: fnv(`${key.keyId}|${body}`), keyId: key.keyId })); say('MAC を作った。', 'ok'); }
        back.remove(); resolve();
      };
    });
  }

  async function editItem(it) {
    if (it.kind !== 'packet' && it.kind !== 'text') { say('通信か、本文だけ、書き換えられます。', 'bad'); return; }
    const cur = it.kind === 'packet' ? (it.enc ? shownText(it) : it.body) : it.text;
    const t = await askText(it.enc ? '暗号文は、書き換えると、壊れます' : '本文を書き換える', cur);
    if (t == null) return;
    if (it.kind === 'packet') { if (it.enc) { it.corrupt = true; say('暗号文を書き換えた。中身は、壊れたはず。', ''); } else { it.body = t; say('本文を書き換えた。', 'ok'); } }
    else it.text = t;
    flag('edit');
  }

  function askText(title, initial) {
    return new Promise((resolve) => {
      const back = el('div', 'atk-modal-back');
      const box = el('div', 'atk-modal');
      box.append(el('h2', null, title));
      const f = el('label', 'atk-field', '本文');
      const input = document.createElement('input');
      input.type = 'text'; input.value = initial; input.maxLength = 60; input.id = 'atk-edit-input';
      f.append(input);
      const row = el('div', 'atk-modal-actions');
      const c = el('button', 'button button-secondary', 'やめる'); c.type = 'button';
      const ok = el('button', 'button button-primary', '決定'); ok.type = 'button'; ok.id = 'atk-edit-ok';
      c.onclick = () => { back.remove(); resolve(null); };
      ok.onclick = () => { const v = input.value; back.remove(); resolve(v); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });
      row.append(c, ok); box.append(f, row); back.append(box); document.body.append(back); input.focus();
    });
  }

  // 進める: 次に届く通信を、霧の向こうへ流す。向こうでどう処理されたかは、攻撃者には見えない。
  function advance() {
    if (S.done) return;
    const waiting = S.wire.filter((s) => s.state === 'wait').sort((a, b) => a.eta - b.eta);
    if (waiting.length === 0) { S.round += 1; newWire(); say('Alice が、次の通信を送った。', ''); render(); return; }
    const s = waiting[0];
    // 「流す」は、手数に数えない（時間を進めるだけ）
    S.tick = s.eta;
    s.state = 'done';
    const res = P().bob(s.p, api, s) ?? { ok: true };
    S.log.push({ pkt: s.p, res, tick: S.tick });
    say('通信は、霧の向こうへ流れていった。向こうでどうなったかは、ここからは、見えない。', '');
    P().onDeliver?.(s.p, res, api);
    checkGoals();
    render();
  }

  function checkGoals() {
    P().goals.forEach((g) => { if (!S.flags[`goal:${g.key}`] && g.test(api)) { S.flags[`goal:${g.key}`] = true; } });
  }
  const allDone = () => P().goals.every((g) => S.flags[`goal:${g.key}`]);

  // ----- 選んだ物に対する、コマンド（下のメッセージボックスに出る） -----
  const MENU = {
    slot: ['pick', 'grab', 'swap', 'delay', 'reorder', 'inspect', 'try'],
    lying: ['pick', 'inspect', 'try'],
    inv: ['inspect', 'edit', 'compute', 'combine', 'replay', 'try'],
  };
  const CMD = { pick: 'コピーする', grab: '止める（奪う）', reorder: '順番を入れ替える', swap: '取り替える…', delay: '遅らせる', inspect: '調べる', try: '解読を試す', edit: '書き換える', compute: '計算する…', combine: '合わせる…', replay: '再送する', compose: '文面を作る（Alice に送る）' };
  // 新しい手の説明（はじめて出てきたときは「NEW」と一緒に、下に出す。いつでも、ボタンに重ねると読める）
  const CMD_DESC = {
    pick: 'コピーを持ち物に入れる。元の通信は、そのまま流れていく（気づかれない）。',
    grab: '流れている通信を、線から取り上げる。Bob には、届かなくなる。',
    swap: '線の上の通信を、持ち物の通信と、差し替える。',
    delay: 'この通信が届くのを、2つ分、遅らせる。',
    reorder: 'この通信と、次の通信の、届く順番を入れ替える。',
    inspect: '何なのかを確かめる。線の上に、名前が出る（手数に数えない）。',
    try: '力ずくで解読を試す。強い暗号には、ほぼ無限の時間がかかる。',
    edit: '持ち物の通信の本文を書き換える。暗号文は、読めなくても壊せる。',
    compute: '本文から、指紋（ハッシュ）などを計算する。',
    combine: '持ち物の2つを合わせる（暗号文＋鍵 で解読、通信＋指紋 で付け直し など）。',
    replay: '持ち物の通信を、もう一度、線に流す。',
    compose: '拾った情報を材料に、Bob のふりをした連絡を作って、Alice に送る。',
  };
  const SEEN_KEY = 'crypta:atk:seenCmd';
  const seenCmds = (() => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { return new Set(); } })();
  const markSeen = (c) => { if (seenCmds.has(c)) return; seenCmds.add(c); try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenCmds])); } catch { /* なし */ } };
  const TYPE_NAME = { slot: '流れている通信', lying: '落ちている物', inv: '持ち物' };
  const isText = (x) => x && (x.kind === 'packet' || x.kind === 'text');
  // いまは、できない手（グレーにして、理由を出す）
  function cantDo(c, type, x) {
    if (!x) return '';
    if (c === 'swap' && !S.inv.some((i) => i.kind === 'packet')) return '持ち物に、差し替えられる通信がありません';
    if (c === 'reorder' && !S.wire.some((s) => s.state === 'wait' && s.p !== x)) return '入れ替える相手の通信がありません';
    if (c === 'pick' && type === 'lying' && x.noPick) return 'これは、持ち出せません';
    if (c === 'try') {
      if (x.tryResult) return '';
      if (x.kind === 'packet' && x.enc) return '';
      return '暗号になっていないので、試す必要がありません';
    }
    if ((c === 'edit' || c === 'compute') && !isText(x)) return '通信か、本文だけです';
    if (c === 'replay' && x.kind !== 'packet') return '通信の形をした物だけです';
    if (c === 'combine' && S.inv.filter((i) => i.id !== x.id).length === 0) return '合わせる相手が、持ち物にありません';
    return '';
  }

  function selectTarget(type, id) {
    if (S.pending) { // 「何と取り替える？」の最中は、持ち物から選ぶ
      if (type === 'inv') { const it = find(id); if (it && S.pending.ok(it)) S.pending.go(it); }
      return;
    }
    S.pick = { type, id };
    render();
  }
  function runCmd(c) {
    markSeen(c);
    if (c === 'compose') { openCompose(); return; }
    const { type, id } = S.pick;
    if (c === 'swap') {
      S.pending = { title: '取り替える：右の持ち物から、差し込む通信を選んでください', ok: (x) => x.kind === 'packet', go: (it) => { S.pending = null; S.tool = 'swap'; S.sel = it.id; S.moves += 1; onTarget('slot', id); } };
      render(); return;
    }
    if (c === 'combine') {
      S.pending = { title: '合わせる：右の持ち物から、もう1つを選んでください', ok: (x) => x.id !== id, go: (it) => { S.pending = null; S.tool = 'combine'; S.sel = id; S.moves += 1; onTarget('inv', it.id); } };
      render(); return;
    }
    S.tool = c; S.sel = null;
    if (c !== 'inspect') S.moves += 1; // 調べる（見るだけ）は、数えない
    onTarget(type, id);
  }

  // ----- 色と文字（調べた線だけ。表面と同じ考え方） -----
  // 表面（engine.js の COLORS・凡例）と同じ色。データの線は実線、鍵の線は点線
  const KIND_COLOR = { plain: '#D9892F', cipher: '#53679B', key: '#747093', proof: '#347C79', bad: '#A65361', garbled: '#8A93A3' };
  const KIND_NAME = { plain: '平文', cipher: '暗号文', key: '鍵', proof: '確認用の印', bad: '改ざん・偽物', garbled: '壊れたデータ' };
  const isKeyPkt = (p) => Boolean(p.carries || p.pubkey || p.wrapsKey);
  function wireInfo(p) {
    const extra = [];
    if (p.hash) extra.push('指紋つき');
    if (p.mac) extra.push('MAC');
    if (p.sig) extra.push('署名');
    if (p.seq != null) extra.push(`番号${p.seq}`);
    if (p.cert) extra.push(p.cert.valid ? '証明書' : '自己署名の証明書');
    let kind = 'plain'; let text = `本文「${p.body}」`;
    if (p.corrupt) { kind = 'garbled'; text = '壊れたデータ'; }
    else if (p.enc && isKeyPkt(p)) { kind = 'cipher'; text = `暗号化された鍵（${ALG[p.enc.alg] ?? p.enc.alg}）`; }
    else if (p.enc) { kind = 'cipher'; text = `暗号文（${ALG[p.enc.alg] ?? p.enc.alg}）`; }
    else if (p.carries) { kind = 'key'; text = '鍵（暗号文を開く共通鍵）が、そのまま'; }
    else if (p.pubkey) { kind = 'key'; text = p.from === 'mallory' ? '公開鍵（中身は Mallory の鍵）' : '公開鍵（Bob の鍵）'; }
    else if (p.cert || p.sig) kind = 'proof';
    return { kind, key: isKeyPkt(p), text: extra.length ? `${text} ＋ ${extra.join('・')}` : text };
  }

  const TUTORIAL = () => scenario.tutorial && S.phase === 0 ? scenario.tutorial : null;
  function tutorialStep() {
    const t = TUTORIAL();
    const i = t.findIndex((x) => !(x.ok ? x.ok(S) : false));
    return i < 0 ? t.length - 1 : i;
  }

  // ----- 画面の割り付け：上が回路（盤面）、下が作業スペース。間の仕切りを、ドラッグで動かせる -----
  const ZR = { alice: [0, 240], public: [240, 1680], bob: [1680, 1920] };
  const WORLD_W = 1920; const WALL = 14;
  const ZTAG = { alice: '送り手側（見えない）', public: '公開ゾーン（誰でも見られる）', bob: '受け手側（見えない）' };
  const ZTAG_OPEN = { alice: '送り手側', public: '公開ゾーン', bob: '受け手側' };
  const view = { zoom: 0.7, pan: { x: 0, y: 0 }, touched: false };
  const clampN = (v, a, b) => Math.min(Math.max(v, a), b);
  const WIRE_Y0 = 220; const WIRE_GAP = 150;
  const MBH_KEY = 'crypta:atk:mbh';
  let mbh = (() => { try { return Number(localStorage.getItem(MBH_KEY)) || 0; } catch { return 0; } })();
  const mbDefault = () => Math.round(clampN(window.innerHeight * 0.3, 170, 300));
  function setMbh(px, save = false) {
    const H = root.clientHeight || window.innerHeight;
    mbh = Math.round(clampN(px, 110, Math.max(140, H - 180)));
    root.style.setProperty('--mb-h', `${mbh}px`);
    document.documentElement.style.setProperty('--atk-mb-h', `${mbh}px`);
    if (save) { try { localStorage.setItem(MBH_KEY, String(mbh)); } catch { /* なし */ } }
  }
  // 「流す」が要るのは、線の上の物に手を加えるステージだけ
  const FLOW_TOOLS = ['swap', 'replay', 'delay', 'reorder', 'grab'];
  const needsFlow = () => P().tools.some((t) => FLOW_TOOLS.includes(t));
  // 「流す」を押せるのは、手を加えた結果、流せば「したいこと」を満たせるときだけ（ためしに流してみて、確かめる）
  function flowReady() {
    const waiting = S.wire.filter((s) => s.state === 'wait');
    if (waiting.length === 0) return false;
    const todo = P().goals.filter((g) => !S.flags[`goal:${g.key}`]);
    const n = S.log.length;
    waiting.sort((a, b) => a.eta - b.eta).forEach((s) => S.log.push({ pkt: s.p, res: { ok: true }, trial: true }));
    let ok = false;
    try { ok = todo.some((g) => g.test(api)); } catch { ok = false; }
    S.log.length = n;
    // 流したあとに、向こうが反応する（次の通信が来る）ステージでは、手を加えた通信があれば、流せる
    if (!ok && P().onDeliver) ok = waiting.some((s) => s.modified || s.p.replayed);
    return ok;
  }

  // 成功したとき、霧の向こうで起きたこと
  function revealRows() {
    const rows = S.log.filter((l) => l.pkt && l.res).map((l) => ({ ok: l.res.ok !== false, text: l.res.note ?? (l.res.ok ? '受け取った' : '拒否した') }));
    if (rows.length === 0) rows.push({ ok: true, text: 'Bob：いつも通りに受け取った。途中で読まれたことには、気づいていない' });
    return rows.slice(-3);
  }
  function successLine() {
    const dec = [...S.inv].reverse().find((x) => x.kind === 'text' && x.label === '解読した本文');
    if (dec) return { tag: '読めた文', text: `「${dec.text}」` };
    const read = S.wire.find((s) => s.analysed && !s.p.enc && !s.p.pubkey && !s.p.carries);
    if (read && scenario.who === 'eve') return { tag: '読めた文', text: `「${read.p.body}」` };
    return null;
  }

  // 表面と同じ形の、Alice・Bob の部品（成功すると、霧が晴れて、見える）
  function personNode(kind, x, y) {
    const n = el('div', `node node-${kind} atk-person`);
    n.dataset.zone = kind; n.style.left = `${x}px`; n.style.top = `${y}px`;
    const head = el('div', 'node-head');
    const fig = makeCharacter(kind, { width: 78, height: 100, className: 'node-figure character' });
    fig.style.setProperty('--who', kind === 'alice' ? '#4c6fff' : '#2bb673');
    head.append(fig, el('span', 'node-title', kind === 'alice' ? 'アリス' : 'ボブ'));
    const row = el('div', `port-row port-${kind === 'alice' ? 'out' : 'in'}`);
    const port = el('span', 'port port-type-data atk-port'); row.append(port, el('span', 'port-label', 'メッセージ'));
    n.append(head, row);
    return n;
  }

  let lastLayout = null; // 画面の大きさが変わったとき、合わせ直すため
  function render() {
    checkGoals();
    root.replaceChildren();
    root.classList.add('editor', 'atk-editor');
    if (!mbh) mbh = mbDefault();
    setMbh(mbh);
    const ph = P();
    if (S.pick) {
      const ok = S.pick.type === 'slot' ? S.wire.some((s) => s.id === S.pick.id && s.state === 'wait')
        : S.pick.type === 'lying' ? S.lying.some((x) => x.id === S.pick.id) : !!find(S.pick.id);
      if (!ok) { S.pick = null; S.pending = null; }
    }
    const done = allDone();
    const fresh = done && !S.celebrated; // 成功の演出は、最初の1回だけ動かす
    if (fresh) view.touched = false; // 成功したら、全体（霧の向こうも）が見える大きさに、縮める
    root.classList.toggle('is-success', done);
    root.classList.toggle('is-fresh', fresh);
    const showRes = done && !S.resultClosed;
    root.classList.toggle('has-result', showRes);
    const anyInspected = S.wire.some((s) => s.analysed) || S.lying.some((x) => x.revealed);

    // --- 盤面（回路） ---
    const board = el('div', 'board'); board.id = 'board';
    const zones = {};
    ['alice', 'public', 'bob'].forEach((z) => { zones[z] = el('div', `zone zone-${z}`); board.append(zones[z]); });
    const walls = [0, 1].map(() => { const w = el('div', 'zone-wall'); board.append(w); return w; });
    const world = el('div', 'world');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'edges'); svg.setAttribute('aria-hidden', 'true');
    const NS = 'http://www.w3.org/2000/svg';
    const sv = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
    world.append(svg);
    const tut = TUTORIAL();
    const tutSpec = tut && !done ? tut[tutorialStep()] : null;
    const tutTarget = tutSpec?.target ? (typeof tutSpec.target === 'function' ? tutSpec.target(S) : tutSpec.target) : null;
    const nW = Math.max(S.wire.length, 1);
    const midY = WIRE_Y0 + ((nW - 1) * WIRE_GAP) / 2;
    // Alice と Bob（霧の中。成功すると見える）
    const aliceN = personNode('alice', 18, midY - 70); const bobN = personNode('bob', ZR.bob[0] + 16, midY - 70);
    world.append(aliceN, bobN);
    const wirePaths = [];
    const anySel = S.pick?.type === 'slot';
    S.wire.forEach((s, i) => {
      const y = WIRE_Y0 + i * WIRE_GAP;
      const sel = anySel && S.pick.id === s.id;
      const info = s.analysed ? wireInfo(s.p) : null;
      const g = sv('g', { class: `edge ${info?.key ? 'edge-key' : 'edge-data'} is-public is-${s.state}${s.analysed ? ' is-analysed' : ''}${sel ? ' is-sel' : ''}${anySel && !sel ? ' is-dim' : ''}` });
      const color = info ? KIND_COLOR[info.kind] : null;
      const straight = `M ${ZR.public[0]} ${y} H ${ZR.public[1]}`;
      const halo = sv('path', { class: 'atk-halo', d: straight }); // 選んだ線の、太い光
      const line = sv('path', { class: 'edge-line' });
      line.style.stroke = color ?? '#8A8FAE';
      line.style.strokeWidth = color ? '8' : '6';
      line.style.strokeDasharray = info?.key ? '2 14' : 'none';
      const hit = sv('path', { class: 'edge-hit', d: straight }); hit.style.strokeWidth = '60';
      const title = sv('title'); title.textContent = `線 ${i + 1}：クリックで、選ぶ`;
      g.append(title, halo, line, hit);
      const dot = sv('circle', { r: s.state === 'done' ? 13 : 11, cx: 0, cy: 0, fill: color ?? '#5E6482' });
      g.append(dot);
      wirePaths.push({ s, y, line, dot });
      g.dataset.id = s.id; g.dataset.type = 'slot';
      g.classList.add('atk-wire');
      svg.append(g);
      const no = el('span', `atk-wire-no${sel ? ' is-sel' : ''}`, sel ? `線 ${i + 1}（選択中）` : `線 ${i + 1}`); no.style.left = `${ZR.public[0] + 400}px`; no.style.top = `${y - 40}px`; world.append(no);
      if (info) { const lb = el('span', 'atk-wire-text', info.text); lb.style.left = `${WORLD_W / 2}px`; lb.style.top = `${y - 50}px`; lb.style.setProperty('--c', color); world.append(lb); }
      if (tutTarget === 'wire' && !S.pick && s.state === 'wait') { const h = el('span', 'atk-wire-hint tutorial-target'); h.style.top = `${y - 28}px`; world.append(h); }
    });
    if (S.wire.length === 0) { const em = el('p', 'atk-empty', '線の上には、いま、何も流れていません。'); em.style.left = `${WORLD_W / 2}px`; em.style.top = `${WIRE_Y0 - 20}px`; world.append(em); }
    // 落ちている物（調べると、その下に、何なのかが出る）
    const ly = WIRE_Y0 + nW * WIRE_GAP + 10;
    S.lying.forEach((it, i) => {
      const n = el('div', `node node-lying${S.pick?.type === 'lying' && S.pick.id === it.id ? ' is-sel' : ''} atk-obj`);
      n.dataset.zone = 'public'; n.dataset.id = it.id; n.dataset.type = 'lying';
      n.style.left = `${560 + (i % 3) * 360}px`; n.style.top = `${ly + Math.floor(i / 3) * 170}px`;
      const head = el('div', 'node-head'); head.append(el('span', 'node-title', it.label)); n.append(head);
      if (it.revealed) { const cap = el('div', 'atk-obj-cap'); (it.inspect ?? [it.text ?? '']).forEach((t) => cap.append(el('p', null, t))); n.append(cap); }
      n.setAttribute('role', 'button'); n.tabIndex = 0;
      world.append(n);
    });
    const contentBottom = ly + Math.ceil(S.lying.length / 3) * 170 + 40;
    // 成功：Bob の吹き出し（霧の向こうで、実際に起きたこと）
    if (done) {
      const bub = el('div', 'atk-bubble-box'); // 盤面の右下に、読める大きさで（縮小しても、文字は小さくならない）
      bub.append(el('b', 'atk-reveal-t', '霧の向こうで、実際に起きたこと'));
      revealRows().forEach((r, k) => { const p = el('p', `atk-bubble${r.ok ? '' : ' is-no'}`, r.text); p.style.animationDelay = `${1.2 + k * 0.4}s`; bub.append(p); });
      root._bub = bub;
    }
    board.append(world);
    // 霧（成功すると、晴れる）
    const fogs = ['alice', 'bob'].map((z) => { const f = el('div', `atk-fog atk-fog-${z}${done ? ' is-clear' : ''}`); board.append(f); return f; });
    const tags = el('div', 'zone-tags');
    ['alice', 'public', 'bob'].forEach((z) => { const t = el('span', `zone-tag zone-tag-${z}`, done ? ZTAG_OPEN[z] : ZTAG[z]); t.dataset.zone = z; tags.append(t); });
    board.append(tags);
    const zc = el('div', 'zoom-controls');
    [['＋', 'zoom-in', '拡大'], ['－', 'zoom-out', '縮小'], ['全体', 'zoom-fit', '全体を表示']].forEach(([t, id, label]) => { const b = el('button', null, t); b.type = 'button'; b.id = `atk-${id}`; b.title = label; b.setAttribute('aria-label', label); zc.append(b); });
    board.append(zc);
    // 成功の表示（小さめ。内容が見えるように）
    if (done) {
      const ban = el('div', 'atk-banner'); ban.id = 'atk-banner';
      const sl = successLine();
      ban.append(el('b', 'atk-banner-h', scenario.who === 'eve' ? '盗み見に成功' : '攻撃に成功'));
      if (sl) { const l = el('span', 'atk-banner-line'); l.append(el('b', null, `${sl.tag}：`), sl.text); ban.append(l); }
      board.append(ban);
      board.append(root._bub);
    }
    root.append(board);

    // 表面と同じ配線：Alice の出口 → 公開ゾーンの線 → Bob の入口（横 → 縦 → 横）
    const portXY = (node) => { const p = node.querySelector('.atk-port'); return { x: node.offsetLeft + p.offsetLeft + p.offsetWidth / 2, y: node.offsetTop + p.offsetTop + p.offsetHeight / 2 }; };
    const A = portXY(aliceN); const Bp = portXY(bobN);
    wirePaths.forEach(({ s, y, line, dot }) => {
      const x1 = ZR.public[0] - 4; const x2 = ZR.public[1] + 4;
      const d = `M ${A.x} ${A.y} H ${x1 - 6} V ${y} H ${x2 + 6} V ${Bp.y} H ${Bp.x}`;
      line.setAttribute('d', d);
      if (s.state === 'wait') { dot.append(sv('animateMotion', { dur: '7s', repeatCount: 'indefinite', path: d })); }
      else if (s.state === 'done' && fresh) { dot.append(sv('animateMotion', { dur: '1.8s', repeatCount: '1', fill: 'freeze', path: `M ${WORLD_W / 2} ${y} H ${x2 + 6} V ${Bp.y} H ${Bp.x}` })); }
      else if (s.state === 'done') { dot.setAttribute('cx', String(Bp.x)); dot.setAttribute('cy', String(Bp.y)); dot.setAttribute('opacity', '0.5'); }
      else { dot.remove(); }
    });

    const applyPan = () => {
      const W = board.clientWidth; const H = board.clientHeight;
      // 横：全体が入るときは、まん中に置く。入らないときは、はみ出さない範囲で動かす
      if (W > 0) view.pan.x = WORLD_W * view.zoom <= W ? (W - WORLD_W * view.zoom) / 2 : clampN(view.pan.x, W - WORLD_W * view.zoom, 0);
      // 縦：いちばん下の物まで、ちゃんと持ってこられる。上は、少しだけ余白
      if (H > 0) view.pan.y = clampN(view.pan.y, Math.min(0, H - contentBottom * view.zoom - 20), 160);
      world.style.transform = `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`;
      moveZones(view.pan.x);
    };
    function moveZones(px) {
      board.style.backgroundPosition = `${px}px ${view.pan.y}px`;
      board.style.backgroundSize = `${24 * view.zoom}px ${24 * view.zoom}px`;
      ['alice', 'public', 'bob'].forEach((z) => { const [a, b] = ZR[z]; zones[z].style.left = `${px + a * view.zoom}px`; zones[z].style.width = `${(b - a) * view.zoom}px`; });
      fogs.forEach((f, i) => { const [a, b] = ZR[i ? 'bob' : 'alice']; f.style.left = `${px + a * view.zoom}px`; f.style.width = `${(b - a) * view.zoom}px`; });
      [ZR.alice[1], ZR.public[1]].forEach((b, i) => { walls[i].style.left = `${px + (b - WALL / 2) * view.zoom}px`; walls[i].style.width = `${WALL * view.zoom}px`; });
      tags.querySelectorAll('.zone-tag').forEach((t) => { const [a, b] = ZR[t.dataset.zone]; t.style.left = `${px + ((a + b) / 2) * view.zoom}px`; t.style.maxWidth = `${Math.max(60, (b - a) * view.zoom - 12)}px`; });
    }
    // 全体を表示：横幅と、高さ（いちばん下の物まで）の、両方に収まる大きさ
    const fit = () => {
      const W0 = board.clientWidth; const H = board.clientHeight; if (W0 < 50) return;
      // 結果が出ているときは、左の結果パネルと、右のボタンを避けて、Alice から Bob まで、全部が見えるように
      const left = showRes && W0 > 900 ? (stack.getBoundingClientRect().width + 24) : 0;
      const right = showRes && W0 > 900 ? 64 : 0;
      const W = W0 - left - right;
      view.zoom = clampN(Math.min(W / WORLD_W, H > 120 ? (H - 60) / contentBottom : W / WORLD_W), 0.2, 1);
      view.pan = { x: 0, y: (showRes ? 90 : 46) - 60 * view.zoom }; view.touched = false; applyPan();
      if (left) {
        view.pan.x = left + (W - WORLD_W * view.zoom) / 2;
        const keep = view.pan.x; applyPan();
        if (Math.abs(view.pan.x - keep) > 1) { view.pan.x = keep; world.style.transform = `translate(${keep}px, ${view.pan.y}px) scale(${view.zoom})`; moveZones(keep); }
      }
    };
    const apply = applyPan;
    const zoomAt = (cx, cy, nz) => {
      nz = clampN(nz, 0.2, 2);
      const b = board.getBoundingClientRect();
      const wx = (cx - b.left - view.pan.x) / view.zoom; const wy = (cy - b.top - view.pan.y) / view.zoom;
      view.zoom = nz; view.pan.x = cx - b.left - wx * nz; view.pan.y = cy - b.top - wy * nz; view.touched = true; apply();
    };
    zc.querySelector('#atk-zoom-in').onclick = () => { const b = board.getBoundingClientRect(); zoomAt(b.left + b.width / 2, b.top + b.height / 2, view.zoom * 1.2); };
    zc.querySelector('#atk-zoom-out').onclick = () => { const b = board.getBoundingClientRect(); zoomAt(b.left + b.width / 2, b.top + b.height / 2, view.zoom / 1.2); };
    zc.querySelector('#atk-zoom-fit').onclick = fit;
    // ホイール：表面と同じく、ふつうに上下へスクロール。拡大・縮小は、Ctrl（Mac は ⌘）＋ホイール、ピンチ、ボタンで
    board.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { zoomAt(e.clientX, e.clientY, view.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); return; }
      const unit = e.deltaMode === 1 ? 33 : 1;
      view.pan.y -= e.deltaY * unit;
      if (e.shiftKey || Math.abs(e.deltaX) > 0) view.pan.x -= (e.shiftKey ? e.deltaY : e.deltaX) * unit;
      view.touched = true; apply();
    }, { passive: false });
    board.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      if (e.target.closest('.edge, .node, .zoom-controls, .atk-banner')) return;
      const sx = e.clientX; const sy = e.clientY; const p0 = { ...view.pan };
      board.classList.add('is-panning');
      const mv = (ev) => { view.pan = { x: p0.x + ev.clientX - sx, y: p0.y + ev.clientY - sy }; view.touched = true; apply(); };
      const up = () => { board.classList.remove('is-panning'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });

    // --- 左上：ステージの条件（役は、題の横に小さく。したいことだけ） ---
    const stack = el('div', 'side-stack');
    const brief = el('aside', `brief-panel${showRes || S.briefHidden ? ' is-collapsed' : ''}`); brief.setAttribute('aria-label', 'ステージの条件');
    const bar = el('div', 'brief-bar');
    const h1 = el('h1', null, scenario.title);
    const bb = el('div', 'brief-buttons');
    const gls = el('a', 'brief-toggle brief-glossary', '用語集'); gls.href = 'glossary.html'; gls.target = '_blank'; gls.rel = 'noopener';
    const tog = el('button', 'brief-toggle', brief.classList.contains('is-collapsed') ? '開く' : '隠す'); tog.type = 'button'; tog.id = 'atk-brief-toggle';
    tog.onclick = () => { S.briefHidden = !brief.classList.contains('is-collapsed'); brief.classList.toggle('is-collapsed'); tog.textContent = S.briefHidden ? '開く' : '隠す'; };
    bb.append(gls, tog); bar.append(h1, bb);
    const body = el('div', 'brief-body');
    if (scenario.roleText) body.append(el('p', 'atk-role', scenario.roleText));
    const og = el('section', 'brief-group'); og.append(el('h2', null, 'したいこと'));
    const gl = el('ol', 'objectives atk-tasks'); gl.id = 'atk-tasks';
    const li = el('li', `objective${done ? ' is-done' : ''}`);
    li.append(el('span', 'objective-mark', done ? '✓' : '●'), el('span', 'objective-title', ph.aim ?? ph.goals[0].text));
    gl.append(li); og.append(gl); body.append(og);
    brief.append(bar, body); stack.append(brief);
    // 凡例：何かを調べてから、出す（はじめから全部は、出さない）
    if (anyInspected && !showRes) {
      const lg = el('ul', 'legend atk-legend'); lg.setAttribute('aria-label', 'データの色と、その意味');
      const kinds = ['plain', 'cipher', 'key', 'proof'].concat(scenario.who === 'eve' ? [] : ['garbled']);
      kinds.forEach((k) => { const it = el('li'); const dot = el('span', 'legend-dot'); dot.style.setProperty('--chip', KIND_COLOR[k]); it.append(dot, el('span', null, KIND_NAME[k])); lg.append(it); });
      lg.append(el('li', 'legend-note', '鍵の線は点線'));
      stack.append(lg);
    }
    if (showRes) { const res = el('section', 'result is-safe atk-result'); res.id = 'result'; res.tabIndex = -1; res.setAttribute('aria-live', 'polite'); stack.append(res); }
    root.append(stack);

    // --- 右上：ボタン（場面に必要なものだけ） ---
    const tb = el('div', 'toolbar'); tb.id = 'toolbar';
    const mv = el('span', 'atk-moves', `手数 ${S.moves}`); mv.id = 'atk-moves'; mv.title = '実行したコマンドの数（調べる・流すは、数えない）';
    const again = el('button', 'button button-secondary button-quiet', '最初から'); again.type = 'button'; again.id = 'atk-restart'; again.onclick = () => startPhase(S.phase);
    tb.append(mv, again);
    if (!done) { const gu = el('button', 'button button-secondary button-quiet', 'あきらめる'); gu.type = 'button'; gu.id = 'atk-giveup'; gu.onclick = () => hooks.onGiveUp?.(); tb.append(gu); }
    if (done && S.resultClosed) { const rb = el('button', 'button button-primary', '結果を見る'); rb.type = 'button'; rb.id = 'atk-show-result'; rb.onclick = () => { S.resultClosed = false; render(); }; tb.append(rb); }
    if (needsFlow() && !done) {
      const ready = flowReady();
      const next = el('button', 'button button-primary atk-advance', '流す ▶'); next.type = 'button'; next.id = 'atk-advance'; next.onclick = advance;
      next.disabled = !ready;
      next.title = ready ? '線の上の通信を、霧の向こう（受け手）へ流す' : 'まだ流せません。通信に手を加えて、「したいこと」を満たせる形にすると、押せるようになります';
      tb.append(next);
    }
    root.append(tb);

    // --- チュートリアル ---
    if (tut && !done) {
      const st = tutorialStep();
      const coach = el('div', 'coach atk-coach'); coach.setAttribute('role', 'status');
      coach.append(el('p', 'coach-step', `ステップ ${st + 1} / ${tut.length}`), el('p', 'coach-text', tut[st].text));
      root.append(coach);
    }

    // --- 下：作業スペース（できること／持ち物）。上の仕切りで、高さを変えられる ---
    const mb = el('section', 'palette-bar atk-msgbox'); mb.setAttribute('aria-label', '作業スペース');
    const split = el('div', 'atk-splitter'); split.setAttribute('role', 'separator'); split.setAttribute('aria-orientation', 'horizontal'); split.title = 'ドラッグで、回路と作業スペースの大きさを変える（ダブルクリックで元に戻す）';
    split.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const y0 = e.clientY; const h0 = mbh;
      split.setPointerCapture?.(e.pointerId);
      const moveFn = (ev) => { setMbh(h0 + (y0 - ev.clientY)); if (!view.touched) fit(); else apply(); };
      const upFn = () => { split.removeEventListener('pointermove', moveFn); split.removeEventListener('pointerup', upFn); setMbh(mbh, true); };
      split.addEventListener('pointermove', moveFn); split.addEventListener('pointerup', upFn);
    });
    split.addEventListener('dblclick', () => { setMbh(mbDefault(), true); render(); });
    split.append(el('span', 'atk-splitter-grip'));
    const c1 = el('div', 'atk-mb-col atk-mb-cmd');
    const addCmd = (c, x, type) => {
      const why = cantDo(c, type, x);
      const b = el('button', `atk-menu-i atk-cmd${why ? ' is-off' : ''}`); b.type = 'button'; b.dataset.cmd = c;
      b.append(el('span', 'atk-cmd-name', CMD[c]));
      if (!seenCmds.has(c)) { b.append(el('span', 'atk-new', 'NEW')); b.append(el('span', 'atk-cmd-desc', CMD_DESC[c])); }
      b.title = why ? `いまは使えません：${why}` : CMD_DESC[c];
      if (why) { b.disabled = true; b.append(el('span', 'atk-cmd-why', why)); }
      else b.onclick = () => runCmd(c);
      c1.append(b);
    };
    if (S.pending) {
      c1.append(el('b', 'atk-mb-t', S.pending.title));
      if (!S.inv.some((x) => S.pending.ok(x))) c1.append(el('p', 'atk-lead', '持ち物に、選べる物がありません。'));
      const x = el('button', 'atk-menu-i atk-cmd is-quiet', 'やめる'); x.type = 'button'; x.id = 'atk-pending-cancel'; x.onclick = () => { S.pending = null; render(); };
      c1.append(x);
    } else if (S.pick) {
      const tx = S.pick.type === 'slot' ? slotOf(S.pick.id)?.p : (S.pick.type === 'lying' ? S.lying : S.inv).find((x) => x.id === S.pick.id);
      const cur = S.pick.type === 'slot' ? `線 ${S.wire.findIndex((s) => s.id === S.pick.id) + 1}` : itemTitle(tx);
      c1.append(el('b', 'atk-mb-t', `選んだもの：${TYPE_NAME[S.pick.type]}（${cur}）`));
      MENU[S.pick.type].filter((c) => ph.tools.includes(c)).forEach((c) => addCmd(c, tx, S.pick.type));
    } else {
      c1.append(el('b', 'atk-mb-t', 'できること'), el('p', 'atk-lead', '線・落ちている物・持ち物を、クリック（タップ）すると、ここに、できることが出ます。'));
    }
    // 文面を作る（人をだます）：ふだんのコマンドと同じ場所に出す
    if (ph.compose && !S.pending && !done) addCmd('compose', {}, 'none');
    const c3 = el('div', 'atk-mb-col atk-mb-inv');
    c3.append(el('b', 'atk-mb-t', S.pending ? '持ち物（光っている物から、選ぶ）' : '持ち物（自分で手に入れた物）'));
    const slots = el('div', 'atk-inv-grid');
    if (S.inv.length === 0) slots.append(el('p', 'atk-lead', 'まだ、何も持っていません。'));
    S.inv.forEach((it) => {
      const cand = S.pending ? S.pending.ok(it) : false;
      const c = el('button', `atk-card atk-inv-item${S.pick?.type === 'inv' && S.pick.id === it.id ? ' is-sel' : ''}${S.pending ? (cand ? ' is-candidate' : ' is-off') : ''}`); c.type = 'button'; c.dataset.id = it.id; c.dataset.type = 'inv';
      if (cand) c.dataset.pick = it.id;
      if (S.pending && !cand) c.disabled = true;
      c.append(el('b', null, itemTitle(it)), el('span', 'atk-card-body', it.kind === 'packet' && it.enc && !it.corrupt ? `${wireInfo(it).text}` : itemBody(it)));
      const ch = it.kind === 'packet' ? chips(it) : []; if (ch.length) c.append(el('span', 'atk-chips', ch.join('・')));
      slots.append(c);
    });
    c3.append(slots);
    mb.append(split, c1, c3);
    root.append(mb);

    root.querySelectorAll('[data-type]').forEach((c) => { c.addEventListener('click', (e) => { e.stopPropagation(); selectTarget(c.dataset.type, c.dataset.id); }); });
    if (tutTarget && tutTarget !== 'wire') root.querySelectorAll(tutTarget).forEach((n) => n.classList.add('tutorial-target'));
    if (view.touched) apply(); else fit();
    lastLayout = { fit, apply };
    if (showRes) { showClear(fresh); const t = document.getElementById('atk-toast'); if (t) t.hidden = true; }
    if (done) S.celebrated = true;
  }

  // 評価：力ずく（強い暗号を、正面から破ろうとした）＝B。弱点を見抜いて、最小の手数＝S。見抜いたが、遠回り＝A。あきらめ＝C
  function rateNow() {
    const total = Object.values(agg).reduce((x, v) => ({ m: x.m + v.m, p: x.p + v.p, b: x.b || v.b }), { m: 0, p: 0, b: false });
    const r = total.b ? 'B' : total.m <= total.p ? 'S' : 'A';
    return { r, ...total };
  }
  const RATE_TEXT = { S: '弱点を見抜いて、最小の手数で成功', A: '弱点は見抜いた。もっと少ない手数でもできる', B: '力ずくで、強い守りを正面から破ろうとした' };
  // 結果パネル：まず「止まる様子を見る」。見終わってから、止め方の説明と、次へのボタンを出す
  function showClear(fresh) {
    const last = S.phase === scenario.phases.length - 1;
    agg[S.phase] = { m: S.moves, p: P().par ?? 99, b: S.brute };
    const box = root.querySelector('#result');
    if (!box) return;
    if (fresh) box.classList.add('is-fresh');
    let rt = null;
    if (last) { rt = rateNow(); if (!S.recorded) { S.recorded = true; hooks.onRecord?.(rt.r, { moves: rt.m }); } }
    const head = el('div', 'result-head');
    head.append(el('h2', 'result-title', last ? '成功！' : `このパートは、成功（${S.phase + 1} / ${scenario.phases.length}）`));
    if (rt) { const chip = el('span', `rating rating-${rt.r}`, rt.r); chip.setAttribute('aria-label', `評価 ${rt.r}`); head.append(chip); }
    const close = el('button', 'result-close', '×'); close.type = 'button'; close.id = 'atk-result-close'; close.setAttribute('aria-label', '結果を閉じる');
    close.onclick = () => { S.resultClosed = true; render(); };
    head.append(close);
    box.append(head);
    // 狭い画面では、盤面の上の「成功」表示と吹き出しを出さず、ここにまとめる
    const sl = successLine();
    const extra = el('div', 'atk-res-extra');
    if (sl) { const l = el('p', 'atk-banner-line'); l.append(el('b', null, `${sl.tag}：`), sl.text); extra.append(l); }
    revealRows().forEach((r) => extra.append(el('p', `atk-bubble${r.ok ? '' : ' is-no'}`, r.text)));
    box.append(extra);
    if (P().after) box.append(el('p', 'atk-after', P().after));
    const row = el('div', 'result-actions');
    if (!last) {
      const nx = el('button', 'button button-primary', '次のパートへ'); nx.type = 'button'; nx.id = 'atk-clear-next';
      nx.onclick = () => startPhase(S.phase + 1);
      const again = el('button', 'button button-secondary', 'もう一度'); again.type = 'button'; again.id = 'atk-again'; again.onclick = () => startPhase(S.phase);
      row.append(nx, again); box.append(row);
      if (fresh) box.focus({ preventScroll: true });
      return;
    }
    const note = el('div', `result-note rating-note${rt.r === 'S' ? ' is-nice' : ''}`); note.id = 'atk-rate';
    note.append(el('strong', null, RATE_TEXT[rt.r]), el('small', null, `手数 ${rt.m}`));
    box.append(note);
    if (!S.stopSeen) {
      // 次へ進む前に、必ず、止まる様子を見る
      box.append(el('p', 'atk-next-hint', 'この攻撃は、守る側（表面）の回路では、どう止まるのか。見てから、次へ進もう。'));
      const front = scenario.replay && hooks.onStopReplay;
      const sp = el('button', 'button button-primary', front ? '止まる様子を見る（表面で再生）' : '止まる様子を見る'); sp.type = 'button'; sp.id = 'atk-stop-play';
      sp.onclick = front ? () => hooks.onStopReplay(scenario.replay) : playStop;
      row.append(sp); box.append(row);
      if (fresh) box.focus({ preventScroll: true });
      return;
    }
    box.append(...defenseBlock(scenario));
    const nextHref = hooks.nextHref; const list = hooks.listHref ?? 'attacker.html#stage-section';
    const nx = el('a', 'button button-primary', nextHref ? '次のステージへ' : 'ステージ一覧へ'); nx.id = 'atk-clear-next'; nx.href = nextHref ?? list;
    const again = el('button', 'button button-secondary', 'もう一度'); again.type = 'button'; again.id = 'atk-again'; again.onclick = () => startPhase(0);
    row.append(nx, again);
    if (nextHref) { const ls = el('a', 'button button-secondary', 'ステージ一覧へ'); ls.id = 'atk-list'; ls.href = list; row.append(ls); }
    box.append(row);
  }

  // 止まる様子（表面で再生できないステージ用。画面の中で、短く再生する）
  function playStop() {
    const back = el('div', 'atk-modal-back'); const box = el('div', 'atk-modal');
    box.append(el('h2', null, '止まる様子'), el('p', 'atk-lead', `守り：${scenario.tech}`));
    const bar = el('div', 'atk-stopbar');
    ['攻撃者', scenario.block ? `守り（${scenario.block}）` : '守り', 'Bob'].forEach((t, i) => { if (i) bar.append(el('span', 'atk-arrow', '→')); bar.append(el('span', `atk-part-box${i === 1 ? ' is-guard' : ''}`, t)); });
    bar.append(el('span', 'atk-stopdot'));
    const ul = el('ul', 'atk-stoplog');
    const row = el('div', 'atk-modal-actions'); const close = el('button', 'button button-primary', 'とじる'); close.type = 'button'; close.id = 'atk-stop-close';
    let timer = null;
    close.disabled = true; // 最後まで見てから、閉じられる
    close.onclick = () => { clearInterval(timer); back.remove(); S.stopSeen = true; render(); };
    row.append(close); box.append(bar, ul, row); back.append(box); document.body.append(back);
    let i = 0;
    timer = setInterval(() => {
      if (i >= scenario.stop.length) { clearInterval(timer); bar.classList.add('is-blocked'); ul.append(el('li', 'is-end', `止まった：${scenario.block ?? '攻撃は、通らなかった'}`)); close.disabled = false; close.focus(); return; }
      ul.append(el('li', null, scenario.stop[i])); i += 1; if (i === 1) bar.classList.add('is-play');
    }, 900);
  }

  // 文面を作る（人をだます）
  function openCompose() {
    const ph = P();
    if (!ph.compose) return;
    const back = el('div', 'atk-modal-back');
    const box = el('div', 'atk-modal');
    box.append(el('h2', null, '連絡の文面を作る'), el('p', 'atk-lead', ph.compose.lead));
    const sel = new Set();
    const checks = el('div', 'atk-checks');
    ph.compose.cues.forEach((c, i) => {
      const l = el('label'); const cb = document.createElement('input'); cb.type = 'checkbox';
      const need = c.needs ? !S.flags[`pick:${c.needs}`] && !S.inv.some((x) => x.label === c.needs) : false;
      cb.disabled = need; cb.dataset.i = String(i);
      cb.onchange = () => { if (cb.checked) sel.add(i); else sel.delete(i); };
      l.append(cb, c.text + (need ? `（先に「${c.needs}」を、拾う必要があります）` : ''));
      checks.append(l);
    });
    const row = el('div', 'atk-modal-actions');
    const c = el('button', 'button button-secondary', 'やめる'); c.type = 'button';
    const ok = el('button', 'button btn-mal', 'Alice に送る（想定）'); ok.type = 'button'; ok.id = 'atk-compose-send';
    c.onclick = () => back.remove();
    ok.onclick = () => { back.remove(); S.moves += 1; ph.compose.send([...sel], api); render(); };
    row.append(c, ok); box.append(checks, row); back.append(box); document.body.append(back);
  }

  function chr(kind, w) { return makeCharacter(kind, { width: w, height: Math.round(w * 1.28), className: 'character' }); }

  S.briefHidden = window.innerWidth < 900;
  // 画面（ウィンドウ）の大きさが変わったら、仕切りの位置と、盤面の表示を、合わせ直す
  const onResize = () => { if (!lastLayout) return; setMbh(mbh); if (view.touched) lastLayout.apply(); else lastLayout.fit(); };
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(root); else window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = [...document.querySelectorAll('.atk-modal-back')].pop();
    if (modal) { const c = modal.querySelector('#atk-stop-close, .button-secondary'); if (c && !c.disabled) c.click(); else if (!c) modal.remove(); return; }
    if (allDone() && !S.resultClosed) { S.resultClosed = true; render(); return; }
    if (S.pick || S.pending) { S.pick = null; S.pending = null; render(); }
  });
  startPhase(0);
  return { advance, S };
}
