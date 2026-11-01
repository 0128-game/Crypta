// admin-center.js
// 管理者センター: 管理者用の、すべての機能を、1か所に、まとめたページ。
//   ・crypta.zip のダウンロード（変更前 / 変更後 / 両方）  ・ロゴ  ・ステージの開閉と進み具合  ・バックアップ
//   ・ファイルの点検  ・試し用の設定の管理  ・情報
import './texts.js';
import { requireAdmin, TOOLS, OVERRIDE_PREFIX, overrideKeys } from './admin.js';
import { makeZip, downloadBlob } from './zip.js';
import { loadStages } from './stages.js';
if (!requireAdmin()) await new Promise(() => {}); // 管理者モードでなければ、ここで止める

const $root = document.getElementById('center');
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const btn = (label, onClick, cls = '') => {
  const b = el('button', `ac-btn ${cls}`, label);
  b.type = 'button';
  b.addEventListener('click', () => onClick(b));
  return b;
};
const statusEl = () => el('p', 'ac-status');
const say = (p, msg, cls = '') => { p.textContent = msg; p.className = `ac-status ${cls}`; };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* 同上 */ } };
const card = (title, note) => {
  const c = el('section', 'ac-card');
  c.append(el('h2', null, title));
  if (note) c.append(el('p', 'ac-note', note));
  $root.append(c);
  return c;
};
async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  return res.json();
}

/* ======================= 試し用の設定（上書き） ======================= */
const OV = {
  dialogue: { key: `${OVERRIDE_PREFIX}dialogue`, label: 'セリフ（content/dialogue.json）', path: 'content/dialogue.json' },
  names: { key: `${OVERRIDE_PREFIX}names`, label: '名前（content/names.json）', path: 'content/names.json' },
  theme: { key: `${OVERRIDE_PREFIX}theme`, label: 'CSS（css/theme.css）', path: 'css/theme.css' },
  logo: { key: `${OVERRIDE_PREFIX}logo`, label: 'ロゴの画像（assets/logo.*）', path: 'assets/logo' },
};
const activeOverrides = () => Object.entries(OV).filter(([, o]) => lsGet(o.key));

/* ======================= zip のダウンロード ======================= */
const enc = new TextEncoder();
const MIME_EXT = { 'image/png': 'png', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
function dataUrlToBytes(url) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  return { bytes, ext: MIME_EXT[m[1]] ?? 'png' };
}

async function collectFiles(setProgress) {
  const man = await fetchJson('content/files.json');
  const list = [...man.files];
  ['assets/logo.svg', 'assets/logo.png', 'assets/logo.webp'].forEach((p) => { if (!list.includes(p)) list.push(p); });
  const files = new Map();
  const missing = [];
  let done = 0;
  const queue = [...list];
  const worker = async () => {
    while (queue.length) {
      const path = queue.shift();
      try {
        const res = await fetch(path, { cache: 'no-cache' });
        if (res.ok) files.set(path, new Uint8Array(await res.arrayBuffer()));
        else if (!path.startsWith('assets/logo.')) missing.push(path); // ロゴは、なくても、よい
      } catch {
        missing.push(path);
      }
      done += 1;
      setProgress(done, list.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return { files, missing };
}

// この端末に、保存されている、変更（書きかけの下書き・試し用の設定）の、一覧: [保存の名前, ファイルの場所, 説明]
function savedChanges() {
  const out = [];
  const pushIf = (key, path, label) => { const v = lsGet(key); if (v) out.push({ key, path, label, value: v }); };
  // 先に、試し用の設定。そのあとに、下書き（いつも、自動で、保存されている、いちばん新しい内容）
  [['dialogue', 'content/dialogue.json', 'セリフ'], ['names', 'content/names.json', '名前'], ['parts', 'content/parts.json', 'ブロックの説明'],
    ['glossary', 'content/glossary.json', '用語集'], ['uitexts', 'content/ui-texts.json', '画面の文章']].forEach(([k, path, label]) => {
    pushIf(`${OVERRIDE_PREFIX}${k}`, path, `${label}（試し）`);
    pushIf(`crypta:draft:${k}`, path, `${label}（書きかけ）`);
  });
  let keys = [];
  try { keys = Object.keys(localStorage); } catch { keys = []; }
  keys.filter((k) => k.startsWith(`${OVERRIDE_PREFIX}stage:`)).forEach((k) => pushIf(k, `content/stages/${k.split(':').pop()}.json`, `ステージの文章 ${k.split(':').pop()}（試し）`));
  keys.filter((k) => k.startsWith(`${OVERRIDE_PREFIX}stagejson:`)).forEach((k) => pushIf(k, `stages/${k.split(':').pop()}.json`, `ステージの設定 ${k.split(':').pop()}（試し）`));
  keys.filter((k) => k.startsWith('crypta:draft:stage:')).forEach((k) => pushIf(k, `content/stages/${k.split(':').pop()}.json`, `ステージの文章 ${k.split(':').pop()}（書きかけ）`));
  keys.filter((k) => k.startsWith('crypta:draft:raw:')).forEach((k) => pushIf(k, `stages/${k.split(':').pop()}.json`, `ステージの設定 ${k.split(':').pop()}（書きかけ）`));
  return out;
}

// 「変更後」: この端末の、変更（自動保存した書きかけ・試し用の設定。セリフ・名前・ステージの文章・用語集・画面の文章・CSS・ロゴ）を、ファイルに、反映する
function applyOverrides(files) {
  const changed = [];
  const pretty = (raw) => `${JSON.stringify(JSON.parse(raw), null, 2)}\n`;
  savedChanges().forEach((c) => {
    try { files.set(c.path, enc.encode(pretty(c.value))); if (!changed.includes(c.path)) changed.push(c.path); } catch { /* 読めない下書きは、飛ばす */ }
  });
  const css = lsGet(OV.theme.key);
  if (css) { files.set(OV.theme.path, enc.encode(css)); changed.push(OV.theme.path); }
  const logo = lsGet(OV.logo.key);
  if (logo) {
    const d = dataUrlToBytes(logo);
    if (d) {
      const path = `assets/logo.${d.ext}`;
      files.set(path, d.bytes);
      changed.push(path);
      try {
        const cfg = JSON.parse(new TextDecoder().decode(files.get('content/logo.json')));
        cfg.file = [path, ...[].concat(cfg.file ?? []).filter((f) => f !== path)];
        files.set('content/logo.json', enc.encode(`${JSON.stringify(cfg, null, 2)}\n`));
        changed.push('content/logo.json');
      } catch { /* logo.json が、なければ、既定の候補で、読まれる */ }
    }
  }
  return changed;
}

const toEntries = (files, prefix) => [...files.entries()].map(([name, data]) => ({ name: `${prefix}${name}`, data }));

function buildDownloadCard() {
  const c = card('crypta.zip のダウンロード', 'ゲームの、すべてのファイルを、1つの zip にして、ダウンロードします。展開した crypta フォルダを、そのまま、GitHub などに置けます。');
  const ov = activeOverrides();
  const saved = savedChanges();
  const labels = [...new Set([...saved.map((c) => c.label), ...ov.filter(([id]) => id === 'theme' || id === 'logo').map(([, o]) => o.label)])];
  const info = el('p', 'ac-note');
  info.textContent = labels.length
    ? `「変更後」に入る、この端末の、変更（自動保存した書きかけも、含みます）: ${labels.join(' / ')}`
    : '「変更後」に入る変更は、ありません（いまは、変更前と、同じ中身になります）。';
  c.append(info);
  const status = statusEl();
  const row = el('div', 'ac-row');
  const run = async (mode, b) => {
    const all = [...row.querySelectorAll('button')];
    all.forEach((x) => { x.disabled = true; });
    try {
      say(status, 'ファイルを、集めています…');
      const { files, missing } = await collectFiles((d, t) => say(status, `ファイルを、集めています… ${d} / ${t}`));
      const entries = [];
      let changed = [];
      if (mode === 'content') {
        // content フォルダ全体（変更後）。変更があった、ほかのファイル（ステージの設定・CSS・ロゴ）も、含める
        const copy = new Map(files);
        changed = applyOverrides(copy);
        const only = new Map([...copy].filter(([path]) => path.startsWith('content/') || changed.includes(path)));
        entries.push(...toEntries(only, 'crypta/'));
      }
      if (mode === 'before' || mode === 'both') entries.push(...toEntries(files, mode === 'both' ? 'before/crypta/' : 'crypta/'));
      if (mode === 'after' || mode === 'both') {
        const copy = new Map(files);
        changed = applyOverrides(copy);
        entries.push(...toEntries(copy, mode === 'both' ? 'after/crypta/' : 'crypta/'));
      }
      const blob = makeZip(entries);
      const name = { before: 'crypta-before.zip', after: 'crypta-after.zip', both: 'crypta-both.zip', content: 'crypta-content.zip' }[mode];
      downloadBlob(blob, name);
      const mb = (blob.size / 1048576).toFixed(1);
      say(status, `${name}（${entries.length} ファイル・${mb} MB）を、ダウンロードしました。${changed.length ? ` 変更後に反映したファイル: ${changed.join('、')}` : ''}${missing.length ? ` 見つからなかったファイル: ${missing.length} 個（${missing.slice(0, 3).join('、')}…）` : ''}`, missing.length ? 'is-ng' : 'is-ok');
    } catch (err) {
      say(status, `ダウンロードできませんでした: ${err.message}`, 'is-ng');
    }
    all.forEach((x) => { x.disabled = false; });
    void b;
  };
  row.append(
    btn('contentフォルダだけ（変更後）', (b) => run('content', b), 'is-main'),
    btn('変更前（いまのファイルのまま）', (b) => run('before', b)),
    btn('変更後（この端末の変更を、反映）', (b) => run('after', b)),
    btn('両方（before と after の2つのフォルダ）', (b) => run('both', b))
  );
  c.append(row, status);
}

/* ======================= ロゴ ======================= */
async function findLogo() {
  const cfg = await fetchJson('content/logo.json').catch(() => ({}));
  for (const f of [].concat(cfg.file ?? ['assets/logo.svg', 'assets/logo.png', 'assets/logo.webp'])) {
    try {
      const r = await fetch(f, { method: 'HEAD', cache: 'no-cache' });
      if (r.ok) return f;
    } catch { /* 次の候補 */ }
  }
  return null;
}
async function buildLogoCard() {
  const c = card('ロゴ', 'ロゴの画像を、assets/logo.png（または logo.svg / logo.webp）に、置くと、すべてのページの、左上のロゴが、画像になります。画像が、ないときは、元の文字のロゴです。ここでは、画像を選んで、この端末だけで、試せます。');
  const view = el('div', 'ac-logo-preview');
  const make = (label, node) => { const b = el('div', 'ac-logo-box'); b.append(node, el('small', null, label)); return b; };
  const orig = el('span', 'site-logo', 'CRYPTA');
  const placed = await findLogo();
  const placedNode = placed ? Object.assign(el('img'), { src: placed, alt: 'いまのロゴ' }) : el('span', null, '（画像は、まだ、ありません）');
  view.append(make('元のロゴ（文字）', orig), make(placed ? `置いてある画像: ${placed}` : '置いてある画像', placedNode));
  const ovData = lsGet(OV.logo.key);
  let tryBox = null;
  if (ovData) { tryBox = make('試し中の画像（この端末だけ）', Object.assign(el('img'), { src: ovData, alt: '試し中のロゴ' })); view.append(tryBox); }
  c.append(view);
  const status = statusEl();
  const file = el('input');
  file.type = 'file';
  file.accept = 'image/png,image/svg+xml,image/webp,image/jpeg';
  file.hidden = true;
  const row = el('div', 'ac-row');
  row.append(
    btn('画像を選んで、試す', () => file.click(), 'is-main'),
    btn('試しを解除', () => { lsDel(OV.logo.key); say(status, '試しを、解除しました。ページを、読み込み直すと、元に戻ります。', 'is-ok'); tryBox?.remove(); })
  );
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 1.5 * 1048576) { say(status, '画像が、大きすぎます（1.5 MB まで）。', 'is-ng'); return; }
    const url = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(f); });
    if (!lsSet(OV.logo.key, url)) { say(status, '試し用に、保存できませんでした。', 'is-ng'); return; }
    tryBox?.remove();
    tryBox = make('試し中の画像（この端末だけ）', Object.assign(el('img'), { src: url, alt: '試し中のロゴ' }));
    view.append(tryBox);
    say(status, '試し用に、保存しました。トップページなどを、開くと、このロゴになります（管理者モードのあいだだけ）。気に入ったら、画像を assets/logo.png などの名前で、置いてください。「変更後」の zip にも、入ります。', 'is-ok');
  });
  c.append(row, file, status);
}

/* ======================= ステージ ======================= */
const PROGRESS_KEY = 'crypta:progress';
const readProgress = () => { try { return JSON.parse(lsGet(PROGRESS_KEY) ?? '{}') ?? {}; } catch { return {}; } };
async function buildStageCard() {
  const c = card('ステージの開閉と、進み具合', 'ステージを、クリア済みにしたり、評価をつけたりできます。解放前のステージは、トップページから、見えません。「全ステージを解放」を、オンにすると、すべて、見えて、開けます（確認用）。');
  let stages = [];
  try { stages = await loadStages(); } catch (err) { c.append(el('p', 'ac-status is-ng', `ステージを読み込めませんでした: ${err.message}`)); return; }
  const prog = readProgress();
  const table = el('table', 'ac-table');
  table.append(Object.assign(el('thead'), { innerHTML: '<tr><th>ステージ</th><th>まとまり</th><th>クリア済み</th><th>評価</th><th></th></tr>' }));
  const body = el('tbody');
  const rows = stages.map((s) => {
    const tr = el('tr');
    const check = el('input'); check.type = 'checkbox'; check.checked = Boolean(prog[s.id]?.done || prog[s.id]);
    const sel = el('select');
    ['', 'S', 'A', 'B', 'C'].forEach((v) => sel.append(Object.assign(el('option', null, v || '（なし）'), { value: v })));
    sel.value = prog[s.id]?.rating ?? '';
    const open = el('a', null, '開く'); open.href = `simulator.html?stage=${s.id}`; open.target = '_blank'; open.rel = 'noopener';
    const td = (...n) => { const t = el('td'); t.append(...n); return t; };
    tr.append(td(el('strong', null, s.title ?? s.id)), td(s.group ?? ''), td(check), td(sel), td(open));
    body.append(tr);
    return { id: s.id, check, sel };
  });
  table.append(body);
  c.append(table);
  const status = statusEl();
  const apply = () => {
    const next = {};
    rows.forEach((r) => { if (r.check.checked) next[r.id] = { rating: r.sel.value || 'S', objectives: ['A'], done: true }; });
    lsSet(PROGRESS_KEY, JSON.stringify(next));
    say(status, `進み具合を、保存しました（クリア済み ${Object.keys(next).length} 件）。`, 'is-ok');
  };
  const solOn = () => lsGet('crypta:showSolution') === '1';
  const solBtn = btn(`想定解ボタンを、最初から出す: ${solOn() ? 'オン' : 'オフ'}`, (b) => {
    if (solOn()) lsDel('crypta:showSolution'); else lsSet('crypta:showSolution', '1');
    b.textContent = `想定解ボタンを、最初から出す: ${solOn() ? 'オン' : 'オフ'}`;
  });
  const devOn = () => lsGet('crypta:dev') === '1';
  const devBtn = btn(`全ステージを解放: ${devOn() ? 'オン' : 'オフ'}`, (b) => {
    if (devOn()) lsDel('crypta:dev'); else lsSet('crypta:dev', '1');
    b.textContent = `全ステージを解放: ${devOn() ? 'オン' : 'オフ'}`;
  });
  const row = el('div', 'ac-row');
  row.append(
    btn('この内容で、保存', apply, 'is-main'),
    btn('すべて、クリア済み（S）にする', () => { rows.forEach((r) => { r.check.checked = true; r.sel.value = 'S'; }); apply(); }),
    btn('すべて、消す', () => { if (!window.confirm('全ステージの、クリアの記録を、消します。よいですか？')) return; rows.forEach((r) => { r.check.checked = false; r.sel.value = ''; }); lsDel(PROGRESS_KEY); say(status, '消しました。', 'is-ok'); }),
    devBtn,
    solBtn
  );
  c.append(row, status);
}

/* ======================= バックアップ ======================= */
function buildBackupCard() {
  const c = card('バックアップ（進み具合・保存した回路）', 'この端末の、保存データ（クリアの記録・保存した回路・事件の既読・設定・**編集画面の、書きかけ（自動保存した変更）**）を、ファイルに、書き出したり、読み込んだりします。端末を変えるときや、ブラウザのデータを消す前の、控えに使います。'.replace(/\*\*/g, ''));
  const status = statusEl();
  const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
  const keys = () => { try { return Object.keys(localStorage).filter((k) => k.startsWith('crypta:') && !k.startsWith(OVERRIDE_PREFIX)); } catch { return []; } }; // 書きかけ（下書き）も、含める
  const row = el('div', 'ac-row');
  row.append(
    btn('書き出す', () => {
      const data = {};
      keys().forEach((k) => { data[k] = lsGet(k); });
      downloadBlob(new Blob([`${JSON.stringify({ app: 'crypta', savedAt: new Date().toISOString(), data }, null, 2)}\n`], { type: 'application/json' }), 'crypta-save.json');
      say(status, `${Object.keys(data).length} 件を、書き出しました（crypta-save.json）。`, 'is-ok');
    }, 'is-main'),
    btn('読み込む', () => file.click())
  );
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (obj.app !== 'crypta' || typeof obj.data !== 'object') throw new Error('CRYPTA のバックアップでは、ありません');
      if (!window.confirm(`${Object.keys(obj.data).length} 件を、読み込みます。いまの、保存データは、上書きされます。よいですか？`)) return;
      Object.entries(obj.data).forEach(([k, v]) => { if (k.startsWith('crypta:')) lsSet(k, v); });
      say(status, '読み込みました。', 'is-ok');
    } catch (err) {
      say(status, `読み込めませんでした: ${err.message}`, 'is-ng');
    }
    file.value = '';
  });
  c.append(row, file, status, el('p', 'ac-note', `いま、保存されているデータ: ${keys().length} 件`));
}

/* ======================= ファイルの点検 ======================= */
function buildCheckCard() {
  const c = card('ファイルの点検', 'ゲームの、すべてのファイルが、あるか、JSON の書き方に、まちがいがないかを、調べます（書き換えたあとの、確認に）。');
  const status = statusEl();
  const list = el('ul', 'ac-list');
  const add = (ok, text) => list.append(Object.assign(el('li', ok ? 'is-ok' : 'is-ng'), { textContent: text }));
  c.append(btn('点検する', async (b) => {
    b.disabled = true;
    list.replaceChildren();
    say(status, '調べています…');
    let bad = 0;
    try {
      const man = await fetchJson('content/files.json');
      add(true, `ファイルの一覧（content/files.json）: ${man.files.length} 件（${man.generated ?? ''}）`);
      const missing = [];
      const jsons = man.files.filter((f) => f.endsWith('.json'));
      const queue = [...man.files];
      await Promise.all(Array.from({ length: 8 }, async () => {
        while (queue.length) {
          const f = queue.shift();
          try { const r = await fetch(f, { method: 'HEAD', cache: 'no-cache' }); if (!r.ok) missing.push(f); } catch { missing.push(f); }
        }
      }));
      if (missing.length) { bad += missing.length; missing.forEach((f) => add(false, `見つからないファイル: ${f}`)); } else add(true, '一覧の、すべてのファイルが、あります。');
      let parsed = 0;
      for (const f of jsons) {
        try { JSON.parse(await (await fetch(f, { cache: 'no-cache' })).text()); parsed += 1; } catch (err) { bad += 1; add(false, `JSON の書き方に、まちがい: ${f}（${err.message}）`); }
      }
      add(parsed === jsons.length, `JSON の書き方: ${parsed} / ${jsons.length} 件が、正しい`);
      const names = await fetchJson('content/names.json');
      const need = ['Alice', 'Bob', 'Eve', 'Mallory'];
      const lack = need.filter((k) => !names.names?.[k]);
      add(lack.length === 0, lack.length ? `名前（names.json）に、足りない項目: ${lack.join('、')}` : '名前（names.json）: 4 人とも、あります。');
      if (lack.length) bad += 1;
      const stages = await loadStages();
      add(stages.length > 0, `ステージ: ${stages.length} 件を、読み込めました。`);
      const logo = await findLogo();
      add(true, logo ? `ロゴの画像: ${logo}（使われます）` : 'ロゴの画像: なし（元のロゴを使います）');
    } catch (err) {
      bad += 1;
      add(false, `点検できませんでした: ${err.message}`);
    }
    say(status, bad ? `${bad} 件の、問題が、見つかりました。` : '問題は、見つかりませんでした。', bad ? 'is-ng' : 'is-ok');
    b.disabled = false;
  }, 'is-main'), status, list);
}

/* ======================= 試し用の設定 ======================= */
function buildOverrideCard() {
  const c = card('試し用の設定', 'セリフ・名前・CSS・ロゴを、「試し」で、この端末だけに、反映している内容です。ふつうのプレイヤーには、影響しません。');
  const list = el('ul', 'ac-list');
  const status = statusEl();
  const draw = () => {
    list.replaceChildren();
    const ov = activeOverrides();
    if (!ov.length) { list.append(Object.assign(el('li'), { textContent: '試し用の設定は、ありません。' })); return; }
    ov.forEach(([id, o]) => {
      const li = el('li');
      li.append(`${o.label}（${Math.round((lsGet(o.key) ?? '').length / 1024 * 10) / 10} KB）　`);
      li.append(btn('消す', () => { lsDel(o.key); draw(); say(status, `${o.label} の、試しを、消しました。`, 'is-ok'); void id; }));
      list.append(li);
    });
  };
  draw();
  c.append(list, el('div', 'ac-row'), status);
  c.lastChild.previousSibling.append(btn('すべて、消す', () => { overrideKeys().forEach(lsDel); draw(); say(status, 'すべて、消しました。', 'is-ok'); }));
}

/* ======================= 情報 ======================= */
async function buildInfoCard() {
  const c = card('情報');
  const kv = el('dl', 'ac-kv');
  const add = (k, v) => kv.append(el('dt', null, k), el('dd', null, String(v)));
  try {
    const man = await fetchJson('content/files.json');
    add('ファイル数', `${man.files.length}（一覧の日付: ${man.generated ?? '-'}）`);
    add('ステージ数', (await loadStages()).length);
    const d = await fetchJson('content/dialogue.json');
    const cnt = (o) => Object.entries(o).reduce((n, [k, v]) => n + (k.startsWith('_') ? 0 : (v && typeof v === 'object' ? (typeof v.text === 'string' ? 1 : cnt(v)) : 1)), 0);
    add('セリフの数', cnt(d));
    add('用語の数', (await fetchJson('content/glossary.json')).terms?.length ?? '-');
    const ui = await fetchJson('content/ui-texts.json');
    add('画面の文章（ui-texts）', Object.entries(ui).filter(([k]) => !k.startsWith('_')).reduce((n, [, m]) => n + Object.keys(m).length, 0));
  } catch (err) { add('読み込み', `できませんでした（${err.message}）`); }
  let bytes = 0;
  try { Object.keys(localStorage).forEach((k) => { bytes += k.length + (localStorage.getItem(k) ?? '').length; }); } catch { /* 数えられなくても、続けられる */ }
  add('この端末の保存データ', `${Math.round(bytes / 1024 * 10) / 10} KB`);
  add('ブラウザ', navigator.userAgent.slice(0, 80));
  c.append(kv);
}

/* ======================= ページ ======================= */
async function init() {
  $root.replaceChildren(el('h1', null, '管理者センター'), el('p', 'ac-lead', '管理者用の、すべての機能です。管理者モードは、トップページを開き直すか、タブを閉じると、終わります。'));
  buildDownloadCard();
  await buildLogoCard();
  await buildStageCard();
  buildOverrideCard();
  buildBackupCard();
  buildCheckCard();
  const tools = card('ほかの管理者用ツール');
  const grid = el('div', 'ac-tools');
  TOOLS.forEach((g) => g.items.filter((t) => t.href !== 'admin.html').forEach((t) => {
    const a = el('a', 'admin-tool');
    a.href = t.href;
    a.append(el('strong', null, t.title), el('span', null, t.desc));
    grid.append(a);
  }));
  tools.append(grid);
  await buildInfoCard();
}
init();
