// dialogue-editor.js
// 文章の編集（管理者用）: セリフ・名前・ステージの文章（説明スライド）・ブロックの説明を、画面で書き換える。
//   ・書き換えると、その場で、見本が変わる。変更は、いつも、この端末（localStorage）に、自動で、保存される
//     （閉じても、次に開いたとき、そのまま、復元される。ゲームに、適用したか、しないかは、関係ない）
//   ・「ゲームで試す」: この端末の、管理者モードのときだけ、書き換えた文章で、ゲームを動かせる
//   ・「ダウンロード」: ファイルに、して、content フォルダの、同じ名前のファイルを、置き換える
import './texts.js';
import { requireAdmin, OVERRIDE_PREFIX } from './admin.js';
import { loadStages } from './stages.js';
import { COMPONENTS } from './engine.js';
if (!requireAdmin()) await new Promise(() => {}); // 管理者モードでなければ、ここで止める

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
  dialogue: { original: null, current: null, file: 'dialogue.json', draft: 'crypta:draft:dialogue' },
  names: { original: null, current: null, file: 'names.json', draft: 'crypta:draft:names' },
  parts: { original: null, current: null, file: 'parts.json', draft: 'crypta:draft:parts' },
  glossary: { original: null, current: null, file: 'glossary.json', draft: 'crypta:draft:glossary' },
  uitexts: { original: null, current: null, file: 'ui-texts.json', draft: 'crypta:draft:uitexts' },
};
let termId = null;
const RAW = new Map(); // ステージの設定（ロジック）: file → { original, current }
let rawId = null;
const STAGES = new Map(); // id → { original, current, title }
let stageId = null;
let namesMap = {};
const getSrc = () => (tab === 'stage' ? { ...STAGES.get(stageId), file: `${stageId}.json`, draft: `crypta:draft:stage:${stageId}` } : tab === 'raw' ? { ...RAW.get(rawId), file: `${rawId}.json`, draft: `crypta:draft:raw:${rawId}` } : S[tab]);

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

/* ---------- 変更の数・自動保存 ---------- */
function countDiff(a, b) {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return a === b ? 0 : 1;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let n = 0;
  keys.forEach((k) => { if (!String(k).startsWith('_')) n += countDiff(a[k], b[k]); });
  return n;
}
const allSources = () => [S.dialogue, S.names, S.parts, S.glossary, S.uitexts, ...[...RAW.entries()].map(([id, v]) => ({ ...v, draft: `crypta:draft:raw:${id}` })), ...[...STAGES.entries()].map(([id, v]) => ({ ...v, draft: `crypta:draft:stage:${id}` }))];
function updateCount() {
  const src = getSrc();
  const n = src?.original ? countDiff(src.original, src.current) : 0;
  const c = $('#changed');
  c.textContent = n ? `変更 ${n} か所` : '変更なし';
  c.classList.toggle('has-change', n > 0);
}
function autosave(explicit = false) {
  try {
    allSources().forEach((s) => {
      if (!s.original) return;
      if (countDiff(s.original, s.current) > 0) localStorage.setItem(s.draft, JSON.stringify(s.current));
      else localStorage.removeItem(s.draft);
    });
    const t = new Date().toLocaleTimeString('ja-JP');
    $('#saved').textContent = `${explicit ? '上書き保存しました' : '自動保存しました'}（${t}）。閉じても、この端末に、残ります。`;
  } catch {
    $('#saved').textContent = '自動保存できませんでした（この端末の、保存領域が、いっぱいです）。ダウンロードしてください。';
  }
  updateCount();
}
const touched = () => autosave(false);

/* ---------- 部品: セリフの1項目 ---------- */
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
function memoFor(parent, key) {
  const m = parent?.[`_言葉${key}`];
  return typeof m === 'string' ? m : '';
}

function makeCard(path, entryOrString, memoVars) {
  const sub = S.dialogue;
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
      inputs[i].badge.textContent = label;
      inputs[i].badge.className = `de-len${state === 'ok' ? '' : ` is-${state}`}`;
      if (v !== origVal(f)) changed = true;
    });
    card.classList.toggle('is-changed', changed);
    const used = new Set([...varsIn(t), ...varsIn(d)]);
    const unknown = [...used].filter((n) => !allowed.has(n));
    const open = [t, d].some((x) => (String(x).match(/\{/g) ?? []).length !== (String(x).match(/\}/g) ?? []).length);
    warn.hidden = !(unknown.length || open);
    warn.textContent = open ? '「{」と「}」の数が、合っていません。' : `知らない差し込み部分: ${unknown.map((n) => `{${n}}`).join(' ')}（ゲームは、これを、そのまま、画面に出します）`;
  };
  spec.forEach(([f, label]) => {
    const row = el('label', 'de-field');
    row.append(el('span', null, label));
    const input = el('input');
    input.type = 'text';
    input.value = getVal(f);
    input.addEventListener('input', () => { setVal(f, input.value); refresh(); touched(); });
    const badge = el('span', 'de-len');
    row.append(input, badge);
    fields.append(row);
    inputs.push({ input, badge });
  });
  reset.addEventListener('click', () => {
    spec.forEach(([f], i) => { setVal(f, origVal(f)); inputs[i].input.value = origVal(f); });
    refresh();
    touched();
  });
  card.append(head, fields, preview, hint, warn);
  card._search = `${LABELS[path] ?? ''} ${path} ${isLine ? `${entryOrString.text} ${entryOrString.detail ?? ''}` : entryOrString}`.toLowerCase();
  refresh();
  return card;
}

function buildDialogue() {
  const root = $('#panel-dialogue');
  const nav = $('#nav');
  root.replaceChildren();
  nav.replaceChildren();
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
        if (typeof v === 'string' || (v && typeof v === 'object' && typeof v.text === 'string')) {
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
}

/* ---------- 名前 ---------- */
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
    };
    input.addEventListener('input', () => { sub.current.names[key] = input.value; refresh(); touched(); });
    reset.addEventListener('click', () => { sub.current.names[key] = sub.original.names[key]; input.value = sub.original.names[key]; refresh(); touched(); });
    card.append(head, Object.assign(el('div', 'de-fields'), {}));
    card.querySelector('.de-fields').append(row);
    box.append(card);
    refresh();
  });
  box.append(sampleBox);
  root.append(box);
  updateSample();
}

/* ---------- ステージの文章（説明スライドの、追加・削除・並べ替え） ---------- */
const KEY_LABELS = {
  title: 'ステージ名', goal: '目標（一覧に出る、ひとこと）', group: 'まとまり（一覧の見出し）', situation: '起きていること（1行ずつ）',
  guide: '解説', scene: '場面の説明', summary: 'ひとこと', sections: '解説の項目', hints: 'ヒント（1つずつ）', after: 'クリアしたあと', learned: '分かったこと', question: '次に考えたいこと',
  A: '目標 A', solutionNotes: '想定解の解説', demo: '事件（ステージの頭の、説明）', real: '現実では', breached: '起きたこと（破られたとき）', protected: '起きたこと（守れたとき）',
  story: '説明スライド（ページを、足したり、消したり、並べ替えたり、できます）', h: '見出し', p: '本文', bannerBad: '大きな見出し（破られたとき）', verdictBad: '結果の見出し（破られたとき）',
  epilogueText: 'エピローグの文章', id: '呼び名（プログラム用。変えないでください）', stage: 'この用語が、使えるようになるステージ（番号）', term: '用語の名前', cat: 'まとまり', aliases: '文章の中で、この言葉が出たら、用語集へ、つなぐ（言い方の候補）', short: '短い説明（一覧に出る）', code: '例・数式（等幅の、囲み）', see: '関連する用語（id）', lesson: '学んだこと', start: '開始ボタン', intro: 'はじまり', twist: '…と思いきや', appear: '攻撃者が現れる', eveLike: '1人目', malloryLike: '2人目', hammer: '壁を壊す', broken: '壊れた', reveal: '正体', closing: 'おわりの言葉（1つずつ）',
};
const label = (k) => KEY_LABELS[k] ?? k;
const isLong = (k, v) => ['p', 'real', 'breached', 'protected', 'scene', 'learned', 'question', 'summary', 'closing'].includes(k) || String(v).length > 40;

function treeEditor(host, obj, onChange, depth = 0) {
  Object.keys(obj).forEach((k) => {
    if (k.startsWith('_')) return;
    const v = obj[k];
    if (typeof v === 'string') {
      const row = el('label', 'st-field');
      row.append(el('span', 'st-label', label(k)));
      const input = isLong(k, v) ? el('textarea') : el('input');
      if (input.tagName === 'INPUT') input.type = 'text';
      input.value = v;
      if (input.tagName === 'TEXTAREA') { input.rows = Math.max(2, Math.ceil(v.length / 38)); }
      input.addEventListener('input', () => { obj[k] = input.value; if (input.tagName === 'TEXTAREA') input.rows = Math.max(2, Math.ceil(input.value.length / 38)); onChange(); });
      row.append(input);
      host.append(row);
    } else if (typeof v === 'number') {
      const row = el('label', 'st-field');
      row.append(el('span', 'st-label', label(k)));
      const input = el('input');
      input.type = 'number';
      input.value = v;
      input.addEventListener('input', () => { obj[k] = Number(input.value); onChange(); });
      row.append(input);
      host.append(row);
    } else if (Array.isArray(v)) {
      const box = el('div', 'st-list');
      box.append(el('div', 'st-label st-list-title', label(k)));
      const draw = () => {
        box.querySelectorAll('.st-item').forEach((x) => x.remove());
        const add = box.querySelector('.st-add');
        v.forEach((item, i) => {
          const wrap = el('div', 'st-item');
          const bar = el('div', 'st-bar');
          bar.append(el('strong', null, typeof item === 'object' ? `ページ ${i + 1}` : `${i + 1}`));
          const btn = (t, fn, cls = '') => { const b = el('button', `st-btn ${cls}`, t); b.type = 'button'; b.addEventListener('click', fn); return b; };
          bar.append(
            btn('↑', () => { if (i > 0) { [v[i - 1], v[i]] = [v[i], v[i - 1]]; onChange(true); } }),
            btn('↓', () => { if (i < v.length - 1) { [v[i + 1], v[i]] = [v[i], v[i + 1]]; onChange(true); } }),
            btn('削除', () => { v.splice(i, 1); onChange(true); }, 'is-danger')
          );
          wrap.append(bar);
          if (typeof item === 'string') {
            const input = el('textarea');
            input.rows = Math.max(1, Math.ceil(item.length / 38));
            input.value = item;
            input.addEventListener('input', () => { v[i] = input.value; onChange(); });
            wrap.append(input);
          } else if (item && typeof item === 'object') {
            treeEditor(wrap, item, onChange, depth + 1);
          }
          box.insertBefore(wrap, add);
        });
      };
      const addBtn = el('button', 'st-btn st-add is-main', typeof v[0] === 'object' ? 'ページを追加' : '1つ追加');
      addBtn.type = 'button';
      addBtn.addEventListener('click', () => {
        if (typeof v[0] === 'object' && v[0]) v.push(Object.fromEntries(Object.keys(v[0]).filter((x) => !x.startsWith('_')).map((x) => [x, ''])));
        else if (v.length && typeof v[0] === 'object') v.push({ h: '', p: '' });
        else v.push('');
        onChange(true);
      });
      box.append(addBtn);
      draw();
      host.append(box);
    } else if (v && typeof v === 'object') {
      const fs = el('fieldset', 'st-group');
      fs.append(el('legend', null, label(k)));
      treeEditor(fs, v, onChange, depth + 1);
      host.append(fs);
    }
  });
}

function buildStage() {
  const root = $('#panel-stage');
  root.replaceChildren();
  const sel = el('select', 'st-select');
  [...STAGES.entries()].forEach(([id, v]) => sel.append(Object.assign(el('option', null, `${id}　${v.title ?? ''}`), { value: id })));
  sel.value = stageId;
  sel.addEventListener('change', () => { stageId = sel.value; buildStage(); updateCount(); });
  const bar = el('div', 'st-bar-top');
  bar.append(el('label', null, 'ステージ: '), sel);
  root.append(bar);
  const cur = STAGES.get(stageId);
  const note = el('p', 'de-desc', 'このステージの、文章です。説明スライド（事件のあとに出る、「そこで〇〇が出てくる」「ただし弱点」などのページ）は、「事件」の中の「説明スライド」に、あります。ページは、足したり、消したり、並べ替えたりできます。');
  root.append(note);
  const host = el('div', 'st-tree');
  const redraw = (structural) => { if (structural) { const y = window.scrollY; buildStage(); window.scrollTo(0, y); } updateCount(); touched(); };
  treeEditor(host, cur.current, redraw);
  root.append(host);
}

/* ---------- ブロックの説明（途中のステージから、変える） ---------- */
function buildParts() {
  const root = $('#panel-parts');
  root.replaceChildren();
  root.append(el('p', 'de-desc', 'ブロックの説明を、ステージの途中から、変えられます。「何番のステージから」と、新しい説明を、足します。あとの番号の、説明が、そのステージから、使われます（チュートリアルは 0）。'));
  const data = S.parts.current;
  data.parts ??= {};
  Object.entries(COMPONENTS).filter(([, c]) => !c.pseudo).forEach(([type, c]) => {
    const card = el('div', 'de-card st-part');
    card._search = `${type} ${c.label} ${c.desc ?? ''}`.toLowerCase();
    const head = el('div', 'de-head');
    head.append(el('strong', null, c.label), el('code', null, type));
    const base = el('p', 'de-hint');
    base.textContent = `いまの説明: ${c.desc ?? ''}`;
    base.hidden = false;
    const list = el('div', 'st-parts-list');
    const draw = () => {
      list.replaceChildren();
      const rows = (data.parts[type] ??= []);
      card.classList.toggle('is-changed', rows.length > 0);
      rows.forEach((r, i) => {
        const row = el('div', 'st-item');
        const bar = el('div', 'st-bar');
        const from = el('input'); from.type = 'number'; from.min = '0'; from.max = '12'; from.value = r.from ?? 0; from.className = 'st-num';
        from.addEventListener('input', () => { r.from = Number(from.value); touched(); });
        const del = el('button', 'st-btn is-danger', '削除'); del.type = 'button'; del.addEventListener('click', () => { rows.splice(i, 1); draw(); touched(); });
        bar.append(el('strong', null, 'ステージ'), from, el('strong', null, 'から'), del);
        row.append(bar);
        [['desc', '短い説明（部品の下に出る）'], ['howto', '使い方（「?」で出る）'], ['label', '名前（省略すると、そのまま）']].forEach(([k, lb]) => {
          const f = el('label', 'st-field'); f.append(el('span', 'st-label', lb));
          const t = el(k === 'label' ? 'input' : 'textarea'); if (k === 'label') t.type = 'text'; else t.rows = 2;
          t.value = r[k] ?? ''; t.placeholder = k === 'desc' ? (c.desc ?? '') : '';
          t.addEventListener('input', () => { if (t.value) r[k] = t.value; else delete r[k]; touched(); });
          f.append(t); row.append(f);
        });
        list.append(row);
      });
    };
    const add = el('button', 'st-btn is-main', 'このブロックの説明を、途中から、変える');
    add.type = 'button';
    add.addEventListener('click', () => { (data.parts[type] ??= []).push({ from: 1, desc: '' }); draw(); touched(); });
    card.append(head, base, list, add);
    root.append(card);
    draw();
  });
}

/* ---------- 用語集 ---------- */
function buildGlossary() {
  const root = $('#panel-glossary');
  root.replaceChildren();
  const data = S.glossary.current;
  const terms = data.terms;
  if (!terms.find((t) => t.id === termId)) termId = terms[0]?.id;
  const bar = el('div', 'st-bar-top');
  const sel = el('select', 'st-select');
  terms.forEach((t) => sel.append(Object.assign(el('option', null, `${t.term}　（${t.id}）`), { value: t.id })));
  sel.value = termId;
  sel.addEventListener('change', () => { termId = sel.value; buildGlossary(); });
  const add = el('button', 'st-btn is-main', '用語を追加');
  add.type = 'button';
  add.addEventListener('click', () => {
    const id = window.prompt('新しい用語の「呼び名」（半角の英数字・ハイフン。例: salt）');
    if (!id) return;
    if (terms.some((t) => t.id === id)) { window.alert('その呼び名は、もう、使われています。'); return; }
    terms.push({ id, stage: 1, term: '新しい用語', cat: data.categories?.[0] ?? '', aliases: [], short: '', sections: [{ h: '', p: '' }], see: [] });
    termId = id;
    buildGlossary();
    touched();
  });
  const del = el('button', 'st-btn is-danger', 'この用語を削除');
  del.type = 'button';
  del.addEventListener('click', () => {
    if (!window.confirm('この用語を、削除します。よいですか？')) return;
    data.terms = data.terms.filter((t) => t.id !== termId);
    termId = null;
    buildGlossary();
    touched();
  });
  bar.append(el('label', null, '用語: '), sel, add, del);
  root.append(bar);
  root.append(el('p', 'de-desc', `用語集の、1つの用語です（全 ${terms.length} 件）。まとまり（${(data.categories ?? []).join('・')}）のどれかを、書きます。「言い方の候補」の言葉が、文章に出てくると、用語集へ、つながります。`));
  const cur = terms.find((t) => t.id === termId);
  if (!cur) return;
  const host = el('div', 'st-tree');
  const redraw = (structural) => { if (structural) { const y = window.scrollY; buildGlossary(); window.scrollTo(0, y); } updateCount(); touched(); };
  treeEditor(host, cur, redraw);
  root.append(host);
}

/* ---------- 画面の文章（ui-texts.json: 「元の文」→「新しい文」） ---------- */
function buildUiTexts() {
  const root = $('#panel-uitexts');
  root.replaceChildren();
  root.append(el('p', 'de-desc', 'ゲームの画面に出る、すべての文章（ボタン・見出し・説明など）です。左の「元の文」が、画面に出るときに、右の「新しい文」に、置き換わります。右が、元の文と同じなら、そのままです。'));
  const sub = S.uitexts;
  Object.keys(sub.original).forEach((group) => {
    if (group.startsWith('_') || typeof sub.original[group] !== 'object') return;
    const sec = el('section', 'de-group');
    sec.append(el('h2', null, group));
    Object.keys(sub.original[group]).forEach((orig) => {
      const card = el('div', 'de-card ui-row');
      card._search = `${orig} ${sub.current[group][orig]}`.toLowerCase();
      const left = el('div', 'ui-orig', orig);
      const right = el('div', 'de-fields');
      const row = el('label', 'de-field');
      const input = el('input');
      input.type = 'text';
      input.value = sub.current[group][orig];
      const reset = el('button', 'de-reset', '元に戻す');
      reset.type = 'button';
      const refresh = () => { card.classList.toggle('is-changed', sub.current[group][orig] !== sub.original[group][orig]); };
      input.addEventListener('input', () => { sub.current[group][orig] = input.value; refresh(); touched(); });
      reset.addEventListener('click', () => { sub.current[group][orig] = sub.original[group][orig]; input.value = sub.original[group][orig]; refresh(); touched(); });
      row.append(el('span', null, '新しい文'), input);
      right.append(row);
      card.append(left, right, reset);
      refresh();
      sec.append(card);
    });
    root.append(sec);
  });
}

/* ---------- 設定（上級）: ステージの、使える部品・想定解・攻撃者などの設定（stages/*.json）を、そのまま書き換える ---------- */
async function ensureRaw(id) {
  if (RAW.has(id)) return;
  const original = await loadJson(`stages/${id}.json`);
  let current = clone(original);
  try { const raw = localStorage.getItem(`crypta:draft:raw:${id}`); if (raw) current = JSON.parse(raw); } catch { /* 下書きが、読めなければ、最初から */ }
  RAW.set(id, { original, current });
}
async function buildRaw() {
  const root = $('#panel-raw');
  root.replaceChildren(el('p', 'de-desc', '読み込み中…'));
  if (!rawId) rawId = [...STAGES.keys()][0];
  await ensureRaw(rawId);
  root.replaceChildren();
  const bar = el('div', 'st-bar-top');
  const sel = el('select', 'st-select');
  [...STAGES.entries()].forEach(([id, v]) => sel.append(Object.assign(el('option', null, `${id}　${v.title ?? ''}`), { value: id })));
  sel.value = rawId;
  sel.addEventListener('change', () => { rawId = sel.value; buildRaw(); });
  bar.append(el('label', null, 'ステージ: '), sel);
  root.append(bar);
  root.append(el('p', 'de-desc', 'ステージの「設定」（使える部品・想定解・攻撃者・条件など）の、JSON です。上級者向けです。書き方（カンマ・引用符・かっこ）を、まちがえると、そのステージが、動きません。「ゲームで試す」で、確かめてから、使ってください。まちがえたときは、「元に戻す」で、戻せます。'));
  const cur = RAW.get(rawId);
  const ta = el('textarea', 'raw-text');
  ta.spellcheck = false;
  ta.value = JSON.stringify(cur.current, null, 2);
  const msg = el('p', 'raw-msg', '書き方は、正しいです。');
  ta.addEventListener('input', () => {
    try {
      cur.current = JSON.parse(ta.value);
      msg.textContent = '書き方は、正しいです。';
      msg.className = 'raw-msg is-ok';
      touched();
    } catch (err) {
      msg.textContent = `書き方に、まちがいがあります（直るまで、保存されません）: ${err.message}`;
      msg.className = 'raw-msg is-ng';
    }
  });
  root.append(ta, msg);
}

/* ---------- タブ・操作 ---------- */
const BUILD = { dialogue: buildDialogue, names: buildNames, stage: buildStage, parts: buildParts, glossary: buildGlossary, uitexts: buildUiTexts, raw: buildRaw };
function setTab(name) {
  tab = name;
  document.querySelectorAll('.de-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
  ['dialogue', 'names', 'stage', 'parts', 'glossary', 'uitexts', 'raw'].forEach((t) => { $(`#panel-${t}`).hidden = t !== name; });
  $('#nav').hidden = name !== 'dialogue';
  $('#search').value = '';
  if (['stage', 'parts', 'glossary', 'uitexts', 'raw'].includes(name)) BUILD[name]();
  applySearch();
  updateCount();
}
function applySearch() {
  const q = $('#search').value.trim().toLowerCase();
  document.querySelectorAll(`#panel-${tab} .de-card`).forEach((c) => c.classList.toggle('is-hidden', Boolean(q) && !(c._search ?? '').includes(q)));
}
const exportText = (s) => `${JSON.stringify(s.current, null, 2)}\n`;

$('#save').addEventListener('click', () => {
  const s = getSrc();
  const dir = tab === 'stage' ? 'content/stages' : tab === 'raw' ? 'stages' : 'content';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([exportText(s)], { type: 'application/json' }));
  a.download = s.file;
  a.click();
  setStatus(`${s.file} を、ダウンロードしました。${dir} フォルダの、同じ名前のファイルを、置き換えてください。`, 'is-ok');
});
$('#store').addEventListener('click', () => { autosave(true); setStatus('この端末に、上書き保存しました（自動でも、保存されています）。', 'is-ok'); });
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(exportText(getSrc())); setStatus(`${getSrc().file} の中身を、コピーしました。`, 'is-ok'); }
  catch { setStatus('コピーできませんでした。「ダウンロード」を、使ってください。', 'is-ng'); }
});
$('#load').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const s = getSrc();
    if (tab === 'names' && !data.names) throw new Error('names.json の形では、ありません');
    s.current = data;
    if (tab === 'stage') STAGES.get(stageId).current = data;
    else if (tab === 'raw') RAW.get(rawId).current = data;
    else S[tab].current = data;
    (BUILD[tab])();
    autosave();
    setStatus(`${f.name} を、読み込みました。`, 'is-ok');
  } catch (err) { setStatus(`読み込めませんでした: ${fmtErr(err)}`, 'is-ng'); }
  e.target.value = '';
});
$('#revert').addEventListener('click', () => {
  if (!window.confirm('この画面の、書き換えを、すべて、元に戻します。よいですか？')) return;
  if (tab === 'stage') { const v = STAGES.get(stageId); v.current = clone(v.original); } else if (tab === 'raw') { const v = RAW.get(rawId); v.current = clone(v.original); } else S[tab].current = clone(S[tab].original);
  BUILD[tab]();
  autosave();
  setStatus('元に戻しました。', 'is-ok');
});
$('#try').addEventListener('click', () => {
  try {
    localStorage.setItem(`${OVERRIDE_PREFIX}dialogue`, JSON.stringify(S.dialogue.current));
    localStorage.setItem(`${OVERRIDE_PREFIX}names`, JSON.stringify(S.names.current));
    localStorage.setItem(`${OVERRIDE_PREFIX}parts`, JSON.stringify(S.parts.current));
    localStorage.setItem(`${OVERRIDE_PREFIX}glossary`, JSON.stringify(S.glossary.current));
    localStorage.setItem(`${OVERRIDE_PREFIX}uitexts`, JSON.stringify(S.uitexts.current));
    RAW.forEach((v, id) => {
      if (countDiff(v.original, v.current) > 0) localStorage.setItem(`${OVERRIDE_PREFIX}stagejson:${id}`, JSON.stringify(v.current));
      else localStorage.removeItem(`${OVERRIDE_PREFIX}stagejson:${id}`);
    });
    STAGES.forEach((v, id) => {
      if (countDiff(v.original, v.current) > 0) {
        localStorage.setItem(`${OVERRIDE_PREFIX}stage:${id}`, JSON.stringify(v.current));
        localStorage.removeItem(`crypta:intro:${id}`); // 事件（説明スライド）を、もう一度、見られるように
      } else localStorage.removeItem(`${OVERRIDE_PREFIX}stage:${id}`);
    });
    localStorage.setItem('crypta:dev', '1');
  } catch { setStatus('試し用の設定を、保存できませんでした。', 'is-ng'); return; }
  setStatus('試し用に、保存しました。確認のため、全ステージを、解放しました。ゲームを、新しいタブで、開きます（画面の左下に、目印が出ます）。', 'is-ok');
  window.open(`simulator.html?stage=${tab === 'stage' ? stageId : 'stage01'}`, '_blank');
});
$('#untry').addEventListener('click', () => {
  Object.keys(localStorage).filter((k) => k.startsWith(OVERRIDE_PREFIX)).forEach((k) => localStorage.removeItem(k));
  setStatus('試し用の設定を、解除しました。', 'is-ok');
});
document.querySelectorAll('.de-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
$('#search').addEventListener('input', applySearch);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#store').click(); }
});

/* ---------- 起動 ---------- */
function restoreDraft(s) {
  try {
    const raw = localStorage.getItem(s.draft);
    if (raw) { s.current = JSON.parse(raw); return true; }
  } catch { /* 下書きが、読めなければ、最初から */ }
  return false;
}
async function init() {
  let restored = 0;
  try {
    S.dialogue.original = await loadJson('content/dialogue.json');
    S.names.original = await loadJson('content/names.json');
    S.parts.original = await loadJson('content/parts.json');
    S.glossary.original = await loadJson('content/glossary.json');
    S.uitexts.original = await loadJson('content/ui-texts.json');
    const list = await loadStages();
    for (const st of list) {
      try { STAGES.set(st.id, { original: await loadJson(`content/stages/${st.id}.json`), title: st.title }); } catch { /* 文章のファイルが、ないステージは、飛ばす */ }
    }
  } catch (err) {
    setStatus(`${fmtErr(err)}。ファイルを、直接、開いているときは、サーバー経由で、開いてください。`, 'is-ng');
    return;
  }
  [S.dialogue, S.names, S.parts, S.glossary, S.uitexts].forEach((s) => { s.current = clone(s.original); });
  STAGES.forEach((v) => { v.current = clone(v.original); });
  // 前回の、書きかけ（自動保存）を、そのまま、復元する
  [S.dialogue, S.names, S.parts, S.glossary, S.uitexts].forEach((s) => { if (restoreDraft(s)) restored += 1; });
  STAGES.forEach((v, id) => { const tmp = { draft: `crypta:draft:stage:${id}`, current: null }; if (restoreDraft(tmp)) { v.current = tmp.current; restored += 1; } });
  stageId = [...STAGES.keys()].find((id) => id === 'stage05') ?? [...STAGES.keys()][0];
  // 下書きに、ない新しい項目（あとから、増えた文章）を、補う
  Object.keys(S.uitexts.original).forEach((g) => {
    if (typeof S.uitexts.original[g] !== 'object' || g.startsWith('_')) return;
    S.uitexts.current[g] ??= {};
    Object.entries(S.uitexts.original[g]).forEach(([k, v]) => { if (!(k in S.uitexts.current[g])) S.uitexts.current[g][k] = v; });
  });
  namesMap = { ...S.names.current.names };
  buildDialogue();
  buildNames();
  setTab('dialogue');
  autosave();
  setStatus(restored ? `前回の、書きかけ（${restored} か所のファイル）を、復元しました。「全部、元に戻す」で、最初の状態に、戻せます。` : '書き換えると、見本が、すぐ、変わります。変更は、自動で、この端末に、保存されます。', 'is-ok');
}
init();
