// characters.js
// Alice・Bob・Eve・Mallory・正体不明の攻撃者（AI）の、キャラクターの絵。
//   makeCharacter('alice' | 'bob' | 'eve' | 'mallory' | 'ai' | 'robot', { width, height, className })
//
// 絵は、2通り:
//   1. 画像（assets/characters/ に置いた、PNG など）。content/characters.json で、ファイル名を決める。
//   2. 画像がないとき（置いていない・読み込めない）は、ここに書いてある SVG の絵を使う。
// どちらも、表情は、2種類（ふつう = .face-ok、あわてた = .face-bad）。どちらを見せるかは、CSS で切り替える。

const NS = 'http://www.w3.org/2000/svg';
const OL = '#2d3556'; // 輪郭の色
const SKIN = '#ffe0c2';
const NECK = '#ffd9b8';
const LINE = `stroke="${OL}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;

// あわてた顔の、共通パーツ（汗・大きな目・まゆ）
const WORRY = (eyeY = 47, sweat = true) => `
  <g class="face-bad">
    <circle cx="41" cy="${eyeY}" r="4.4" fill="#fff" stroke="${OL}" stroke-width="1.6"/><circle cx="59" cy="${eyeY}" r="4.4" fill="#fff" stroke="${OL}" stroke-width="1.6"/>
    <circle cx="41.6" cy="${eyeY + 0.6}" r="1.8" fill="${OL}"/><circle cx="58.4" cy="${eyeY + 0.6}" r="1.8" fill="${OL}"/>
    <path d="M35 ${eyeY - 8}L46 ${eyeY - 5}M65 ${eyeY - 8}L54 ${eyeY - 5}" fill="none" stroke="${OL}" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="50" cy="${eyeY + 13}" rx="3.4" ry="4" fill="${OL}"/>
    ${sweat ? '<path d="M74 34Q80 43 74 48Q68 43 74 34Z" fill="#8ecbff" stroke="#4aa8e8" stroke-width="1.4"/>' : ''}
  </g>`;

// キャラクターは、単純な形（○ □ △ ◇）に、目と口だけ。色は、キャラごとに、決まっている。
//   Alice = ○（青）  Bob = □（青緑）  Eve = △（くすんだ青紫）  Mallory = ◇（紅）
const INK2 = '#263650';
const PAPER2 = '#FFFCF5';
const EYES = (y, dx = 11) => `
  <circle cx="${50 - dx}" cy="${y}" r="5.4" fill="${PAPER2}"/><circle cx="${50 + dx}" cy="${y}" r="5.4" fill="${PAPER2}"/>
  <circle cx="${50 - dx}" cy="${y + 0.6}" r="2.5" fill="${INK2}"/><circle cx="${50 + dx}" cy="${y + 0.6}" r="2.5" fill="${INK2}"/>`;
const SMILE = (y) => `<path d="M41 ${y}Q50 ${y + 9} 59 ${y}" fill="none" stroke="${INK2}" stroke-width="2.8" stroke-linecap="round"/>`;
const WORRY2 = (y) => `
  <g class="face-bad">
    <circle cx="38" cy="${y}" r="7" fill="${PAPER2}"/><circle cx="62" cy="${y}" r="7" fill="${PAPER2}"/>
    <circle cx="38.6" cy="${y + 0.8}" r="2.4" fill="${INK2}"/><circle cx="61.4" cy="${y + 0.8}" r="2.4" fill="${INK2}"/>
    <path d="M31 ${y - 11}L44 ${y - 8}M69 ${y - 11}L56 ${y - 8}" fill="none" stroke="${INK2}" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse cx="50" cy="${y + 17}" rx="4" ry="5" fill="${INK2}"/>
    <path d="M82 ${y - 18}Q88 ${y - 8} 82 ${y - 3}Q76 ${y - 8} 82 ${y - 18}Z" fill="#8ecbff"/>
  </g>`;
const GLOW_EYES = (y) => `<g class="glow" fill="#41e6ff"><rect x="32" y="${y}" width="14" height="6" rx="3"/><rect x="54" y="${y}" width="14" height="6" rx="3"/></g>`;

const CHARACTERS = {
  // Alice: ○（青）
  alice: `
  <circle cx="50" cy="68" r="40" fill="#53679B"/>
  <g class="face-ok">${EYES(62)}${SMILE(77)}</g>${WORRY2(62)}`,

  // Bob: □（青緑）
  bob: `
  <rect x="12" y="30" width="76" height="76" rx="12" fill="#347C79"/>
  <g class="face-ok">${EYES(60)}${SMILE(76)}</g>${WORRY2(60)}`,

  // Eve: △（くすんだ青紫）。目を細めて、にやり
  eve: `
  <path d="M50 24L92 102H8Z" fill="#747093" stroke="#747093" stroke-width="10" stroke-linejoin="round"/>
  <g class="face-ok">${EYES(76, 10)}
    <path d="M32 72H46M54 72H68" fill="none" stroke="#747093" stroke-width="7"/>
    <path d="M32 72H46M54 72H68" fill="none" stroke="${INK2}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M42 91Q52 97 60 89" fill="none" stroke="${INK2}" stroke-width="2.8" stroke-linecap="round"/></g>${WORRY2(76)}`,

  // Mallory: ◇（紅）。つり上がった、まゆ
  mallory: `
  <path d="M50 20L94 68L50 116L6 68Z" fill="#A65361" stroke="#A65361" stroke-width="8" stroke-linejoin="round"/>
  <g class="face-ok">${EYES(68, 11)}
    <path d="M30 56L45 63M70 56L55 63" fill="none" stroke="${INK2}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M41 86Q50 92 60 85" fill="none" stroke="${INK2}" stroke-width="2.8" stroke-linecap="round"/></g>${WORRY2(68)}`,

  // 正体不明の攻撃者「？？？」: ロボットの頭の、影（暗い色）。青白い目だけが、光っている
  ai: `
  <g stroke="#263650" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M50 28V15" fill="none"/><circle cx="50" cy="11" r="5.5" fill="#1b2038"/>
    <rect x="3" y="52" width="10" height="22" rx="4" fill="#2c3556"/><rect x="87" y="52" width="10" height="22" rx="4" fill="#2c3556"/>
    <rect x="10" y="28" width="80" height="78" rx="20" fill="#1b2038"/>
    <rect x="19" y="44" width="62" height="30" rx="15" fill="#05070f"/>
    <path d="M32 90H68M38 90V97M50 90V97M62 90V97" fill="none" stroke="#41e6ff"/>
  </g>
  <g class="glow" fill="#41e6ff"><rect x="29" y="54" width="14" height="9" rx="4.5"/><rect x="57" y="54" width="14" height="9" rx="4.5"/></g>`,

  // 正体は AI: ロボットの頭だけ（明るい灰色の頭、黒いバイザー、青白い目、アンテナの赤い玉）
  robot: `
  <g stroke="#263650" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M50 28V15" fill="none"/><circle cx="50" cy="11" r="5.5" fill="#ff5c7a"/>
    <rect x="3" y="52" width="10" height="22" rx="4" fill="#9aa8bb"/><rect x="87" y="52" width="10" height="22" rx="4" fill="#9aa8bb"/>
    <rect x="10" y="28" width="80" height="78" rx="20" fill="#cfd8e3"/>
    <rect x="19" y="44" width="62" height="30" rx="15" fill="#0b1020"/>
    <path d="M32 90H68M38 90V97M50 90V97M62 90V97" fill="none" stroke="#263650"/>
  </g>
  <g class="glow" fill="#41e6ff"><rect x="29" y="54" width="14" height="9" rx="4.5"/><rect x="57" y="54" width="14" height="9" rx="4.5"/></g>`,
};

function makeSvgCharacter(kind, { width = 76, height = 98, className = 'character' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 128');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('class', `${className} character-${kind}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = CHARACTERS[kind] ?? CHARACTERS.ai;
  return svg;
}


// ====================== 画像を使う（content/characters.json） ======================
let CONFIG = { useImages: false, basePath: 'assets/characters/', blend: 'normal', characters: {} };
const missing = new Set(); // 読み込めなかった画像（以後は、SVG を使う）

// 設定を、読み込む。読み込めなくても、ゲームは、SVG の絵で動く。
export async function loadCharacterConfig(url = 'content/characters.json') {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    CONFIG = {
      useImages: data.useImages !== false,
      basePath: data.basePath ?? 'assets/characters/',
      blend: data.blend ?? 'normal',
      characters: data.characters ?? {},
    };
  } catch (err) {
    console.warn('[characters] content/characters.json を読み込めませんでした。SVG の絵を使います:', err);
  }
  return CONFIG;
}

export const getCharacterConfig = () => CONFIG;

// 画像のキャラクター。2枚（ふつう・あわてた）を、重ねて持ち、CSS で、見せるほうを切り替える
function makeImageCharacter(kind, c, { width = 76, height = 98, className = 'character' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `${className} character-img character-${kind}`;
  wrap.style.width = `${width}px`;
  wrap.style.height = `${height}px`;

  const make = (file, cls) => {
    const img = document.createElement('img');
    img.className = cls;
    img.alt = '';
    img.draggable = false;
    img.src = `${CONFIG.basePath}${file}`;
    const scale = c.scale ?? 1;
    const dy = c.offsetY ?? 0;
    if (scale !== 1 || dy !== 0) img.style.transform = `translateY(${dy}%) scale(${scale})`;
    if (CONFIG.blend === 'multiply') img.style.mixBlendMode = 'multiply'; // 背景が透明でない画像向け
    return img;
  };
  const ok = make(c.normal, 'face-ok');
  const bad = make(c.worried || c.normal, 'face-bad');
  // ふつうの画像が、読み込めなければ、SVG の絵に切り替える。あわてた顔だけ、ないときは、ふつうの顔を使う
  ok.addEventListener('error', () => {
    missing.add(kind);
    if (wrap.parentNode) wrap.replaceWith(makeSvgCharacter(kind, { width, height, className }));
  });
  bad.addEventListener('error', () => {
    if (bad.src !== ok.src) bad.src = ok.src;
  });
  wrap.append(ok, bad);
  return wrap;
}

export function makeCharacter(kind, opts = {}) {
  const c = CONFIG.useImages ? CONFIG.characters?.[kind] : null;
  if (!c?.normal || missing.has(kind)) return makeSvgCharacter(kind, opts);
  return makeImageCharacter(kind, c, opts);
}
