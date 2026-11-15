// attacker-home.js  裏面のホーム画面（表面の index.html と同じ構成）
import './texts.js'; // 画面の文字を、データ（crypta.json の ui-texts・names）で、置き換える
import { flipTo, bindFadeLinks } from './flip.js';
import { makeCharacter } from './characters.js';
import { ATK_STAGES } from './atk-scenarios.js';
import { doneList, isOpen, resetAtk, rankMap } from './atk-progress.js';
import { resetAllProgress, loadProgress, isDev } from './progress.js';
import { loadStages } from './stages.js';
import { bindAdminTrigger } from './admin.js';
import { loadDialogue } from './dialogue.js';
// 文章（content/dialogue.json）を、先に読み込む
try { await loadDialogue(); } catch (err) { console.error(err); }

const BADGE = { eve: ['badge-eve', 'Eve（情報を得る）'], mallory: ['badge-mallory', 'Mallory（書き換える）'] };
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const label = (st) => (st.id === 'a0' ? '入門' : st.id === 'a11' ? 'EP' : st.id.slice(1));

function card(st, i, done, extra = {}) {
  const open = isOpen(ATK_STAGES, i, done);
  const c = el(open ? 'a' : 'div', 'stage-card');
  if (open) c.href = `attack.html?stage=${st.id}`; else { c.classList.add('is-locked'); c.setAttribute('aria-disabled', 'true'); }
  const cleared = done.includes(st.id);
  if (cleared) c.classList.add('is-cleared');
  const head = el('div', 'stage-card-head');
  head.append(el('span', 'stage-number', label(st)));
  const rk = rankMap()[st.id];
  if (rk) head.append(el('span', `rating rating-${rk}`, rk));
  c.append(head, el('h3', 'stage-title', open ? st.title.replace(/^\d+　/, '') : '？？？'));
  if (open) {
    c.append(el('p', 'stage-goal', `学ぶ考え方：${st.theme}`));
    const badges = el('div', 'stage-badges');
    const rs = st.roles?.includes('both') ? ['eve', 'mallory'] : (st.roles ?? []);
    rs.forEach((r) => badges.append(el('span', `badge ${BADGE[r][0]}`, BADGE[r][1])));
    if (badges.childElementCount) c.append(badges);
  } else c.append(el('p', 'stage-lock-note', '前のステージをクリアすると遊べます'));
  if (extra.now) head.append(el('span', 'stage-now', extra.now));
  return c;
}

function render() {
  const done = doneList();
  const list = document.getElementById('stage-list');
  list.replaceChildren();
  ATK_STAGES.forEach((st, i) => {
    if (!isOpen(ATK_STAGES, i, done)) return; // 表面と同じ：解放前は、存在ごと隠す
    const li = el('li'); li.append(card(st, i, done)); list.append(li);
  });
  document.getElementById('progress').textContent = `クリア ${done.filter((d) => ATK_STAGES.some((s) => s.id === d)).length} / ${ATK_STAGES.length}`;
  // つづきから
  const cl = document.getElementById('continue-list'); cl.replaceChildren();
  const idx = ATK_STAGES.findIndex((s, i) => isOpen(ATK_STAGES, i, done) && !done.includes(s.id));
  const k = idx < 0 ? ATK_STAGES.length - 1 : idx;
  const li = el('li'); const c = card(ATK_STAGES[k], k, done, { now: done.length ? 'つづきから' : 'はじめる' });
  c.classList.add('is-continue'); li.append(c); cl.append(li);
}

function heroArt() {
  const art = document.getElementById('hero-art');
  const put = (kind, cls, w) => { const wrap = el('div', `art-char ${cls}`); wrap.append(makeCharacter(kind, { width: w, height: Math.round(w * 1.28), className: 'character' })); art.append(wrap); };
  art.classList.add('is-back');
  art.append(el('div', 'art-line'), el('div', 'art-packet'));
  put('eve', 'art-alice', 118); put('mallory', 'art-bob', 118); put('alice', 'art-eve', 82); put('bob', 'art-mallory', 82);
  art.append(el('div', 'art-hint', 'クリックで、表面（Alice・Bob）へ'));
  const flip = () => { art.classList.add('is-swapping'); flipTo('index.html', '#F3C63F'); };
  art.addEventListener('click', flip);
  art.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
}

// 攻撃者モードは、防御側の全ステージで S 評価を取ると開放される（開発者用 ?dev=1 では、全開放）
(async () => {
  if (isDev()) return;
  try {
    const stages = await loadStages(); const pr = loadProgress();
    let read = false; try { read = localStorage.getItem('crypta:epilogue:read') === '1'; } catch { /* なし */ }
    const open = read && stages.filter((st) => !st.tutorial && !st.epilogue).every((st) => pr[st.id]?.rating === 'S');
    if (!open) location.replace('index.html');
  } catch { /* 読み込めないときは、そのまま */ }
})();
bindFadeLinks();
heroArt();
render();
bindAdminTrigger(document.getElementById('footer-text')); // いちばん下の文を、7回クリックすると、管理者用ツールが開く（表面と同じ）
document.querySelectorAll('a[href="index.html"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); flipTo('index.html', '#F3C63F'); }));
document.getElementById('reset-back')?.addEventListener('click', () => {
  const back = el('div', 'atk-modal-back'); back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  const box = el('div', 'atk-modal');
  box.append(el('h2', null, 'どこまで、リセットしますか？'), el('p', 'atk-lead', '裏面だけを消すか、表面（Alice と Bob）も含めて全部を消すか、選んでください。'));
  const row = el('div', 'atk-modal-actions');
  const mk = (t, cls) => { const b = el('button', `button ${cls}`, t); b.type = 'button'; row.append(b); return b; };
  const cancel = mk('やめる', 'button-secondary');
  const only = mk('裏面だけ', 'button-primary');
  const all = mk('表面も含めて全部', 'btn-mal');
  cancel.onclick = () => back.remove();
  only.onclick = () => { back.remove(); resetAtk(); render(); window.scrollTo({ top: 0 }); };
  all.onclick = () => { resetAllProgress(); resetAtk(); back.remove(); flipTo('index.html', '#F3C63F'); };
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  box.append(row); back.append(box); document.body.append(back);
});
