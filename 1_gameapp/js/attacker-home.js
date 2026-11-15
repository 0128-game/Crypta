// attacker-home.js  裏面のホーム画面（表面の index.html と同じ構成）
import { makeCharacter } from './characters.js';
import { ATK_STAGES } from './atk-scenarios.js';
import { doneList, isOpen, resetAtk } from './atk-progress.js';

const BADGE = { eve: ['badge-eve', 'Eve（情報を得る）'], mallory: ['badge-mallory', 'Mallory（書き換える）'] };
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const label = (st) => (st.id === 'a0' ? '入門' : st.id === 'a10' ? 'EP' : st.id.slice(1));

function card(st, i, done, extra = {}) {
  const open = isOpen(ATK_STAGES, i, done);
  const c = el(open ? 'a' : 'div', 'stage-card');
  if (open) c.href = `attack.html?stage=${st.id}`; else { c.classList.add('is-locked'); c.setAttribute('aria-disabled', 'true'); }
  const cleared = done.includes(st.id);
  if (cleared) c.classList.add('is-cleared');
  const head = el('div', 'stage-card-head');
  head.append(el('span', 'stage-number', label(st)));
  if (cleared) head.append(el('span', 'stage-clear', 'クリア'));
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
  const lab = el('li'); const a = el('a', 'stage-card'); a.href = 'lab.html';
  const hd = el('div', 'stage-card-head'); hd.append(el('span', 'stage-number', '実験'));
  a.append(hd, el('h3', 'stage-title', '実験室（自由に試す）'), el('p', 'stage-goal', 'Alice と Bob の会話文を書き換えて、本物の暗号（AES-GCM）で、攻撃者に解読させる'));
  lab.append(a); list.append(lab);
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
  art.append(el('div', 'art-line'), el('div', 'art-packet'));
  put('eve', 'art-alice', 118); put('mallory', 'art-bob', 118); put('alice', 'art-eve', 82); put('bob', 'art-mallory', 82);
  art.append(el('div', 'art-hint', 'クリックで、表面（Alice・Bob）へ'));
  const flip = () => { art.classList.add('is-swapping'); setTimeout(() => { location.href = 'index.html'; }, 700); };
  art.addEventListener('click', flip);
  art.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
}

heroArt();
render();
document.getElementById('reset-back')?.addEventListener('click', () => {
  if (!window.confirm('裏面の進み具合を、消します。よいですか？')) return;
  resetAtk(); render(); window.scrollTo({ top: 0 });
});
