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
  if (it.kind === 'packet') return it.label ?? '通信';
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

  function say(text, tone = '') { S.msgs.unshift({ text, tone }); S.msgs = S.msgs.slice(0, 6); }
  const flag = (k) => { S.flags[k] = true; };
  const api = { S, say, flag, pkt, item, clone, fnv, caesar, shownText };

  function startPhase(i, retry = false) {
    S.phase = i; S.moves = 0; S.brute = false; S.round = 0; S.tick = 0; S.log = []; S.flags = {}; S.msgs = []; S.effort = []; S.pick = null; S.pending = null; S.inspectBox = null;
    S.inv = (P().inv?.(api) ?? []).map((x) => ({ ...x }));
    S.lying = (P().lying?.(api) ?? []).map((x) => ({ ...x }));
    newWire();
    S.tool = P().tools[0];
    S.sel = null;
    if (scenario.tutorial && P().start) say(P().start, '');
    render();
    if (!retry && (i === 0 || P().circuit)) showCircuit();
  }
  // ステップ1：回路を確認する（Alice から Bob への通信が、どんな部品でできているか）
  function showCircuit() {
    const c = P().circuit ?? scenario.circuit;
    if (!c) return;
    const back = el('div', 'atk-modal-back'); const box = el('div', 'atk-modal');
    box.append(el('h2', null, '回路を確認する'), el('p', 'atk-lead', 'Alice から Bob への通信は、次の部品でできています。'));
    const chain = el('div', 'atk-circuit');
    c.forEach((t, i) => { if (i) chain.append(el('span', 'atk-arrow', '→')); chain.append(el('span', `atk-part-box${/公開ゾーン/.test(t) ? ' is-public' : ''}`, t)); });
    box.append(chain, el('p', 'atk-role', scenario.roleText ?? ''), el('p', 'atk-lead', `したいこと：${P().aim ?? ''}`));
    const row = el('div', 'atk-modal-actions'); const go = el('button', 'button button-primary', '攻撃を始める'); go.type = 'button'; go.id = 'atk-circuit-ok';
    go.onclick = () => back.remove();
    row.append(go); box.append(row); back.append(box); document.body.append(back);
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

  function inspectLines(it) {
    if (it.inspect) return it.inspect;
    const L = [];
    if (it.kind === 'packet') {
      L.push(`送り主：${it.from === 'alice' ? 'Alice' : it.from === 'bob' ? 'Bob' : it.from}　宛先：${it.to === 'alice' ? 'Alice' : it.to === 'bob' ? 'Bob' : it.to}`);
      L.push(`大きさ：約 ${Math.max(16, (it.body?.length ?? 0) * 3)} バイト　時刻：6:02`);
      L.push(it.enc && !it.corrupt ? '中身：暗号化されていて、読めない' : '中身：そのまま読める');
      if (!it.enc && !it.corrupt) L.push(`本文：「${it.body}」`);
      if (it.attackCost) L.push(`手間の見積もり：${it.attackCost}`);
    } else {
      L.push(`${itemTitle(it)}（置き場所：${it.zone === 'public' ? '公開ゾーン' : '持ち物'}）`);
    }
    return L;
  }

  async function onTarget(type, id) {
    const T = S.tool;
    if (S.done) return;
    // ---- 流れている物 ----
    if (type === 'slot') {
      const s = slotOf(id);
      if (!s || s.state !== 'wait') return;
      const p = s.p;
      if (T === 'pick' || T === 'inspect' || T === 'try') s.analysed = true;
      if (T === 'pick') { addInv(clone(p)); flag('pick'); flag(`pick:${p.label ?? p.kind}`); say('コピーを持ち物に入れた。元の通信は、そのまま流れる。', 'ok'); P().onUse?.('pick', p, api); }
      else if (T === 'grab') { s.state = 'grabbed'; addInv(clone(p)); S.log.push({ pkt: p, res: { ok: false, missed: true, note: 'Bob には、届きませんでした' } }); flag('grab'); say('通信を奪った。Bob には、届かない。', 'ok'); }
      else if (T === 'delay') { s.eta += 2; flag('delay'); say(`この通信を、2ステップ遅らせた（届くのは ${s.eta} ステップ目）。`, 'ok'); }
      else if (T === 'reorder') {
        const other = S.wire.filter((x) => x.state === 'wait' && x.id !== s.id).sort((a, b) => a.eta - b.eta)[0];
        if (!other) say('入れ替える相手の通信が、ありません。', 'bad');
        else { const t = s.eta; s.eta = other.eta; other.eta = t; flag('reorder'); say('届く順番を、入れ替えた。', 'ok'); }
      }
      else if (T === 'inspect') { showInspect(p); flag('inspect'); flag(`inspect:${p.label ?? p.kind}`); P().onUse?.('inspect', p, api); }
      else if (T === 'try') { await doTry(p); }
      else if (T === 'swap') {
        const src = S.sel && find(S.sel);
        if (!src) { say('先に、持ち物から、差し替えたい物を選んでください。', 'bad'); }
        else if (src.kind !== 'packet') { say('通信（手紙）の形をした物しか、取り替えられません。', 'bad'); }
        else { S.log.push({ note: `取り替え：${p.label ?? '通信'} → ${src.label ?? '通信'}` }); s.p = { ...src, id: uid() }; S.inv = S.inv.filter((x) => x.id !== src.id); addInv(clone(p)); S.sel = null; flag('swap'); say('通信を取り替えた。「進める」で、流れていく。', 'ok'); }
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
      } else if (T === 'inspect') { showInspect(it); flag(`inspect:${it.label}`); P().onUse?.('inspect', it, api); }
      else if (T === 'try') { await doTry(it); }
      else say('この道具では、これは、操作できません。', 'bad');
      render();
      return;
    }
    // ---- 持ち物 ----
    if (type === 'inv') {
      const it = find(id);
      if (!it) return;
      if (T === 'inspect') { showInspect(it); }
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

  function showInspect(it) {
    const lines = inspectLines(it);
    S.inspectBox = { title: itemTitle(it), lines };
    S.msgs.unshift({ text: `調べた：${itemTitle(it)}`, tone: '' });
    if (it.effort) S.effort.push(it.effort);
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
      sl.oninput = () => { const k = Number(sl.value); lab.textContent = `幅 ${k}`; out.textContent = caesar(cipher, -k); if (k !== last) { S.moves += 1; last = k; } note.textContent = ''; };
      const row = el('div', 'atk-modal-actions');
      const cancel = el('button', 'button button-secondary', 'やめる'); cancel.type = 'button';
      const all = el('button', 'button button-secondary', '26通りを一度に出す（総当たり）'); all.type = 'button'; all.id = 'atk-slide-all';
      const okb = el('button', 'button button-primary', 'これで読めた'); okb.type = 'button'; okb.id = 'atk-slide-ok';
      okb.onclick = () => { if (last === 3) { back.remove(); resolve(true); } else note.textContent = 'まだ、読めません。'; };
      cancel.onclick = () => { back.remove(); resolve(false); };
      all.onclick = () => {
        S.brute = true; S.moves += 1;
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
    const m = el('button', 'button btn-mal', 'MAC（鍵つきの指紋）');
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
    S.moves += 1;
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

  // ----- 選んだ物に対する、捜査のコマンド（下のメッセージボックスに出る） -----
  const MENU = {
    slot: ['pick', 'grab', 'swap', 'delay', 'reorder', 'inspect', 'try'],
    lying: ['pick', 'inspect', 'try'],
    inv: ['inspect', 'edit', 'compute', 'combine', 'replay', 'try'],
  };
  const CMD = { pick: 'コピーする', grab: '止める（奪う）', reorder: '順番を入れ替える', swap: '取り替える…', delay: '遅らせる', inspect: '調べる', try: '解読を試す', edit: '書き換える', compute: '計算する…', combine: '合わせる…', replay: '再送する' };
  const TYPE_NAME = { slot: '流れている通信', lying: '落ちている物', inv: '持ち物' };

  function selectTarget(type, id) {
    S.pick = { type, id }; S.pending = null; S.inspectBox = null;
    render();
  }
  function runCmd(c) {
    const { type, id } = S.pick;
    if (c === 'swap') {
      S.pending = { title: '何と取り替える？（持ち物の通信から選ぶ）', list: S.inv.filter((x) => x.kind === 'packet'), go: (it) => { S.pending = null; S.tool = 'swap'; S.sel = it.id; S.moves += 1; onTarget('slot', id); } };
      render(); return;
    }
    if (c === 'combine') {
      S.pending = { title: '何と合わせる？（持ち物から選ぶ）', list: S.inv.filter((x) => x.id !== id), go: (it) => { S.pending = null; S.tool = 'combine'; S.sel = id; S.moves += 1; onTarget('inv', it.id); } };
      render(); return;
    }
    S.tool = c; S.sel = null; S.inspectBox = null; S.moves += 1;
    onTarget(type, id);
  }

  // ----- 色と文字（調べた線だけ。表面と同じ考え方） -----
  const KIND_COLOR = { plain: '#D9892F', cipher: '#53679B', proof: '#347C79', bad: '#A65361' };
  function wireInfo(p) {
    const extra = [];
    if (p.hash) extra.push('指紋つき');
    if (p.mac) extra.push('MAC');
    if (p.sig) extra.push('署名');
    if (p.seq != null) extra.push(`番号${p.seq}`);
    if (p.cert) extra.push(p.cert.valid ? '証明書' : '自己署名の証明書');
    let kind = 'plain'; let text = `「${p.body}」`;
    if (p.corrupt) { kind = 'bad'; text = '壊れた手紙'; }
    else if (p.enc) { kind = 'cipher'; text = `暗号文（${ALG[p.enc.alg] ?? p.enc.alg}）`; }
    else if (p.cert || p.sig) kind = 'proof';
    return { kind, text: extra.length ? `${text} ＋ ${extra.join('・')}` : text };
  }

  const TUTORIAL = () => scenario.tutorial && S.phase === 0 ? scenario.tutorial : null;
  function tutorialStep() {
    const t = TUTORIAL();
    const i = t.findIndex((x) => !(x.ok ? x.ok(S) : false));
    return i < 0 ? t.length - 1 : i;
  }

  // ----- 描画：表面と同じ構造（キャンバス・ゾーンの壁・条件パネル・右上ボタン）。下は、メッセージボックス -----
  const ZR = { alice: [0, 240], public: [240, 1680], bob: [1680, 1920] };
  const WORLD_W = 1920; const WALL = 14;
  const ZTAG = { alice: '送り手側（見えない）', public: '公開ゾーン（誰でも見られる）', bob: '受け手側（見えない）' };
  const view = { zoom: 0.7, pan: { x: 0, y: 0 }, touched: false };
  const clampN = (v, a, b) => Math.min(Math.max(v, a), b);
  const WIRE_Y0 = 200; const WIRE_GAP = 150;

  function render() {
    checkGoals();
    root.replaceChildren();
    root.classList.add('editor');
    const ph = P();
    if (S.pick) {
      const ok = S.pick.type === 'slot' ? S.wire.some((s) => s.id === S.pick.id && s.state === 'wait')
        : S.pick.type === 'lying' ? S.lying.some((x) => x.id === S.pick.id) : !!find(S.pick.id);
      if (!ok) { S.pick = null; S.pending = null; }
    }
    const done = allDone();

    // --- キャンバス ---
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
    S.wire.forEach((s, i) => {
      const y = WIRE_Y0 + i * WIRE_GAP;
      const sel = S.pick?.type === 'slot' && S.pick.id === s.id;
      const d = `M 0 ${y} H ${WORLD_W}`;
      const g = sv('g', { class: `edge edge-data is-public is-${s.state}${s.analysed ? ' is-analysed' : ''}${sel ? ' is-sel' : ''}` });
      const info = s.analysed ? wireInfo(s.p) : null;
      const color = info ? KIND_COLOR[info.kind] : null;
      const line = sv('path', { class: 'edge-line', d });
      if (color) { line.setAttribute('stroke', color); line.setAttribute('stroke-width', '8'); line.removeAttribute('stroke-dasharray'); line.style.stroke = color; line.style.strokeDasharray = 'none'; }
      else { line.style.stroke = '#8A8FAE'; line.style.strokeDasharray = '2 9'; }
      const hit = sv('path', { class: 'edge-hit', d }); hit.style.strokeWidth = '56';
      const title = sv('title'); title.textContent = `線 ${i + 1}：クリックで、選ぶ`;
      g.append(title, line, hit);
      if (s.state === 'wait') {
        const dot = sv('circle', { r: 11, cy: 0, cx: 0, fill: color ?? '#5E6482' });
        const am = sv('animateMotion', { dur: '6s', repeatCount: 'indefinite', path: d });
        dot.append(am); g.append(dot);
      } else if (s.state === 'done') { g.append(sv('circle', { r: 11, cx: WORLD_W - 330, cy: y, fill: color ?? '#5E6482', opacity: '0.35' })); }
      g.dataset.id = s.id; g.dataset.type = 'slot';
      g.classList.add('atk-wire');
      svg.append(g);
      const no = el('span', 'atk-wire-no', `線 ${i + 1}`); no.style.left = `${640}px`; no.style.top = `${y - 34}px`; world.append(no);
      if (info) { const lb = el('span', 'atk-wire-text', info.text); lb.style.left = `${WORLD_W / 2}px`; lb.style.top = `${y - 48}px`; lb.style.setProperty('--c', color); world.append(lb); }
      if (tut && !S.pick && s.state === 'wait') { const h = el('span', 'atk-wire-hint tutorial-target'); h.style.top = `${y - 28}px`; world.append(h); }
    });
    if (S.wire.length === 0) { const em = el('p', 'atk-empty', '線の上には、いま、何も流れていません。「進める」で、次の通信が流れます。'); em.style.left = `${WORLD_W / 2}px`; em.style.top = `${WIRE_Y0 - 20}px`; world.append(em); }
    // 落ちている物
    const ly = WIRE_Y0 + Math.max(S.wire.length, 1) * WIRE_GAP + 10;
    S.lying.forEach((it, i) => {
      const n = el('div', `node node-lying${S.pick?.type === 'lying' && S.pick.id === it.id ? ' is-sel' : ''} atk-obj`);
      n.dataset.zone = 'public'; n.dataset.id = it.id; n.dataset.type = 'lying';
      n.style.left = `${640 + (i % 4) * 270}px`; n.style.top = `${ly + Math.floor(i / 4) * 90}px`;
      const head = el('div', 'node-head'); head.append(el('span', 'node-title', it.label)); n.append(head);
      n.setAttribute('role', 'button'); n.tabIndex = 0;
      world.append(n);
    });
    board.append(world);
    const tags = el('div', 'zone-tags');
    ['alice', 'public', 'bob'].forEach((z) => { const t = el('span', `zone-tag zone-tag-${z}`, ZTAG[z]); t.dataset.zone = z; tags.append(t); });
    board.append(tags);
    const zc = el('div', 'zoom-controls');
    [['＋', 'zoom-in', '拡大'], ['－', 'zoom-out', '縮小'], ['全体', 'zoom-fit', '全体を表示']].forEach(([t, id, label]) => { const b = el('button', null, t); b.type = 'button'; b.id = `atk-${id}`; b.title = label; b.setAttribute('aria-label', label); zc.append(b); });
    board.append(zc);

    const applyPan = () => {
      const W = board.clientWidth;
      if (W > 0) view.pan.x = clampN(view.pan.x, Math.min(0, W - WORLD_W * view.zoom), 0);
      world.style.transform = `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`;
      board.style.backgroundPosition = `${view.pan.x}px ${view.pan.y}px`;
      board.style.backgroundSize = `${24 * view.zoom}px ${24 * view.zoom}px`;
      ['alice', 'public', 'bob'].forEach((z) => { const [a, b] = ZR[z]; zones[z].style.left = `${view.pan.x + a * view.zoom}px`; zones[z].style.width = `${(b - a) * view.zoom}px`; });
      [ZR.alice[1], ZR.public[1]].forEach((b, i) => { walls[i].style.left = `${view.pan.x + (b - WALL / 2) * view.zoom}px`; walls[i].style.width = `${WALL * view.zoom}px`; });
      tags.querySelectorAll('.zone-tag').forEach((t) => { const [a, b] = ZR[t.dataset.zone]; t.style.left = `${view.pan.x + ((a + b) / 2) * view.zoom}px`; t.style.maxWidth = `${Math.max(60, (b - a) * view.zoom - 12)}px`; });
    };
    const fit = () => { const W = board.clientWidth; if (W < 50) return; view.zoom = Math.max(W / WORLD_W, W < 640 ? 0.4 : 0.2); view.pan = { x: 0, y: 40 - 60 * view.zoom }; view.touched = false; applyPan(); };
    const zoomAt = (cx, cy, nz) => {
      nz = clampN(nz, Math.max(0.2, board.clientWidth / WORLD_W), 2);
      const b = board.getBoundingClientRect();
      const wx = (cx - b.left - view.pan.x) / view.zoom; const wy = (cy - b.top - view.pan.y) / view.zoom;
      view.zoom = nz; view.pan.x = cx - b.left - wx * nz; view.pan.y = cy - b.top - wy * nz; view.touched = true; applyPan();
    };
    zc.querySelector('#atk-zoom-in').onclick = () => { const b = board.getBoundingClientRect(); zoomAt(b.left + b.width / 2, b.top + b.height / 2, view.zoom * 1.2); };
    zc.querySelector('#atk-zoom-out').onclick = () => { const b = board.getBoundingClientRect(); zoomAt(b.left + b.width / 2, b.top + b.height / 2, view.zoom / 1.2); };
    zc.querySelector('#atk-zoom-fit').onclick = fit;
    board.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, view.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });
    board.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      if (e.target.closest('.edge, .node, .zoom-controls')) return;
      const sx = e.clientX; const sy = e.clientY; const p0 = { ...view.pan };
      board.classList.add('is-panning');
      const mv = (ev) => { view.pan = { x: p0.x + ev.clientX - sx, y: p0.y + ev.clientY - sy }; view.touched = true; applyPan(); };
      const up = () => { board.classList.remove('is-panning'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    root.append(board);

    // --- 左上：ステージの条件 ---
    const stack = el('div', 'side-stack');
    const brief = el('aside', `brief-panel${done || S.briefHidden ? ' is-collapsed' : ''}`); brief.setAttribute('aria-label', 'ステージの条件');
    const bar = el('div', 'brief-bar');
    const h1 = el('h1', null, scenario.title);
    const bb = el('div', 'brief-buttons');
    const tog = el('button', 'brief-toggle', brief.classList.contains('is-collapsed') ? '開く' : '隠す'); tog.type = 'button'; tog.id = 'atk-brief-toggle';
    tog.onclick = () => { S.briefHidden = !brief.classList.contains('is-collapsed'); brief.classList.toggle('is-collapsed'); tog.textContent = S.briefHidden ? '開く' : '隠す'; };
    bb.append(tog); bar.append(h1, bb);
    const body = el('div', 'brief-body');
    if (scenario.roleText) { const g = el('section', 'brief-group'); g.append(el('h2', null, 'あなたの役'), el('p', 'atk-role', scenario.roleText)); body.append(g); }
    const og = el('section', 'brief-group'); og.append(el('h2', null, 'したいこと'));
    const gl = el('ol', 'objectives atk-tasks'); gl.id = 'atk-tasks';
    const li = el('li', `objective${done ? ' is-done' : ''}`);
    li.append(el('span', 'objective-mark', done ? '✓' : '●'), el('span', 'objective-title', ph.aim ?? ph.goals[0].text));
    gl.append(li); og.append(gl); body.append(og);
    brief.append(bar, body); stack.append(brief);
    if (done) { const res = el('section', 'atk-result'); res.id = 'result'; stack.append(res); }
    root.append(stack);

    // --- 右上：ボタン ---
    const tb = el('div', 'toolbar'); tb.id = 'toolbar';
    const list = el('a', 'button button-secondary button-quiet', 'ステージ一覧'); list.href = 'attacker.html';
    const again = el('button', 'button button-secondary button-quiet', '最初から'); again.type = 'button'; again.id = 'atk-restart'; again.onclick = () => startPhase(S.phase, true);
    const mv = el('span', 'atk-moves', `手数 ${S.moves}`); mv.id = 'atk-moves';
    const next = el('button', 'button button-primary atk-advance', '進める ▶'); next.type = 'button'; next.id = 'atk-advance'; next.onclick = advance;
    tb.append(mv, list, again);
    if (!done) { const gu = el('button', 'button button-secondary button-quiet', 'あきらめる'); gu.type = 'button'; gu.id = 'atk-giveup'; gu.onclick = () => hooks.onGiveUp?.(); tb.append(gu); }
    if (scenario.challenge) { const cb2 = el('button', 'button button-secondary', '自作チャレンジ'); cb2.type = 'button'; cb2.id = 'atk-challenge'; cb2.onclick = openChallenge; tb.append(cb2); }
    if (ph.compose) { const cb = el('button', 'button button-secondary', '文面を作る'); cb.type = 'button'; cb.id = 'atk-compose'; cb.onclick = openCompose; tb.append(cb); }
    tb.append(next);
    root.append(tb);

    // --- チュートリアル ---
    if (tut) {
      const st = tutorialStep();
      const coach = el('div', 'coach atk-coach'); coach.setAttribute('role', 'status');
      coach.append(el('p', 'coach-step', `ステップ ${st + 1} / ${tut.length}`), el('p', 'coach-text', tut[st].text));
      root.append(coach);
    }

    // --- 下：メッセージボックス（ブロック置き場だった所） ---
    const mb = el('section', 'palette-bar atk-msgbox'); mb.setAttribute('aria-label', 'メッセージボックス');
    const c1 = el('div', 'atk-mb-col atk-mb-cmd');
    if (S.pending) {
      c1.append(el('b', 'atk-mb-t', S.pending.title));
      if (S.pending.list.length === 0) c1.append(el('p', 'atk-lead', '持ち物に、選べる物がありません。'));
      S.pending.list.forEach((it) => {
        const b = el('button', 'atk-menu-i atk-cmd', `${itemTitle(it)}：${itemBody(it).slice(0, 14)}`); b.type = 'button'; b.dataset.pick = it.id;
        b.onclick = () => S.pending.go(it);
        c1.append(b);
      });
      const x = el('button', 'atk-menu-i atk-cmd is-quiet', 'やめる'); x.type = 'button'; x.onclick = () => { S.pending = null; render(); };
      c1.append(x);
    } else if (S.pick) {
      const cur = S.pick.type === 'slot' ? `線 ${S.wire.findIndex((s) => s.id === S.pick.id) + 1}` : itemTitle((S.pick.type === 'lying' ? S.lying : S.inv).find((x) => x.id === S.pick.id));
      c1.append(el('b', 'atk-mb-t', `選んだもの：${TYPE_NAME[S.pick.type]}（${cur}）`));
      MENU[S.pick.type].filter((c) => ph.tools.includes(c)).forEach((c) => {
        const b = el('button', 'atk-menu-i atk-cmd', CMD[c]); b.type = 'button'; b.dataset.cmd = c; b.onclick = () => runCmd(c);
        c1.append(b);
      });
    } else {
      c1.append(el('b', 'atk-mb-t', 'できること'), el('p', 'atk-lead', '線・落ちている物・持ち物を、クリック（タップ）すると、ここに、できることが出ます。'));
    }
    const c2 = el('div', 'atk-mb-col atk-mb-out');
    c2.append(el('b', 'atk-mb-t', '結果'));
    if (S.inspectBox) { const ib = el('div', 'atk-inspect'); ib.append(el('b', null, S.inspectBox.title)); S.inspectBox.lines.forEach((l) => ib.append(el('p', null, l))); c2.append(ib); }
    const ms = el('div', 'atk-msgs'); S.msgs.slice(0, 3).forEach((m) => ms.append(el('p', `atk-msg ${m.tone}`, m.text))); c2.append(ms);
    const c3 = el('div', 'atk-mb-col atk-mb-inv');
    c3.append(el('b', 'atk-mb-t', '持ち物（自分で手に入れた物）'));
    const slots = el('div', 'atk-inv-grid');
    if (S.inv.length === 0) slots.append(el('p', 'atk-lead', 'まだ、何も持っていません。'));
    S.inv.forEach((it) => {
      const c = el('button', `atk-card atk-inv-item${S.pick?.type === 'inv' && S.pick.id === it.id ? ' is-sel' : ''}`); c.type = 'button'; c.dataset.id = it.id; c.dataset.type = 'inv';
      c.append(el('b', null, itemTitle(it)), el('span', 'atk-card-body', itemBody(it)));
      const ch = it.kind === 'packet' ? chips(it) : []; if (ch.length) c.append(el('span', 'atk-chips', ch.join('・')));
      slots.append(c);
    });
    c3.append(slots);
    mb.append(c1, c2, c3);
    root.append(mb);

    root.querySelectorAll('[data-type]').forEach((c) => { c.addEventListener('click', (e) => { e.stopPropagation(); selectTarget(c.dataset.type, c.dataset.id); }); });
    if (view.touched) applyPan(); else fit();
    if (done) showClear();
  }

  function rateNow() {
    const total = Object.values(agg).reduce((x, v) => ({ m: x.m + v.m, p: x.p + v.p, b: x.b || v.b }), { m: 0, p: 0, b: false });
    const r = total.b ? 'B' : total.m <= total.p ? 'S' : 'A';
    return { r, ...total };
  }
  function showClear() {
    const last = S.phase === scenario.phases.length - 1;
    agg[S.phase] = { m: S.moves, p: P().par ?? 99, b: S.brute };
    const box = el('div', 'atk-verdict is-ok atk-clear');
    box.append(el('p', null, last ? 'ステップ3：成功！' : `このパートは、成功（${S.phase + 1} / ${scenario.phases.length}）`));
    const rows = S.log.filter((l) => l.pkt && l.res);
    if (rows.length) {
      const d = el('div', 'atk-debrief'); d.append(el('b', null, '霧の向こうで、実際に起きたこと'));
      rows.slice(-6).forEach((l) => d.append(el('p', null, `・${l.res.note ?? (l.res.ok ? '受け取った' : '拒否した')}`)));
      box.append(d);
    }
    if (P().after) box.append(el('p', null, P().after));
    let rt = null;
    if (last) {
      rt = rateNow();
      const rr = el('p', 'atk-rate'); rr.append(el('span', `rating rating-${rt.r}`, rt.r), `　手数 ${rt.m}（目安 ${rt.p}）${rt.b ? '　力ずくで成功' : rt.r === 'S' ? '　弱点を見抜いて、最小限の手数' : '　余分な手数あり'}`);
      rr.id = 'atk-rate'; box.append(rr);
      box.append(el('p', 'atk-principle', `考え方：${scenario.principle}`));
      const df = el('div', 'atk-defense');
      df.append(el('b', null, 'ステップ4：止め方を確認する'), el('p', null, `止める技術：${scenario.tech ?? ''}`), el('p', null, `守る側（表面）は、どう考えれば防げたか：${scenario.defense}`));
      if (scenario.stop) { const sp = el('button', 'button button-secondary', '止まる様子を見る'); sp.type = 'button'; sp.id = 'atk-stop-play'; sp.onclick = playStop; df.append(sp); }
      box.append(df);
      if (scenario.id === 'a10') {
        box.append(el('p', 'atk-closing', '守るために、知る。——これが、この裏面の、はじめから終わりまでの目的でした。'));
        box.append(el('p', 'atk-closing', '今回作ったツールみたいに、自分が作りたいものも、プログラムで作ってみよう。'));
      }
    }
    const row = el('div', 'atk-actions');
    const again = el('button', 'button button-secondary', 'もう一度、やってみる'); again.type = 'button'; again.id = 'atk-again';
    again.onclick = () => startPhase(S.phase, true);
    const nx = el('button', 'button button-primary is-next', last ? 'ステージ一覧へ' : '次のパートへ'); nx.type = 'button'; nx.id = 'atk-clear-next';
    nx.onclick = () => { if (last) hooks.onClear?.(rt?.r ?? 'A'); else startPhase(S.phase + 1); };
    row.append(again, nx); box.append(row); (root.querySelector('#result') ?? root).append(box);
  }

  // ステップ4：止まる様子を、シミュレーションで再生する
  function playStop() {
    const back = el('div', 'atk-modal-back'); const box = el('div', 'atk-modal');
    box.append(el('h2', null, '止まる様子'), el('p', 'atk-lead', `守り：${scenario.tech}`));
    const bar = el('div', 'atk-stopbar');
    ['攻撃者', scenario.block ? `守り（${scenario.block}）` : '守り', 'Bob'].forEach((t, i) => { if (i) bar.append(el('span', 'atk-arrow', '→')); bar.append(el('span', `atk-part-box${i === 1 ? ' is-guard' : ''}`, t)); });
    bar.append(el('span', 'atk-stopdot'));
    const ul = el('ul', 'atk-stoplog');
    const row = el('div', 'atk-modal-actions'); const close = el('button', 'button button-primary', 'とじる'); close.type = 'button'; close.id = 'atk-stop-close';
    let timer = null;
    close.onclick = () => { clearInterval(timer); back.remove(); };
    row.append(close); box.append(bar, ul, row); back.append(box); document.body.append(back);
    let i = 0;
    timer = setInterval(() => {
      if (i >= scenario.stop.length) { clearInterval(timer); bar.classList.add('is-blocked'); ul.append(el('li', 'is-end', `止まった：${scenario.block ?? '攻撃は、通らなかった'}`)); return; }
      ul.append(el('li', null, scenario.stop[i])); i += 1; if (i === 1) bar.classList.add('is-play');
    }, 900);
  }

  // 自作チャレンジ：ゲームの外でツールを作り、出てきた答えを入力する（評価には、関係しない）
  function openChallenge() {
    const ch = scenario.challenge; if (!ch) return;
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

  startPhase(0);
  return { advance, S };
}
