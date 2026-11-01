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

const CHARACTERS = {
  // Alice: 長い髪・青い上着・ピンクのリボン。明るくて、まじめな、送り手
  alice: `
  <g ${LINE}>
    <path d="M25 46C20 12 80 12 75 46C78 66 84 74 82 94L66 90L34 90L18 94C16 74 22 66 25 46Z" fill="#8a5a3c"/>
    <path d="M12 128C12 98 28 82 50 82C72 82 88 98 88 128Z" fill="#4c6ef5"/>
    <path d="M36 82L50 100L64 82Z" fill="#fff"/>
    <path d="M43 64V84H57V64Z" fill="${NECK}"/>
    <circle cx="50" cy="44" r="22" fill="${SKIN}"/>
    <path d="M27 42C26 16 74 16 73 42C64 36 56 30 50 24C46 32 38 38 27 42Z" fill="#8a5a3c"/>
    <path d="M68 22L85 13L83 32Z" fill="#f06595"/><path d="M68 22L79 39L63 31Z" fill="#f06595"/><circle cx="68" cy="23" r="3.6" fill="#e64980"/>
  </g>
  <g class="face-ok">
    <ellipse cx="41" cy="48" rx="2.7" ry="3.7" fill="${OL}"/><ellipse cx="59" cy="48" rx="2.7" ry="3.7" fill="${OL}"/>
    <circle cx="42" cy="46.6" r="1.1" fill="#fff"/><circle cx="60" cy="46.6" r="1.1" fill="#fff"/>
    <circle cx="34" cy="55" r="3.6" fill="#ff9aa8" opacity=".7"/><circle cx="66" cy="55" r="3.6" fill="#ff9aa8" opacity=".7"/>
    <path d="M44 56Q50 62.5 56 56" fill="none" stroke="${OL}" stroke-width="2.2" stroke-linecap="round"/>
  </g>${WORRY()}`,

  // Bob: 短い黒髪・丸めがね・緑のパーカー。のんびり、受け手
  bob: `
  <g ${LINE}>
    <path d="M10 128C10 96 28 80 50 80C72 80 90 96 90 128Z" fill="#20c997"/>
    <path d="M30 84C34 73 66 73 70 84L62 97H38Z" fill="#12a37f"/>
    <path d="M43 64V82H57V64Z" fill="${NECK}"/>
    <circle cx="50" cy="44" r="22" fill="${SKIN}"/>
    <path d="M27 42C23 12 77 10 73 42C70 34 66 29 59 27L53 21L47 27C38 28 31 34 27 42Z" fill="#2f3542"/>
    <path d="M42 100H58M50 100V120" stroke="#0e8a69" stroke-width="2" fill="none"/>
  </g>
  <g class="face-ok">
    <g fill="rgba(255,255,255,.55)" stroke="${OL}" stroke-width="2.2"><circle cx="40" cy="47" r="8"/><circle cx="60" cy="47" r="8"/></g>
    <path d="M48 47H52" stroke="${OL}" stroke-width="2.2" fill="none"/>
    <circle cx="40" cy="47" r="2.5" fill="${OL}"/><circle cx="60" cy="47" r="2.5" fill="${OL}"/>
    <path d="M44 58Q50 63 56 58" fill="none" stroke="${OL}" stroke-width="2.2" stroke-linecap="round"/>
  </g>${WORRY(47)}`,

  // Eve: 盗み聞きする人。青緑のフードと、ヘッドホン。目は、半分とじて、にやり
  eve: `
  <g ${LINE}>
    <path d="M8 128C8 96 26 80 50 80C74 80 92 96 92 128Z" fill="#0f8a84"/>
    <path d="M28 80L50 110L72 80L64 76L50 92L36 76Z" fill="#14a39b"/>
    <path d="M44 64V82H56V64Z" fill="${NECK}"/>
    <path d="M22 52C14 12 86 12 78 52C80 62 76 70 70 74L66 62L34 62L30 74C24 70 20 62 22 52Z" fill="#14a39b"/>
    <ellipse cx="50" cy="47" rx="19" ry="21" fill="${SKIN}"/>
    <path d="M30 40C34 27 66 27 70 40C62 35 38 35 30 40Z" fill="#0f8a84"/>
    <path d="M24 48C22 10 78 10 76 48" fill="none" stroke="${OL}" stroke-width="5"/>
    <rect x="15" y="42" width="13" height="20" rx="5.5" fill="${OL}"/><rect x="72" y="42" width="13" height="20" rx="5.5" fill="${OL}"/>
  </g>
  <g fill="none" stroke="#14a39b" stroke-width="2.4" stroke-linecap="round" opacity=".85"><path d="M90 47Q94 52 90 57"/><path d="M94 42Q100.5 52 94 62"/></g>
  <g class="face-ok">
    <path d="M35 50Q41 45 47 50" fill="none" stroke="${OL}" stroke-width="2.4" stroke-linecap="round"/><path d="M53 50Q59 45 65 50" fill="none" stroke="${OL}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="41" cy="50.5" r="1.9" fill="${OL}"/><circle cx="59" cy="50.5" r="1.9" fill="${OL}"/>
    <path d="M42 60Q51 65 59 57" fill="none" stroke="${OL}" stroke-width="2.2" stroke-linecap="round"/>
  </g>${WORRY(49, false)}`,

  // Mallory: 書き換える人。黒いニット帽と、赤いマスク。赤いペンを持っている
  mallory: `
  <g ${LINE}>
    <path d="M10 128C10 96 28 80 50 80C72 80 90 96 90 128Z" fill="#ee5f78"/>
    <path d="M36 80L50 94L64 80Z" fill="#c92a4a"/>
    <path d="M44 64V82H56V64Z" fill="${NECK}"/>
    <circle cx="50" cy="45" r="22" fill="${SKIN}"/>
    <path d="M26 40C22 6 78 6 74 40L74 33C62 28 38 28 26 33Z" fill="#2d3556"/>
    <path d="M25 34H75V43H25Z" fill="#3b4570"/>
    <path d="M29 51C40 55 60 55 71 51C73 64 62 73 50 73C38 73 27 64 29 51Z" fill="#c92a4a"/>
    <g transform="rotate(24 84 104)"><rect x="79.5" y="86" width="9" height="32" rx="3" fill="#fff"/><rect x="79.5" y="86" width="9" height="9" rx="3" fill="#ee5f78"/><path d="M79.5 118L84 128L88.5 118Z" fill="#c92a4a"/></g>
    <circle cx="79" cy="104" r="6.5" fill="${SKIN}"/>
  </g>
  <g class="face-ok">
    <path d="M33 41L47 46M67 41L53 46" fill="none" stroke="${OL}" stroke-width="2.8" stroke-linecap="round"/>
    <circle cx="41" cy="48.5" r="2.6" fill="${OL}"/><circle cx="59" cy="48.5" r="2.6" fill="${OL}"/>
    <circle cx="41.9" cy="47.6" r="0.9" fill="#fff"/><circle cx="59.9" cy="47.6" r="0.9" fill="#fff"/>
    <path d="M42 62Q50 66 58 62" fill="none" stroke="#7d1530" stroke-width="2" stroke-linecap="round"/>
  </g>${WORRY(48)}`,

  // 正体不明の攻撃者: 黒いフードの中は、空っぽ。青白い目だけが、光っている
  ai: `
  <g stroke="#0b1020" stroke-width="2.4" stroke-linejoin="round">
    <path d="M10 128C10 94 28 78 50 78C72 78 90 94 90 128Z" fill="#1b2038"/>
    <path d="M18 54C14 8 86 8 82 54C84 66 78 74 70 78L30 78C22 74 16 66 18 54Z" fill="#1b2038"/>
    <ellipse cx="50" cy="51" rx="20" ry="21" fill="#05070f"/>
  </g>
  <g fill="none" stroke="#41e6ff" stroke-width="1.6" opacity=".75"><path d="M22 112H40V100M78 112H60V100M50 128V106"/><circle cx="22" cy="112" r="2.2" fill="#41e6ff"/><circle cx="78" cy="112" r="2.2" fill="#41e6ff"/></g>
  <g class="glow" fill="#41e6ff"><rect x="35" y="45" width="11" height="6" rx="3"/><rect x="54" y="45" width="11" height="6" rx="3"/></g>`,

  // 正体は AI: ロボットの頭と、胸の「AI」
  robot: `
  <g stroke="#0b1020" stroke-width="2.4" stroke-linejoin="round">
    <path d="M10 128C10 94 28 82 50 82C72 82 90 94 90 128Z" fill="#1b2038"/>
    <rect x="43" y="64" width="14" height="20" fill="#9aa8bb"/>
  </g>
  <rect x="36" y="96" width="28" height="18" rx="4" fill="#0b1020" stroke="#41e6ff" stroke-width="1.6"/>
  <text x="50" y="110" text-anchor="middle" font-size="13" font-weight="800" fill="#41e6ff" font-family="sans-serif">AI</text>
  <g stroke="${OL}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M50 22V10" fill="none"/><circle cx="50" cy="8" r="4.2" fill="#ff5c7a"/>
    <rect x="22" y="22" width="56" height="46" rx="13" fill="#cfd8e3"/>
    <rect x="15" y="38" width="8" height="14" rx="3" fill="#9aa8bb"/><rect x="77" y="38" width="8" height="14" rx="3" fill="#9aa8bb"/>
    <rect x="29" y="32" width="42" height="20" rx="10" fill="#0b1020"/>
    <path d="M38 62H62M42 62V66M50 62V66M58 62V66" fill="none"/>
  </g>
  <g class="glow" fill="#41e6ff"><rect x="35" y="39" width="10" height="6" rx="3"/><rect x="55" y="39" width="10" height="6" rx="3"/></g>`,
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
