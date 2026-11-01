// logo.js
// 左上のロゴ（「CRYPTA」）を、画像に、置き換える。画像が、ないときは、元のロゴ（文字）を、そのまま使う。
//   ・画像は、content/logo.json の file（既定: assets/logo.svg / logo.png / logo.webp の、見つかった、最初のもの）
//   ・管理者モードのときだけ、管理者センターで、「試し」に、選んだ画像を、使う（この端末だけ）

const OVERRIDE_KEY = 'crypta:override:logo';

function canLoad(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

async function pickSource() {
  try {
    if (sessionStorage.getItem('crypta:admin') === '1') {
      const ov = localStorage.getItem(OVERRIDE_KEY);
      if (ov && (await canLoad(ov))) return { src: ov, height: 44, alt: 'CRYPTA' };
    }
  } catch { /* 試し用が、読めなければ、ふつうのロゴ */ }
  let cfg = {};
  try {
    const res = await fetch('content/logo.json', { cache: 'no-cache' });
    if (res.ok) cfg = await res.json();
  } catch { /* 設定がなくても、続けられる */ }
  const files = [].concat(cfg.file ?? ['assets/logo.svg', 'assets/logo.png', 'assets/logo.webp']);
  for (const f of files) {
    // 画像が、あるかを、先に、確かめる（見つからないときに、エラー表示が、出ないように）
    try {
      const head = await fetch(f, { method: 'HEAD', cache: 'no-cache' });
      if (!head.ok) continue;
    } catch { continue; }
    if (await canLoad(f)) return { src: f, height: cfg.height ?? 44, alt: cfg.alt ?? 'CRYPTA' };
  }
  return null;
}

async function applyLogo() {
  const links = document.querySelectorAll('.site-logo');
  if (!links.length) return;
  const found = await pickSource();
  if (!found) return; // 画像が、なければ、元のロゴのまま
  links.forEach((a) => {
    a.classList.add('has-image');
    a.style.setProperty('--logo-h', `${found.height}px`);
    const img = document.createElement('img');
    img.src = found.src;
    img.alt = found.alt;
    a.replaceChildren(img);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyLogo, { once: true });
else applyLogo();
