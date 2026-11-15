// flip.js  画面の移り変わり：フェードアウト → 次の画面でフェードイン
//   flipTo(url, color)：表面⇄裏面の切り替え（色が、じわっと変わる）
//   fadeTo(url)：ステージ間など、ふつうの移動（いまの背景色で、フェードする）
//   bindFadeLinks()：ページ内の、ふつうのリンク（同じサイトの .html）を、すべて、フェードつきにする
export function flipTo(url, color) {
  try { sessionStorage.setItem('crypta:flip', color); } catch { /* 保存できなくても、動く */ }
  const o = document.createElement('div');
  o.className = 'flip-out';
  o.style.background = color;
  document.body.append(o);
  requestAnimationFrame(() => o.classList.add('is-on'));
  setTimeout(() => { location.href = url; }, 600);
}
const pageColor = () => {
  const c = getComputedStyle(document.body).backgroundColor;
  return c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' ? c : '#ffffff';
};
export function fadeTo(url) { flipTo(url, pageColor()); }

let bound = false;
export function bindFadeLinks() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    let u;
    try { u = new URL(a.href, location.href); } catch { return; }
    if (u.origin !== location.origin || !/\.html$/.test(u.pathname)) return;
    if (u.pathname === location.pathname && u.search === location.search) return; // 同じページの中（#…）は、そのまま
    e.preventDefault();
    fadeTo(u.href);
  });
}
