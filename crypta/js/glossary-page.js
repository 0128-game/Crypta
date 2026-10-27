// glossary-page.js
// glossary.html（用語集のページ）。ゲームとは別のタブで開く。
//   ・左に一覧、右に説明
//   ・まだ解放されていない用語は、ロック表示（名前も伏せる）
//   ・glossary.html#aes のように、用語の id を付けると、その説明が開く

import { GLOSSARY, GLOSSARY_CATEGORIES, GLOSSARY_BY_ID } from './glossary.js';
import { isTermUnlocked, accessibleIndex, isDev } from './progress.js';
import { linkifyText } from './terms.js';

const $ = (selector) => document.querySelector(selector);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const unlocked = (t) => isTermUnlocked(t);

// 解放されるのは「ステージ N に着いたとき」＝ 1つ前のステージをクリアしたとき
function unlockHint(t) {
  const n = t.stage ?? 0;
  return n <= 0 ? '' : `ステージ ${n} で解放`;
}

function buildNav() {
  const list = $('#glossary-nav-list');
  list.replaceChildren();
  GLOSSARY_CATEGORIES.forEach((cat) => {
    const items = GLOSSARY.filter((t) => t.cat === cat);
    if (items.length === 0) return;
    const group = el('section', 'nav-group');
    group.append(el('h2', null, cat));
    const ul = el('ul', 'nav-items');
    items.forEach((t) => {
      const li = el('li');
      li.dataset.id = t.id;
      if (unlocked(t)) {
        li.dataset.search = `${t.term} ${t.short} ${(t.aliases ?? []).join(' ')}`.toLowerCase();
        const a = el('a', 'nav-item', t.term);
        a.href = `#${t.id}`;
        li.append(a);
      } else {
        li.dataset.search = '';
        const span = el('span', 'nav-item is-locked');
        span.append(el('span', null, '🔒 ？？？'), el('span', 'nav-lock', unlockHint(t)));
        li.append(span);
      }
      ul.append(li);
    });
    group.append(ul);
    list.append(group);
  });
}

function filterNav(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll('.nav-group').forEach((group) => {
    let any = false;
    group.querySelectorAll('li').forEach((li) => {
      const hit = !q || (li.dataset.search && li.dataset.search.includes(q));
      li.hidden = !hit;
      if (hit) any = true;
    });
    group.hidden = !any;
  });
}

function link(label, id) {
  const a = el('a', 'term-link', label);
  a.href = `#${id}`;
  return a;
}

function renderDetail(id) {
  const box = $('#glossary-detail');
  const t = GLOSSARY_BY_ID.get(id);
  box.replaceChildren();

  document.querySelectorAll('.nav-item').forEach((a) => {
    a.classList.toggle('is-current', a.getAttribute('href') === `#${id}`);
  });

  if (!t) {
    box.append(el('p', 'glossary-empty', '左の一覧から、読みたい用語を選んでください。'));
    return;
  }

  if (!unlocked(t)) {
    box.append(el('p', 'detail-cat', t.cat), el('h2', 'detail-title', '？？？'));
    box.append(el('p', 'detail-locked', `この用語は、ステージ ${t.stage} に進むと読めるようになります。ステージを1つずつクリアして、解放していきましょう。`));
    return;
  }

  document.title = `CRYPTA | ${t.term}`;
  box.append(el('p', 'detail-cat', t.cat), el('h2', 'detail-title', t.term));
  const lead = el('p', 'detail-lead');
  lead.append(linkifyText(t.short, { exclude: t.id, makeLink: link }));
  box.append(lead);

  t.sections.forEach((sec) => {
    const s = el('section', 'detail-section');
    s.append(el('h3', null, sec.h));
    if (sec.p) {
      const p = el('p');
      p.append(linkifyText(sec.p, { exclude: t.id, makeLink: link }));
      s.append(p);
    }
    if (sec.code) s.append(el('pre', 'detail-code', sec.code));
    box.append(s);
  });

  const see = (t.see ?? []).map((x) => GLOSSARY_BY_ID.get(x)).filter((x) => x && unlocked(x));
  if (see.length) {
    const s = el('section', 'detail-see');
    s.append(el('h3', null, 'あわせて読む'));
    const chips = el('div', 'see-chips');
    see.forEach((x) => {
      const a = el('a', 'see-chip', x.term);
      a.href = `#${x.id}`;
      chips.append(a);
    });
    s.append(chips);
    box.append(s);
  }
}

function showFromHash() {
  const id = decodeURIComponent(location.hash.replace(/^#/, ''));
  renderDetail(id);
  const box = $('#glossary-detail');
  if (id) {
    box.scrollTop = 0;
    if (window.matchMedia('(max-width: 800px)').matches) box.scrollIntoView({ block: 'start' });
  }
}

buildNav();
$('#glossary-search').addEventListener('input', (e) => filterNav(e.target.value));
window.addEventListener('hashchange', showFromHash);
showFromHash();

if (isDev()) {
  const note = el('p', 'glossary-lead', '開発用の表示: すべての用語が解放されています（?dev=0 で解除）。');
  document.querySelector('.glossary-main').insertBefore(note, document.querySelector('.glossary-layout'));
}
void accessibleIndex; // 解放の判定は progress.js が行う
