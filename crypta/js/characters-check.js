// characters-check.js
// キャラクター画像の、チェックページ。画像が読み込めるか・大きさ・背景の透明・ファイルの重さを、調べる。

import './texts.js'; // 画面の文章を、content/ui-texts.json で、書き換えられるようにする
import { loadCharacterConfig, makeCharacter } from './characters.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// 縦長の画像（縦横比 4:5 から 2:3 まで）を、受け付ける。ChatGPT が作る縦長（1024 × 1536 = 2:3）も、そのまま使える
const RATIO = { min: 0.6, max: 0.85 };
const MAX_KB = 500; // 重さの目安（これより重いと、ゲームの読み込みが、遅くなる）

const ROLE = {
  alice: 'Alice', bob: 'Bob', eve: 'Eve', mallory: 'Mallory', ai: '正体不明の攻撃者（???）', robot: '正体（AI）',
};

// 画像を読み込み、大きさと、背景の透明を調べる
function inspect(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      let transparent = null;
      let corner = '';
      try {
        const cv = document.createElement('canvas');
        const sw = Math.min(64, w);
        const sh = Math.max(1, Math.round((sw * h) / w));
        cv.width = sw;
        cv.height = sh;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, sw, sh);
        const pts = [[0, 0], [sw - 1, 0], [0, sh - 1], [sw - 1, sh - 1]];
        const px = pts.map(([x, y]) => ctx.getImageData(x, y, 1, 1).data);
        transparent = px.every((d) => d[3] < 20);
        corner = `rgb(${px[0][0]}, ${px[0][1]}, ${px[0][2]})`;
      } catch {
        transparent = null; // 調べられなかった
      }
      resolve({ ok: true, w, h, transparent, corner });
    };
    img.onerror = () => resolve({ ok: false });
    img.src = `${url}?t=${Date.now()}`;
  });
}

async function fileSizeKB(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    const len = res.headers.get('content-length');
    return len ? Math.round(Number(len) / 1024) : null;
  } catch {
    return null;
  }
}

const cfg = await loadCharacterConfig();
const grid = $('#grid');
const items = [];
Object.entries(cfg.characters).forEach(([kind, c]) => {
  if (c.normal) items.push({ kind, file: c.normal, label: `${ROLE[kind] ?? kind}（ふつうの顔）` });
  if (c.worried) items.push({ kind, file: c.worried, label: `${ROLE[kind] ?? kind}（あわてた顔）` });
});

const results = [];
for (const it of items) {
  const url = `${cfg.basePath}${it.file}`;
  const r = await inspect(url);
  const kb = r.ok ? await fileSizeKB(url) : null;
  results.push({ ...it, ...r, kb });

  const card = el('div', 'chars-card');
  card.append(el('h3', null, it.label), el('p', 'file', it.file));
  const thumb = el('div', 'chars-thumb');
  if (r.ok) {
    const img = el('img');
    img.src = url;
    img.alt = it.label;
    thumb.append(img);
  } else {
    thumb.append(el('span', 'none', '見つかりません'));
  }
  card.append(thumb);

  const badges = el('ul', 'chars-badges');
  const badge = (cls, text) => badges.append(el('li', cls, text));
  if (!r.ok) {
    badge('ng', '画像がありません（ゲームの絵を使います）');
  } else {
    badge('ok', '読み込めた');
    const ratio = r.w / r.h;
    const okRatio = ratio >= RATIO.min && ratio <= RATIO.max;
    badge(okRatio ? 'ok' : 'warn', `${r.w} × ${r.h}${okRatio ? '' : '（縦長ではありません。縦横比 4:5 〜 2:3 がおすすめです）'}`);
    if (r.w < 400) badge('warn', '小さめです（横 512 ピクセル以上がおすすめ）');
    if (r.transparent === true) badge('ok', '背景が、透明');
    else if (r.transparent === false) badge('warn', `背景が、透明ではありません（角の色: ${r.corner}）`);
    if (kb !== null) badge(kb > MAX_KB ? 'warn' : 'ok', `${kb} KB${kb > MAX_KB ? '（重いです。圧縮をおすすめします）' : ''}`);
  }
  card.append(badges);
  grid.append(card);
}

// まとめ
const found = results.filter((r) => r.ok).length;
const summary = $('#summary');
summary.textContent = `${found} / ${results.length} 枚が、読み込めました。` + (found === results.length ? ' そろっています。' : ' 足りない画像は、ゲームに入っている絵（SVG）で、表示されます。');
summary.classList.add(found === results.length ? 'is-ok' : 'is-ng');

const advice = [];
if (!cfg.useImages) advice.push('content/characters.json の useImages が false です。画像は、使われません。true にしてください。');
const solid = results.filter((r) => r.ok && r.transparent === false);
if (solid.length) {
  advice.push(`${solid.length} 枚の画像は、背景が透明ではありません。白い四角が、見えてしまいます。次のどれかを、してください。`);
  advice.push('背景を、消す（ChatGPT にもう一度頼む、または、背景を消す無料のサービスを使う）。いちばん、きれいです。');
  advice.push('すぐ、試したいときは、content/characters.json の blend を "multiply" にします（背景が、白い画像だけ、なじみます）。');
}
const odd = results.filter((r) => r.ok && (r.w / r.h < RATIO.min || r.w / r.h > RATIO.max));
if (odd.length) advice.push(`${odd.length} 枚の画像は、縦長ではありません（縦横比 4:5 〜 2:3 がおすすめです）。ゲームの中で、小さく見えたり、位置がずれたりします。切り抜き直すか、content/characters.json の scale と offsetY で、調整してください。`);
if (advice.length) {
  const box = $('#advice');
  box.hidden = false;
  const head = el('strong', null, '直したほうが、よい点');
  const ul = el('ul');
  advice.forEach((a) => ul.append(el('li', null, a)));
  box.append(head, ul);
}

// ゲームの中での見え方
const ingame = $('#ingame');
Object.keys(cfg.characters).forEach((kind) => {
  const row = el('div', 'chars-row');
  row.append(el('strong', null, ROLE[kind] ?? kind));
  const zones = el('div', 'chars-zones');
  [['z-alice', 58], ['z-public', 112], ['z-bob', 58]].forEach(([z, size]) => {
    const cell = el('div', z);
    cell.append(makeCharacter(kind, { width: size, height: Math.round(size * 1.28), className: 'character' }));
    cell.append(el('span', 'tag', size === 58 ? '部品（Alice・Bob）の大きさ' : '攻撃者の大きさ'));
    zones.append(cell);
  });
  row.append(zones);
  ingame.append(row);
});
