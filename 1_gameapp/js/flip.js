// flip.js  表面と裏面の切り替え：色が、じわっと変わる
export function flipTo(url, color) {
  try { sessionStorage.setItem('crypta:flip', color); } catch { /* 保存できなくても、動く */ }
  const o = document.createElement('div');
  o.className = 'flip-out';
  o.style.background = color;
  document.body.append(o);
  requestAnimationFrame(() => o.classList.add('is-on'));
  setTimeout(() => { location.href = url; }, 600);
}
