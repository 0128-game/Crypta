// terms.js
// 文章の中の用語を、説明へのリンクにする（解放済みの用語だけ）

import { GLOSSARY, GLOSSARY_BY_ID, glossaryVersion } from './glossary.js';
import { isTermUnlocked } from './progress.js';

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 用語集（content/glossary.json）を読み込んだあとに、作り直す
let built = -1;
let ALIAS_MAP = new Map();
let ALIAS_RE = null;

function ensureAliases() {
  if (built === glossaryVersion()) return;
  built = glossaryVersion();
  const aliases = GLOSSARY.flatMap((t) => (t.aliases ?? []).map((a) => [a, t.id])).sort((a, b) => b[0].length - a[0].length);
  ALIAS_MAP = new Map(aliases);
  ALIAS_RE = aliases.length ? new RegExp(aliases.map(([a]) => escapeRe(a)).join('|'), 'g') : null;
}

export function termUnlocked(id) {
  const t = GLOSSARY_BY_ID.get(id);
  return t ? isTermUnlocked(t) : false;
}

// text の中の用語を、makeLink(表示する言葉, 用語の id) で作ったリンクに置き換える。
// 同じ用語は、1つの文章の中で、最初の1回だけ。まだ解放されていない用語は、ふつうの文字のまま。
export function linkifyText(text, { exclude, makeLink }) {
  ensureAliases();
  const frag = document.createDocumentFragment();
  if (!ALIAS_RE) {
    frag.append(text);
    return frag;
  }
  const used = new Set(exclude ? [exclude] : []);
  let last = 0;
  for (const m of text.matchAll(ALIAS_RE)) {
    const id = ALIAS_MAP.get(m[0]);
    if (!id || used.has(id) || !termUnlocked(id)) continue;
    used.add(id);
    if (m.index > last) frag.append(text.slice(last, m.index));
    frag.append(makeLink(m[0], id));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
