// characters-tool.js
// キャラクター画像の、自動整形。
//   ① 背景が白（などの、べた塗り）なら、透明にする  ② 余白をけずって、中央に、同じ大きさの枠へ入れる
//   ③ 大きさを小さくして、名前を付けて、保存（zip）する
// 画像は、このページの中だけで処理される（ネットには、送られない）。

import './texts.js'; // 画面の文章を、content/ui-texts.json で、書き換えられるようにする

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const SLOTS = [
  ['alice', 'Alice（ふつうの顔）'], ['alice_worried', 'Alice（あわてた顔）'],
  ['bob', 'Bob（ふつうの顔）'], ['bob_worried', 'Bob（あわてた顔）'],
  ['eve', 'Eve（ふつうの顔）'], ['eve_worried', 'Eve（あわてた顔）'],
  ['mallory', 'Mallory（ふつうの顔）'], ['mallory_worried', 'Mallory（あわてた顔）'],
  ['ai', '正体不明の攻撃者（???）'], ['robot', '正体（AI のロボット）'],
];

// ファイル名から、どのキャラかを、推測する
function guessSlot(name) {
  const n = name.toLowerCase();
  const worried = /worr|あわて|焦|surpris|panic/.test(n);
  const who = ['alice', 'bob', 'eve', 'mallory'].find((w) => n.includes(w));
  if (who) return worried ? `${who}_worried` : who;
  if (/robot|ロボ/.test(n)) return 'robot';
  if (/(^|[^a-z])ai([^a-z]|$)|\?\?\?|unknown|不明/.test(n)) return 'ai';
  return '';
}

const items = []; // { file, name, img, slot, outBlob, outUrl, w, h }

// ---------- 読み込み ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => reject(new Error(`${file.name} を、画像として、読み込めませんでした`));
    img.src = url;
  });
}

async function addFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    try {
      const { img, url } = await loadImage(f);
      items.push({ file: f, name: f.name, img, url, slot: guessSlot(f.name) });
    } catch (err) {
      showMsg(err.message, true);
    }
  }
  render();
}

// ---------- 画像処理 ----------
// 背景を、透明にする: 四隅の色に近い、ふちとつながった部分だけを、消す（キャラの中の白は、残る）
function removeBackground(imageData, tol) {
  const { width: w, height: h, data } = imageData;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  const px = (x, y) => (y * w + x) * 4;
  // すでに、四隅が透明なら、何もしない
  if (corners.every(([x, y]) => data[px(x, y) + 3] < 20)) return false;
  const [cx, cy] = corners[0];
  const base = [data[px(cx, cy)], data[px(cx, cy) + 1], data[px(cx, cy) + 2]];
  const near = (i) => Math.abs(data[i] - base[0]) + Math.abs(data[i + 1] - base[1]) + Math.abs(data[i + 2] - base[2]) <= tol * 3 / 2 && data[i + 3] > 20;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = y * w + x;
    if (seen[k]) return;
    if (!near(k * 4)) return;
    seen[k] = 1;
    stack.push(k);
  };
  // 下の端からは、始めない（胸から上の絵では、下の端は、背景ではなく、体（白いシャツなど）のことが、多いため）
  for (let x = 0; x < w; x += 1) push(x, 0);
  for (let y = 0; y < h; y += 1) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const k = stack.pop();
    const x = k % w;
    const y = (k / w) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  for (let k = 0; k < w * h; k += 1) if (seen[k]) data[k * 4 + 3] = 0;
  // ふちの、白いにじみ（背景色に近い、半端な色）を、少し、薄くする
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const k = y * w + x;
      if (seen[k] || data[k * 4 + 3] === 0) continue;
      if (seen[k - 1] || seen[k + 1] || seen[k - w] || seen[k + w]) {
        const i = k * 4;
        const d = Math.abs(data[i] - base[0]) + Math.abs(data[i + 1] - base[1]) + Math.abs(data[i + 2] - base[2]);
        if (d < tol * 3) data[i + 3] = Math.min(data[i + 3], Math.round((d / (tol * 3)) * 255));
      }
    }
  }
  return true;
}

function bboxOf(imageData) {
  const { width: w, height: h, data } = imageData;
  let minx = w, miny = h, maxx = -1, maxy = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  return maxx < 0 ? null : { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, touchesBottom: maxy >= h - 2 };
}

async function process() {
  const opts = {
    removeBg: $('#opt-bg').checked,
    tol: Number($('#opt-tol').value),
    outW: Number($('#opt-size').value),
    ratio: Number($('#opt-ratio').value) / 100,
  };
  const outH = Math.round(opts.outW * 1.25); // 縦横比 4:5

  // ① 背景の処理と、見えている範囲の、測定
  for (const it of items) {
    const cv = document.createElement('canvas');
    cv.width = it.img.naturalWidth;
    cv.height = it.img.naturalHeight;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(it.img, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height);
    it.bgRemoved = opts.removeBg ? removeBackground(data, opts.tol) : false;
    ctx.putImageData(data, 0, 0);
    it.canvas = cv;
    it.box = bboxOf(data);
  }

  // ② 同じキャラの「ふつう」と「あわてた」は、同じ切り抜き・同じ拡大で、そろえる（顔以外が、ずれないように）
  const groups = new Map();
  items.forEach((it) => {
    if (!it.slot || !it.box) return;
    const key = it.slot.replace('_worried', '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  });
  for (const list of groups.values()) {
    const u = list.reduce((a, it) => {
      const b = it.box;
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
      return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0, touchesBottom: a.touchesBottom || b.touchesBottom };
    }, { ...list[0].box });
    const scale0 = (outH * opts.ratio) / u.h;
    const scale = Math.min(scale0, (outW0(opts) * 1.0) / u.w);
    for (const it of list) {
      const out = document.createElement('canvas');
      out.width = opts.outW;
      out.height = outH;
      const ctx = out.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const dw = it.canvas.width * scale;
      const dh = it.canvas.height * scale;
      const dx = opts.outW / 2 - (u.x + u.w / 2) * scale;
      const dy = u.touchesBottom ? outH - (u.y + u.h) * scale : (outH - u.h * scale) / 2 - u.y * scale;
      ctx.drawImage(it.canvas, dx, dy, dw, dh);
      it.outBlob = await new Promise((res) => out.toBlob(res, 'image/png'));
      if (it.outUrl) URL.revokeObjectURL(it.outUrl);
      it.outUrl = URL.createObjectURL(it.outBlob);
      it.outW = opts.outW;
      it.outH = outH;
    }
  }
  const done = items.filter((it) => it.outBlob).length;
  const skipped = items.length - done;
  showMsg(`${done} 枚を、整えました。${skipped ? `（${skipped} 枚は、キャラが、選ばれていないか、絵が、見つからなかったので、飛ばしました）` : ''}`, skipped > 0 && done === 0);
  render();
}
const outW0 = (o) => o.outW;

// ---------- 保存 ----------
function crc32(buf) {
  let c, crc = 0xffffffff;
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc32.table[n] = c >>> 0;
    }
  }
  for (let i = 0; i < buf.length; i += 1) crc = crc32.table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ファイルを、そのまま入れる（圧縮しない）zip。PNG は、すでに、圧縮されているので、これで十分
function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => new Uint8Array([n & 255, (n >> 8) & 255]);
  const u32 = (n) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
  const cat = (...a) => a.reduce((x, y) => { const r = new Uint8Array(x.length + y.length); r.set(x); r.set(y, x.length); return r; }, new Uint8Array());
  files.forEach(({ name, data }) => {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes);
    chunks.push(local, data);
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes));
    offset += local.length + data.length;
  });
  const cdStart = offset;
  const cd = central.reduce((a, b) => cat(a, b), new Uint8Array());
  const end = cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(cdStart), u16(0));
  return new Blob([...chunks, cd, end], { type: 'application/zip' });
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

async function saveZip() {
  const ready = items.filter((it) => it.outBlob && it.slot);
  // 同じキャラの画像が、2枚以上あるときは、あとのものを使う
  const bySlot = new Map(ready.map((it) => [it.slot, it]));
  const files = [];
  for (const [slot, it] of bySlot) files.push({ name: `${slot}.png`, data: new Uint8Array(await it.outBlob.arrayBuffer()) });
  if (!files.length) return;
  download(makeZip(files), 'characters.zip');
  showMsg(`${files.length} 枚を、characters.zip に、まとめて保存しました。展開して、中の画像を、assets/characters/ に置いてください。`);
}

// ---------- 画面 ----------
function showMsg(text, isError = false) {
  const m = $('#msg');
  m.hidden = false;
  m.textContent = text;
  m.className = `chars-summary ${isError ? 'is-ng' : 'is-ok'}`;
}

const kb = (b) => `${Math.round(b.size / 1024)} KB`;

function render() {
  const list = $('#list');
  list.replaceChildren();
  items.forEach((it, i) => {
    const card = el('div', 'chars-card');
    card.append(el('h3', null, it.name), el('p', 'file', `${it.img.naturalWidth} × ${it.img.naturalHeight}・${kb(it.file)}`));

    const pair = el('div', 'tool-pair');
    const before = el('div'); before.append(el('small', null, '元の画像'));
    const bt = el('div', 'chars-thumb'); const bi = el('img'); bi.src = it.url; bt.append(bi); before.append(bt);
    const after = el('div'); after.append(el('small', null, it.outBlob ? '整えたあと' : '（まだ）'));
    const at = el('div', 'chars-thumb');
    if (it.outUrl) { const ai = el('img'); ai.src = it.outUrl; at.append(ai); }
    after.append(at);
    pair.append(before, after);
    card.append(pair);

    const sel = el('select', 'tool-slot');
    sel.append(new Option('どのキャラ？（選んでください）', ''));
    SLOTS.forEach(([v, label]) => sel.append(new Option(label, v)));
    sel.value = it.slot;
    sel.addEventListener('change', () => { it.slot = sel.value; it.outBlob = null; render(); });
    card.append(sel);

    const badges = el('ul', 'chars-badges');
    const badge = (cls, t) => badges.append(el('li', cls, t));
    if (!it.slot) badge('warn', 'キャラを選んでください');
    if (it.outBlob) {
      badge('ok', `${it.outW} × ${it.outH}`);
      badge(it.outBlob.size > 500 * 1024 ? 'warn' : 'ok', kb(it.outBlob));
      if (it.bgRemoved) badge('ok', '背景を、透明にした');
    }
    card.append(badges);

    const act = el('div', 'tool-card-actions');
    if (it.outBlob && it.slot) {
      const dl = el('button', 'button button-secondary', 'この1枚を保存');
      dl.type = 'button';
      dl.addEventListener('click', () => download(it.outBlob, `${it.slot}.png`));
      act.append(dl);
    }
    const rm = el('button', 'button button-secondary', '消す');
    rm.type = 'button';
    rm.addEventListener('click', () => { items.splice(i, 1); render(); });
    act.append(rm);
    card.append(act);
    list.append(card);
  });
  $('#run').disabled = items.length === 0;
  $('#zip').disabled = !items.some((it) => it.outBlob && it.slot);
  $('#clear').disabled = items.length === 0;
}

// ---------- 操作 ----------
const drop = $('#drop');
const fileInput = $('#file');
drop.addEventListener('click', (e) => { if (e.target !== fileInput) fileInput.click(); });
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
$('#run').addEventListener('click', process);
$('#zip').addEventListener('click', saveZip);
$('#clear').addEventListener('click', () => { items.length = 0; $('#msg').hidden = true; render(); });
$('#opt-tol').addEventListener('input', (e) => { $('#out-tol').textContent = e.target.value; });
$('#opt-ratio').addEventListener('input', (e) => { $('#out-ratio').textContent = e.target.value; });
render();
