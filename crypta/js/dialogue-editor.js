// dialogue-editor.js
// セリフ（content/dialogue.json）と、名前（content/names.json）を、画面で、書き換えるための、管理者用ツール。
//   ・書き換えると、その場で、吹き出しの見本が、変わる
//   ・文字数の目安（自動送りは、短い工程が 1 秒・解読の計算が 3 秒なので、短いほど、読める）と、差し込み部分（{message} など）の、まちがいを、知らせる
//   ・「ゲームで試す」: このブラウザの中だけで、試し用のセリフ・名前を、使って、ゲームを動かせる
//   ・「保存」: dialogue.json / names.json を、ダウンロード。cryta の content フォルダの、同じ名前のファイルを、置き換える
import './texts.js';
import { requireAdmin, OVERRIDE_PREFIX } from './admin.js';
if (!requireAdmin()) await new Promise(() => {}); // 管理者モードでなければ、ここで止める

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- 場所ごとの、説明 ---------- */
const GROUP_TITLES = {
  alice: 'アリスのセリフ',
  bob: 'ボブのセリフ',
  reaction: '攻撃されたときの、アリスとボブ',
  outcome: '攻撃の結果（ひとこと）',
  badWhat: '受け入れてしまったものの名前',
  ui: '公開ゾーンの記録',
  attacker: 'イブ（盗み見る人）のセリフ',
  breakMethods: '暗号の破り方',
  mallory: 'マロリー（書き換える人）のセリフ',
};
const LABELS = {
  'alice.send': 'アリスが、メッセージを、送り出すとき',
  'alice.eavesdropped': 'アリスの、盗み見られたことに、気づけない、一言',
  'bob.received': 'ボブに、本物の通信が、届いたとき',
  'bob.weird': 'ボブが、おかしなデータを、受け取ったとき',
  'bob.nothing': 'ボブに、何も、届かなかったとき',
  'reaction.rejected.bob': 'ボブが、攻撃に気づいて、拒否したとき',
  'reaction.bad.bob': 'ボブが、気づけずに、受け取ってしまったとき',
  'reaction.bad.alice.tamper': 'アリスの反論: 書き換えられた',
  'reaction.bad.alice.forge': 'アリスの反論: 偽物を作られた',
  'reaction.bad.alice.keyswap': 'アリスの反論: 公開鍵を、すり替えられた',
  'reaction.bad.alice.replay': 'アリスの反論: 古い通信を、送り直された',
  'reaction.lost.bob': 'ボブが、読めないものを、受け取ったとき',
  'reaction.ok.bob': '攻撃されても、何も変わらなかったとき',
  'outcome.rejected': '結果: 見抜いた',
  'outcome.bad': '結果: 受け入れてしまった',
  'outcome.lost': '結果: 届かなかった',
  'outcome.ok': '結果: 影響なし',
  'badWhat.tampered': '名前: 書き換えられた本文',
  'badWhat.forged': '名前: 偽の本文',
  'badWhat.garbled': '名前: 壊れたデータ',
  'badWhat.oldComm': '名前: 古い通信',
  'badWhat.weird': '名前: おかしなデータ',
  'ui.logHead': '公開ゾーンの記録の、見出し',
  'ui.attackLog': '公開ゾーンの記録の、1行',
  'attacker.capture.think': 'イブ: 線の中身を、見る（考え中）',
  'attacker.capture.act': 'イブ: コピーした（結果）',
  'attacker.keyLine.think': 'イブ: 線に、鍵が流れていないか（考え中）',
  'attacker.keyLine.found': 'イブ: 鍵を、見つけた',
  'attacker.keyLine.publicKey': 'イブ: 公開鍵だった（使えない）',
  'attacker.keyNode.think': 'イブ: 置いてある鍵を、探す（考え中）',
  'attacker.keyNode.found': 'イブ: 置いてあった鍵を、拾った',
  'attacker.keyNode.notFound': 'イブ: 使える鍵は、なかった',
  'attacker.keyNone.think': 'イブ: ほかに、鍵は？（考え中）',
  'attacker.keyNone.act': 'イブ: 鍵は、見つからない',
  'attacker.open.thinkBrute': 'イブ: 暗号を、破れるか（考え中）',
  'attacker.open.thinkKey': 'イブ: 盗んだ鍵で、開けられるか（考え中）',
  'attacker.open.actBrute': 'イブ: 解読できた',
  'attacker.open.actKey': 'イブ: 鍵で、開けた',
  'attacker.openFail.think': 'イブ: 開けられるか（考え中）',
  'attacker.openFail.act': 'イブ: 開けられなかった',
  'attacker.read.think': 'イブ: メッセージは、読めるか（考え中）',
  'attacker.read.ok': 'イブ: 読めた',
  'attacker.read.fail': 'イブ: 読めなかった',
  'breakMethods.1': '破り方 1: シーザー暗号（総当たり）',
  'breakMethods.2': '破り方 2: 文字の出現回数（頻度分析）',
  'breakMethods.3': '破り方 3: 暗号の構造の弱点',
  'breakMethods.4': '破り方 4: 素因数分解（RSA）',
  'mallory.arrive': 'マロリーが、やってきたとき',
  'mallory.plans.tamper': 'マロリー: 書き換えようと、考える',
  'mallory.plans.forge': 'マロリー: なりすまそうと、考える',
  'mallory.plans.keyswap': 'マロリー: 公開鍵を、すり替えようと、考える',
  'mallory.plans.replay': 'マロリー: 送り直そうと、考える',
  'mallory.edit.act': 'マロリー: 書き換えた結果',
  'mallory.edit.noChange': 'マロリー: 何も、変わらなかった',
  'mallory.verdict.textGood': 'ボブの側の結果の言い方（守れた）',
  'mallory.verdict.textBad': 'ボブの側の結果の言い方（やられた）',
  'mallory.verdict.detail.rejected': '結果の補足: 見抜いた',
  'mallory.verdict.detail.bad': '結果の補足: 受け入れてしまった',
  'mallory.verdict.detail.lost': '結果の補足: 届かなかった',
  'mallory.verdict.detail.ok': '結果の補足: 影響なし',
};
// 見本に使う、差し込み部分の、ことば
const SAMPLE = {
  message: 'PHOTO.JPG', node: '署名を検証', what: '書き換えられた本文', attack: '改ざん', result: '見抜いた', label: '暗号文（AES）',
  data: '79 d3 70…', key: '共通鍵', alg: 'AES', method: '鍵は25通りだけ。全部、試す。', weakness: 'ずらし幅が、25通りしかない', effect: '壊れたデータ',
};

/* ---------- 状態 ---------- */
let tab = 'dialogue';
const S = {
  dialogue: { original: null, current: null, key: 'dialogue', file: 'dialogue.json' },
  names: { original: null, current: null, key: 'names', file: 'names.json' },
};
let namesMap = {}; // 見本の表示に使う（現在の名前）

const fmtErr = (e) => String(e?.message ?? e);
function setStatus(msg, cls = '') {
  const s = $('#status');
  s.textContent = msg;
  s.className = `de-status ${cls}`;
}

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  return res.json();
}

/* ---------- 部品: 1つの項目 ---------- */
const pathGet = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const pathSet = (obj, path, v) => {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = v;
};
const varsIn = (s) => new Set([...String(s ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const applyNames = (s) => {
  let out = String(s ?? '');
  Object.entries(namesMap).sort((a, b) => b[0].length - a[0].length).forEach(([k, v]) => { if (k) out = out.split(k).join(v); });
  return out;
};
const sample = (s) => applyNames(String(s ?? '').replace(/\{(\w+)\}/g, (w, n) => SAMPLE[n] ?? w));

function lenInfo(n, limit) {
  if (n <= limit) return ['ok', `${n} 字`];
  if (n <= limit * 1.6) return ['long', `${n} 字（やや長い）`];
  return ['over', `${n} 字（長い）`];
}

function bubbleClass(path) {
  const c = ['de-bubble'];
  if (/(^|\.)(think|thinkBrute|thinkKey)$/.test(path) || path.startsWith('mallory.plans') || path === 'mallory.arrive') c.push('is-think');
  if (path.startsWith('reaction.bad')) c.push('is-bad');
  if (path.startsWith('reaction.ok') || path.startsWith('reaction.rejected')) c.push('is-good');
  return c.join(' ');
}

function makeCard(path, entryOrString, memoVars) {
  const isLine = typeof entryOrString === 'object';
  const card = el('div', 'de-card');
  card.dataset.path = path;
  const head = el('div', 'de-head');
  head.append(el('strong', null, LABELS[path] ?? path), el('code', null, path));
  const reset = el('button', 'de-reset', '元に戻す');
  reset.type = 'button';
  head.append(reset);

  const fields = el('div', 'de-fields');
  const preview = el('div', 'de-preview');
  const bubble = el('div', bubbleClass(path));
  preview.append(bubble);
  const warn = el('div', 'de-warn');
  warn.hidden = true;
  const hint = el('div', 'de-hint');
  hint.textContent = memoVars ?? '';
  hint.hidden = !memoVars;

  const spec = isLine ? [['text', 'セリフ', 20], ...(('detail' in entryOrString) ? [['detail', '補足', 32]] : [])] : [['', 'セリフ', 24]];
  const inputs = [];
  const allowed = new Set([...(memoVars ? varsIn(memoVars) : []), ...varsIn(isLine ? entryOrString.text : entryOrString), ...varsIn(isLine ? entryOrString.detail : '')]);

  const sub = tab === 'dialogue' ? S.dialogue : S.names;
  const getVal = (f) => pathGet(sub.current, f ? `${path}.${f}` : path) ?? '';
  const setVal = (f, v) => pathSet(sub.current, f ? `${path}.${f}` : path, v);
  const origVal = (f) => pathGet(sub.original, f ? `${path}.${f}` : path) ?? '';

  const refresh = () => {
    const t = getVal(isLine ? 'text' : '');
    const d = isLine && 'detail' in entryOrString ? getVal('detail') : '';
    bubble.textContent = sample(t);
    if (d) bubble.append(Object.assign(el('small'), { textContent: sample(d) }));
    let changed = false;
    spec.forEach(([f, , limit], i) => {
      const v = getVal(f);
      const [state, label] = lenInfo([...v].length, limit);
      const badge = inputs[i].badge;
      badge.textContent = label;
      badge.className = `de-len${state === 'ok' ? '' : ` is-${state}`}`;
      if (v !== origVal(f)) changed = true;
    });
    card.classList.toggle('is-changed', changed);
    // 差し込み部分のまちがい
    const used = new Set([...varsIn(t), ...varsIn(d)]);
    const unknown = [...used].filter((n) => !allowed.has(n));
    const open = [t, d].some((x) => (String(x).match(/\{/g) ?? []).length !== (String(x).match(/\}/g) ?? []).length);
    warn.hidden = !(unknown.length || open);
    warn.textContent = open ? '「{」と「}」の数が、合っていません。' : `知らない差し込み部分: ${unknown.map((n) => `{${n}}`).join(' ')}（ゲームは、これを、そのまま、画面に出します）`;
    updateCount();
  };

  spec.forEach(([f, label]) => {
    const row = el('label', 'de-field');
    row.append(el('span', null, label));
    const input = el('input');
    input.type = 'text';
    input.value = getVal(f);
    input.addEventListener('input', () => { setVal(f, input.value); refresh(); saveDraft(); });
    const badge = el('span', 'de-len');
    row.append(input, badge);
    fields.append(row);
    inputs.push({ input, badge });
  });
  reset.addEventListener('click', () => {
    spec.forEach(([f], i) => { setVal(f, origVal(f)); inputs[i].input.value = origVal(f); });
    refresh();
    saveDraft();
  });
  card.append(head, fields, preview, hint, warn);
  card._search = `${LABELS[path] ?? ''} ${path} ${isLine ? `${entryOrString.text} ${entryOrString.detail ?? ''}` : entryOrString}`.toLowerCase();
  refresh();
  return card;
}

/* ---------- セリフの画面 ---------- */
function memoFor(parent, key) {
  const m = parent?.[`_言葉${key}`];
  return typeof m === 'string' ? m : '';
}

function buildDialogue() {
  const root = $('#panel-dialogue');
  const nav = $('#nav');
  root.replaceChildren();
  nav.replaceChildren();
  const data = S.dialogue.current;
  const orig = S.dialogue.original;

  Object.keys(orig).forEach((top) => {
    if (top.startsWith('_')) return;
    const group = el('section', 'de-group');
    group.id = `g-${top}`;
    group.append(el('h2', null, GROUP_TITLES[top] ?? top));
    const desc = orig[top]?._説明;
    if (desc) group.append(el('p', 'de-desc', desc));
    let n = 0;

    const walk = (obj, path, host) => {
      Object.entries(obj).forEach(([k, v]) => {
        if (k.startsWith('_')) return;
        const p = `${path}.${k}`;
        if (typeof v === 'string') {
          host.append(makeCard(p, v, memoFor(obj, k)));
          n += 1;
        } else if (v && typeof v === 'object' && typeof v.text === 'string') {
          host.append(makeCard(p, v, memoFor(obj, k)));
          n += 1;
        } else if (v && typeof v === 'object') {
          const sub = el('div', 'de-sub');
          if (v._説明) sub.append(el('p', 'de-desc', v._説明));
          host.append(sub);
          walk(v, p, sub);
        }
      });
    };
    walk(orig[top], top, group);
    root.append(group);
    const a = el('a', null, GROUP_TITLES[top] ?? top);
    a.href = `#g-${top}`;
    a.append(' ', el('small', null, `${n}`));
    nav.append(a);
  });
  void data;
  updateCount();
}

/* ---------- 名前の画面 ---------- */
function buildNames() {
  const root = $('#panel-names');
  root.replaceChildren();
  const box = el('div', 'de-names');
  box.append(el('p', 'de-desc', 'ゲームの画面に出る、すべての文章の、キャラクターの名前が、一度に、置き換わります。左の呼び名（Alice など）は、プログラムの中の呼び名です。右の名前だけを、変えます。'));
  const sub = S.names;
  const sampleBox = el('p', 'de-sample');
  const updateSample = () => {
    const nm = sub.current.names;
    sampleBox.textContent = `${nm.Alice} が、${nm.Bob} に、メッセージを送る。途中で、${nm.Eve} が、盗み見て、${nm.Mallory} が、書き換えようとする。`;
    namesMap = { ...sub.current.names };
  };
  [['Alice', 'メッセージを送る人'], ['Bob', 'メッセージを受け取る人'], ['Eve', '盗み見る人'], ['Mallory', '書き換える人']].forEach(([key, role]) => {
    const card = el('div', 'de-card');
    card.dataset.path = `names.${key}`;
    card._search = `${key} ${role}`.toLowerCase();
    const head = el('div', 'de-head');
    head.append(el('strong', null, role), el('code', null, key));
    const reset = el('button', 'de-reset', '元に戻す');
    reset.type = 'button';
    head.append(reset);
    const row = el('label', 'de-field');
    row.append(el('span', null, '名前'));
    const input = el('input');
    input.type = 'text';
    input.value = sub.current.names[key];
    const badge = el('span', 'de-len');
    row.append(input, badge);
    const refresh = () => {
      const v = sub.current.names[key];
      badge.textContent = `${[...v].length} 字`;
      card.classList.toggle('is-changed', v !== sub.original.names[key]);
      updateSample();
      updateCount();
    };
    input.addEventListener('input', () => { sub.current.names[key] = input.value; refresh(); saveDraft(); });
    reset.addEventListener('click', () => { sub.current.names[key] = sub.original.names[key]; input.value = sub.original.names[key]; refresh(); saveDraft(); });
    card.append(head, el('div', 'de-fields'));
    card.querySelector('.de-fields').append(row);
    box.append(card);
    refresh();
  });
  box.append(sampleBox);
  root.append(box);
  updateSample();
}

/* ---------- 変更の数・下書き・検索 ---------- */
function diffCount(s) {
  if (!s.original || !s.current) return 0;
  let n = 0;
  const walk = (a, b) => {
    Object.keys(a ?? {}).forEach((k) => {
      if (k.startsWith('_')) return;
      if (typeof a[k] === 'object' && a[k]) walk(a[k], b?.[k]);
      else if (a[k] !== b?.[k]) n += 1;
    });
  };
  walk(s.original, s.current);
  return n;
}
function updateCount() {
  const s = S[tab];
  const n = diffCount(s);
  const c = $('#changed');
  c.textContent = n ? `変更 ${n} か所（まだ、保存していません）` : '変更なし';
  c.classList.toggle('has-change', n > 0);
}
function saveDraft() {
  try {
    ['dialogue', 'names'].forEach((k) => {
      if (diffCount(S[k]) > 0) localStorage.setItem(`crypta:draft:${k}`, JSON.stringify(S[k].current));
      else localStorage.removeItem(`crypta:draft:${k}`);
    });
  } catch { /* 下書きが、残せなくても、続けられる */ }
  updateCount();
}
function applySearch() {
  const q = $('#search').value.trim().toLowerCase();
  document.querySelectorAll(`#panel-${tab} .de-card`).forEach((c) => c.classList.toggle('is-hidden', Boolean(q) && !c._search.includes(q)));
}

/* ---------- 保存・コピー・読み込み・試す ---------- */
const exportText = (s) => `${JSON.stringify(s.current, null, 2)}\n`;
function setTab(name) {
  tab = name;
  document.querySelectorAll('.de-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
  $('#panel-dialogue').hidden = name !== 'dialogue';
  $('#panel-names').hidden = name !== 'names';
  $('#nav').hidden = name !== 'dialogue';
  $('#search').value = '';
  applySearch();
  updateCount();
}

$('#save').addEventListener('click', () => {
  const s = S[tab];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([exportText(s)], { type: 'application/json' }));
  a.download = s.file;
  a.click();
  setStatus(`${s.file} を、ダウンロードしました。crypta の content フォルダの、同じ名前のファイルを、置き換えてください。`, 'is-ok');
});
$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(exportText(S[tab]));
    setStatus(`${S[tab].file} の中身を、コピーしました。`, 'is-ok');
  } catch {
    setStatus('コピーできませんでした。「保存」を、使ってください。', 'is-ng');
  }
});
$('#load').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const s = S[tab];
    if (tab === 'names' && !data.names) throw new Error('names.json の形では、ありません');
    s.current = data;
    if (!s.original) s.original = clone(data);
    tab === 'dialogue' ? buildDialogue() : buildNames();
    saveDraft();
    setStatus(`${f.name} を、読み込みました。`, 'is-ok');
  } catch (err) {
    setStatus(`読み込めませんでした: ${fmtErr(err)}`, 'is-ng');
  }
  e.target.value = '';
});
$('#revert').addEventListener('click', () => {
  if (!window.confirm('この画面の、書き換えを、すべて、元に戻します。よいですか？')) return;
  const s = S[tab];
  s.current = clone(s.original);
  tab === 'dialogue' ? buildDialogue() : buildNames();
  saveDraft();
  setStatus('元に戻しました。', 'is-ok');
});
$('#try').addEventListener('click', () => {
  try {
    localStorage.setItem(`${OVERRIDE_PREFIX}dialogue`, JSON.stringify(S.dialogue.current));
    localStorage.setItem(`${OVERRIDE_PREFIX}names`, JSON.stringify(S.names.current));
    localStorage.setItem('crypta:dev', '1'); // 確認用に、どのステージも、開けるようにする（管理者パネルで、オフにできる）
  } catch {
    setStatus('試し用の設定を、保存できませんでした。', 'is-ng');
    return;
  }
  setStatus('試し用に、保存しました。確認のため、全ステージを、解放しました。ゲームを、新しいタブで、開きます（画面の左下に、目印が出ます）。', 'is-ok');
  window.open('simulator.html?stage=stage01', '_blank');
});
$('#untry').addEventListener('click', () => {
  Object.keys(localStorage).filter((k) => k.startsWith(OVERRIDE_PREFIX)).forEach((k) => localStorage.removeItem(k));
  setStatus('試し用の設定を、解除しました。', 'is-ok');
});
document.querySelectorAll('.de-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
$('#search').addEventListener('input', applySearch);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#save').click(); }
});
window.addEventListener('beforeunload', (e) => {
  if (diffCount(S.dialogue) + diffCount(S.names) > 0) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- 起動 ---------- */
async function init() {
  try {
    S.dialogue.original = await loadJson('content/dialogue.json');
    S.names.original = await loadJson('content/names.json');
  } catch (err) {
    setStatus(`${fmtErr(err)}。ファイルを、直接、開いているときは、「読み込む」で、dialogue.json を、選んでください。`, 'is-ng');
    return;
  }
  S.dialogue.current = clone(S.dialogue.original);
  S.names.current = clone(S.names.original);
  // 前回の、下書きがあれば、続きから
  try {
    ['dialogue', 'names'].forEach((k) => {
      const raw = localStorage.getItem(`crypta:draft:${k}`);
      if (raw && window.confirm(`前回の、書きかけ（${S[k].file}）が、残っています。続きから、始めますか？`)) S[k].current = JSON.parse(raw);
    });
  } catch { /* 下書きが、読めなければ、最初から */ }
  namesMap = { ...S.names.current.names };
  buildDialogue();
  buildNames();
  setTab('dialogue');
  setStatus('書き換えると、右の見本が、すぐ、変わります。短いセリフほど、自動送りで、読みきれます。', 'is-ok');
}
init();
