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
    inv: [], wire: [], lying: [], log: [], flags: {}, msgs: [], effort: [], done: false,
  };
  const P = () => scenario.phases[S.phase];

  const tools = {
    pick: ['拾う', 'コピーを持ち物に入れる。元の物は、そのまま流れる'],
    grab: ['奪う', '流れている物を、持ち物に入れる。Bob には、届かなくなる'],
    swap: ['取り替える', '持ち物の物を選び、流れている物をクリックして、差し替える'],
    combine: ['合わせる', '持ち物から2つ選ぶ（暗号文＋鍵、通信＋指紋 など）'],
    compute: ['計算する', '持ち物の物から、指紋（ハッシュ）や MAC を作る'],
    edit: ['書き換える', '持ち物の物の、本文を書き換える'],
    replay: ['再送する', '持ち物の物を、もう一度、線に流す'],
    delay: ['遅らせる', '流れている物を、2ステップ遅らせる'],
    try: ['試す', '解読を試す。手間の見積もりも、出る'],
    inspect: ['調べる', '物の種類・置き場所・手間を、確かめる'],
    compose: ['文面を作る', '連絡の文面を、手口を選んで作る'],
  };

  function say(text, tone = '') { S.msgs.unshift({ text, tone }); S.msgs = S.msgs.slice(0, 6); }
  const flag = (k) => { S.flags[k] = true; };
  const api = { S, say, flag, pkt, item, clone, fnv, caesar, shownText };

  function startPhase(i) {
    S.phase = i; S.round = 0; S.tick = 0; S.log = []; S.flags = {}; S.msgs = []; S.effort = [];
    S.inv = (P().inv?.(api) ?? []).map((x) => ({ ...x }));
    S.lying = (P().lying?.(api) ?? []).map((x) => ({ ...x }));
    newWire();
    S.tool = P().tools[0];
    S.sel = null;
    say(P().start ?? 'まず、公開ゾーンを見てみよう。', '');
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

  function inspectLines(it) {
    if (it.inspect) return it.inspect;
    const L = [];
    if (it.kind === 'packet') {
      L.push(`送り主：${it.from === 'alice' ? 'Alice' : it.from === 'bob' ? 'Bob' : it.from}　宛先：${it.to === 'alice' ? 'Alice' : it.to === 'bob' ? 'Bob' : it.to}`);
      L.push(`大きさ：約 ${Math.max(16, (it.body?.length ?? 0) * 3)} バイト　時刻：6:02`);
      L.push(it.enc && !it.corrupt ? '中身：暗号化されていて、読めない' : '中身：そのまま読める');
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
      if (T === 'pick') { addInv(clone(p)); flag('pick'); flag(`pick:${p.label ?? p.kind}`); say('コピーを持ち物に入れた。元の通信は、そのまま流れる。', 'ok'); P().onUse?.('pick', p, api); }
      else if (T === 'grab') { s.state = 'grabbed'; addInv(clone(p)); S.log.push({ pkt: p, res: { ok: false, missed: true, note: 'Bob には、届きませんでした' } }); flag('grab'); say('通信を奪った。Bob には、届かない。', 'ok'); }
      else if (T === 'delay') { s.eta += 2; flag('delay'); say(`この通信を、2ステップ遅らせた（届くのは ${s.eta} ステップ目）。`, 'ok'); }
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
      say(`${ALG[it.enc.alg] ?? '暗号'}は、試しても、解けませんでした。手間：${it.attackCost ?? 'ほぼ、無限'}。`, 'bad');
      return;
    }
    say('試せる物ではありません。', 'bad');
  }

  async function bruteCaesar(it) {
    return new Promise((resolve) => {
      const back = el('div', 'atk-modal-back');
      const box = el('div', 'atk-modal');
      box.append(el('h2', null, '総当たり：ずらし幅を、全部、試す'), el('p', 'atk-lead', '読める行を、クリックしてください。'));
      const list = el('ul', 'atk-brute');
      for (let k = 1; k <= 25; k += 1) {
        const li = el('li'); li.append(el('span', 'k', `幅 ${k}`), el('span', null, caesar(shownText(it), -k)));
        li.dataset.k = String(k);
        list.append(li);
      }
      const cancel = el('button', 'button button-secondary', 'やめる');
      cancel.type = 'button';
      list.onclick = (ev) => {
        const li = ev.target.closest('li'); if (!li) return;
        if (Number(li.dataset.k) === 3) { back.remove(); resolve(true); } else { li.classList.add('is-miss'); }
      };
      cancel.onclick = () => { back.remove(); resolve(false); };
      box.append(list, cancel); back.append(box); document.body.append(back);
    });
  }

  function combine(a, b) {
    const pair = (x, y) => [a, b].find((i) => i.kind === x) && [a, b].find((i) => i.kind === y);
    const get = (k) => [a, b].find((i) => i.kind === k);
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
        addInv(item({ kind: 'hash', label: '指紋', value: fnv(body), of: body }));
        flag('computeHash'); say('指紋を計算した。誰でも作れる。持ち物に入った。', 'ok'); back.remove(); resolve();
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

  // ----- コマンドのメニュー（線・物・持ち物を、クリック／タップすると出る） -----
  const MENU = {
    slot: ['pick', 'grab', 'swap', 'delay', 'inspect', 'try'],
    lying: ['pick', 'inspect', 'try'],
    inv: ['inspect', 'edit', 'compute', 'combine', 'replay', 'try'],
  };
  const CMD = { pick: 'コピーする', grab: '奪う', swap: '取り替える…', delay: '遅らせる', inspect: '調べる', try: '解読を試す', edit: '書き換える', compute: '計算する…', combine: '合わせる…', replay: '再送する' };
  let menuEl = null;
  function closeMenu() { menuEl?.remove(); menuEl = null; }
  function openMenu(type, id, ev) {
    closeMenu();
    const ph = P();
    const cmds = MENU[type].filter((c) => ph.tools.includes(c));
    const m = el('div', 'atk-menu');
    m.setAttribute('role', 'menu');
    const title = el('div', 'atk-menu-t', type === 'slot' ? '流れている通信' : type === 'lying' ? '落ちている物' : '持ち物');
    m.append(title);
    const run = (tool, sel) => { closeMenu(); S.tool = tool; S.sel = sel ?? null; onTarget(type, id); };
    cmds.forEach((c) => {
      const b = el('button', 'atk-menu-i', CMD[c]); b.type = 'button'; b.dataset.cmd = c;
      b.onclick = (e) => {
        e.stopPropagation();
        if (c === 'swap') {
          const src = S.inv.filter((x) => x.kind === 'packet');
          pickFromList(m, '何と取り替える？', src, (it) => run('swap', it.id));
        } else if (c === 'combine') {
          const others = S.inv.filter((x) => x.id !== id);
          pickFromList(m, '何と合わせる？', others, (it) => { closeMenu(); S.tool = 'combine'; S.sel = id; onTarget('inv', it.id); });
        } else run(c);
      };
      m.append(b);
    });
    if (cmds.length === 0) m.append(el('p', 'atk-lead', 'いまは、できることがありません。'));
    const x = Math.min(ev.clientX, window.innerWidth - 240); const y = Math.min(ev.clientY, window.innerHeight - 280);
    m.style.left = `${Math.max(8, x)}px`; m.style.top = `${Math.max(8, y)}px`;
    document.body.append(m);
    menuEl = m;
  }
  function pickFromList(m, title, list, onPick) {
    m.replaceChildren(el('div', 'atk-menu-t', title));
    if (list.length === 0) m.append(el('p', 'atk-lead', '持ち物に、選べる物がありません。'));
    list.forEach((it) => {
      const b = el('button', 'atk-menu-i', `${itemTitle(it)}：${itemBody(it).slice(0, 14)}`); b.type = 'button'; b.dataset.pick = it.id;
      b.onclick = (e) => { e.stopPropagation(); onPick(it); };
      m.append(b);
    });
  }
  document.addEventListener('click', (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });

  // ----- 描画（裏面：公開ゾーンだけ。線に、色も、文字もない） -----
  function render() {
    checkGoals();
    root.replaceChildren();
    const ph = P();
    const grid = el('div', 'atk-play');

    // 左：ステージの情報（表面の左のパネルと同じ位置）
    const info = el('aside', 'atk-info');
    info.append(el('p', 'atk-tag2', scenario.badge), el('h2', null, scenario.title));
    if (scenario.link) info.append(el('p', 'atk-lead', `表面のステージ：${scenario.link}`));
    const role = el('p', 'atk-role', scenario.roleText ?? '');
    if (scenario.roleText) info.append(role);
    info.append(el('p', 'atk-lead', ph.lead));
    const q = el('div', 'atk-questions');
    q.append(el('b', null, '攻撃者の問い'));
    (ph.questions ?? scenario.questions ?? ['何が見える？', '何ができる？', '一番楽に破れる所は？']).forEach((t) => q.append(el('span', null, t)));
    info.append(q);
    const gh = el('div', 'atk-guide-head'); gh.append(chr(scenario.who ?? 'mallory', 40), el('p', 'atk-guide-title', '目標'));
    const gl = el('ul', 'atk-tasks'); gl.id = 'atk-tasks';
    ph.goals.forEach((g) => { const li = el('li', S.flags[`goal:${g.key}`] ? 'is-done' : '', g.text); li.dataset.key = g.key; gl.append(li); });
    info.append(gh, gl);
    info.append(el('p', 'atk-guide-note', 'Eve は、情報を手に入れられれば成功。Mallory は、書き換えて流せれば成功。向こうでどうなるかは、分かりません。'));

    // 中央：公開ゾーンだけの盤面
    const main = el('div', 'atk-play-main');
    const board = el('div', 'atk-board');
    board.append(el('div', 'atk-board-t', '公開ゾーン（誰でも見られる）'));
    const edges = el('div', 'atk-edges'); edges.append(el('span', null, '◀ Alice 側（見えない）'), el('span', null, 'Bob 側（見えない）▶'));
    board.append(edges);
    const lines = el('div', 'atk-lines');
    S.wire.forEach((s, i) => {
      const row = el('button', `atk-wire is-${s.state}`); row.type = 'button'; row.dataset.id = s.id; row.dataset.type = 'slot';
      row.setAttribute('aria-label', `線 ${i + 1}`);
      row.append(el('span', 'atk-wire-line'), el('span', 'atk-wire-dot'), el('span', 'atk-wire-no', `線 ${i + 1}`));
      lines.append(row);
    });
    if (S.wire.length === 0) lines.append(el('p', 'atk-lead', '線の上には、いま、何も流れていません。「進める」で、次の通信が流れます。'));
    board.append(lines);
    if (S.lying.length) {
      const lay = el('div', 'atk-objs'); lay.append(el('small', 'atk-lead', '落ちている物'));
      S.lying.forEach((it) => {
        const c = el('button', 'atk-obj'); c.type = 'button'; c.dataset.id = it.id; c.dataset.type = 'lying'; c.textContent = it.label;
        lay.append(c);
      });
      board.append(lay);
    }
    main.append(board);
    const bar = el('div', 'atk-hotbar');
    const next = el('button', 'button button-primary atk-advance', '進める ▶'); next.type = 'button'; next.id = 'atk-advance'; next.onclick = advance;
    bar.append(next);
    if (ph.compose) {
      const cb = el('button', 'button btn-mal', '文面を作る'); cb.type = 'button'; cb.id = 'atk-compose'; cb.onclick = openCompose; bar.append(cb);
    }
    main.append(bar, el('p', 'atk-hint', '線・落ちている物・持ち物を、クリック（タップ）すると、できることが出ます。'));

    // 持ち物
    const inv = el('div', 'atk-inv'); inv.append(el('b', null, '持ち物（自分で手に入れた物）'));
    const slots = el('div', 'atk-inv-grid');
    if (S.inv.length === 0) slots.append(el('p', 'atk-lead', 'まだ、何も持っていません。線や、落ちている物から、コピーしよう。'));
    S.inv.forEach((it) => {
      const c = el('button', 'atk-card atk-inv-item'); c.type = 'button'; c.dataset.id = it.id; c.dataset.type = 'inv';
      c.append(el('b', null, itemTitle(it)), el('span', 'atk-card-body', itemBody(it)));
      const ch = it.kind === 'packet' ? chips(it) : []; if (ch.length) c.append(el('span', 'atk-chips', ch.join('・')));
      slots.append(c);
    });
    inv.append(slots); main.append(inv);

    // 右：やったこと
    const side = el('aside', 'atk-guide');
    side.append(el('p', 'atk-guide-title', '記録'));
    const ms = el('div', 'atk-msgs'); S.msgs.forEach((m) => ms.append(el('p', `atk-msg ${m.tone}`, m.text))); side.append(ms);
    if (S.inspectBox) {
      const ib = el('div', 'atk-inspect'); ib.append(el('b', null, S.inspectBox.title));
      S.inspectBox.lines.forEach((l) => ib.append(el('p', null, l))); side.append(ib);
    }
    grid.append(info, main, side);
    root.append(grid);
    root.querySelectorAll('[data-type]').forEach((c) => { c.onclick = (e) => { e.stopPropagation(); openMenu(c.dataset.type, c.dataset.id, e); }; });
    if (allDone()) showClear();
  }

  function showClear() {
    const last = S.phase === scenario.phases.length - 1;
    const box = el('div', 'atk-verdict is-ok atk-clear');
    box.append(el('p', null, last ? '目標達成！' : `このパートは、目標達成（${S.phase + 1} / ${scenario.phases.length}）`));
    // 霧の向こうで、実際に、どうなっていたか
    const rows = S.log.filter((l) => l.pkt && l.res);
    if (rows.length) {
      const d = el('div', 'atk-debrief'); d.append(el('b', null, '霧の向こうで、実際に起きたこと'));
      rows.slice(-6).forEach((l) => d.append(el('p', null, `・${l.res.note ?? (l.res.ok ? '受け取った' : '拒否した')}`)));
      box.append(d);
    }
    if (P().after) box.append(el('p', null, P().after));
    if (last) {
      box.append(el('p', 'atk-principle', `考え方：${scenario.principle}`));
      box.append(el('p', null, `守る側（表面）は、どう考えれば防げたか：${scenario.defense}`));
    }
    const row = el('div', 'atk-actions');
    const again = el('button', 'button button-secondary', 'もう一度、やってみる'); again.type = 'button'; again.id = 'atk-again';
    again.onclick = () => startPhase(S.phase);
    const nx = el('button', 'button button-primary is-next', last ? 'ステージ一覧へ' : '次のパートへ'); nx.type = 'button'; nx.id = 'atk-clear-next';
    nx.onclick = () => { if (last) hooks.onClear?.(); else startPhase(S.phase + 1); };
    row.append(again, nx); box.append(row); root.append(box);
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
    ok.onclick = () => { back.remove(); ph.compose.send([...sel], api); render(); };
    row.append(c, ok); box.append(checks, row); back.append(box); document.body.append(back);
  }

  function chr(kind, w) { return makeCharacter(kind, { width: w, height: Math.round(w * 1.28), className: 'character' }); }

  startPhase(0);
  return { advance, S };
}
