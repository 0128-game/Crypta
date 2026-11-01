// texts.js
// 画面に出る、すべての文章を、content/ui-texts.json の「元の文 → 新しい文」で、書き換えられるようにする。
//   ・ゲームの判定メッセージ、ボタン、見出し、トップページ、用語集・チェックページなど、コードの中に書かれている文章も、対象。
//   ・画面に出た、文字（と、title・aria-label・placeholder・alt の属性）を、見て、元の文が含まれていれば、置き換える。
//   ・ゲームの動き（判定）には、影響しない（画面に出す、文字だけを、変える）。
// 各ページの、最初に、import './texts.js' を、書く。

const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);

const exact = new Map(); // 短い文（3文字以下）: 文全体が、一致したときだけ、置き換える（ほかの文の一部には、ならないように）
const frag = new Map(); // 長い文: 文の一部としても、置き換える
let fragRe = null;

try {
  const res = await fetch('content/ui-texts.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  Object.entries(data).forEach(([group, map]) => {
    if (group.startsWith('_') || typeof map !== 'object' || map === null) return;
    Object.entries(map).forEach(([from, to]) => {
      if (typeof to !== 'string') return;
      const key = from.replace(/\s+/g, ' ').trim();
      if (!key || key === to) return;
      // 「・文の一部」のグループは、短くても、文の途中でも、置き換える。そのほかの、短い文は、全体が、一致したときだけ
      (key.length < 4 && !group.endsWith('・文の一部）') ? exact : frag).set(key, to);
    });
  });
  // 1回の置き換えで、すべてを、まとめて行う（置き換えた文の中を、もう一度、置き換えないように）。
  //   ・長い文・文の一部: 文の途中でも、置き換える（長い文から先に）
  //   ・短い文: 前後が、漢字・カタカナでないとき（「Eve（盗聴）」「暗号化のデータ」のようなとき）だけ、置き換える
  const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const JP = '\u30a0-\u30ff\u4e00-\u9fff'; // 漢字・カタカナ（これに、続くときは、別の言葉の一部と、みなす）
  const parts = [];
  if (frag.size) parts.push([...frag.keys()].sort((a, b) => b.length - a.length).map(esc).join('|'));
  if (exact.size) parts.push(`(?<![${JP}])(?:${[...exact.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![${JP}])`);
  if (parts.length) fragRe = new RegExp(parts.join('|'), 'g');
} catch (err) {
  console.warn('[texts] content/ui-texts.json を読み込めませんでした。文章は、そのまま使います:', err);
}
const active = exact.size > 0 || frag.size > 0;

function convert(str) {
  const n = str.replace(/\s+/g, ' ');
  const t = n.trim();
  if (exact.has(t)) return n.replace(t, exact.get(t));
  if (!fragRe) return str;
  const out = n.replace(fragRe, (m) => frag.get(m) ?? exact.get(m) ?? m);
  return out === n ? str : out; // 置き換えがなければ、元の文字（改行や空白も、そのまま）
}

const seenText = new WeakMap();
const seenAttr = new WeakMap();

function fixTextNode(node) {
  if (!node.parentNode || SKIP.has(node.parentNode.nodeName)) return;
  const cur = node.data;
  if (seenText.get(node) === cur) return;
  const out = convert(cur);
  seenText.set(node, out);
  if (out !== cur) node.data = out;
}

function fixAttr(el, name) {
  const cur = el.getAttribute(name);
  if (cur === null) return;
  const key = `${name}`;
  const rec = seenAttr.get(el) ?? {};
  if (rec[key] === cur) return;
  const out = convert(cur);
  rec[key] = out;
  seenAttr.set(el, rec);
  if (out !== cur) el.setAttribute(name, out);
}

function fixTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return fixTextNode(root);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    fixTextNode(n);
    n = walker.nextNode();
  }
  const els = root.nodeType === Node.ELEMENT_NODE ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
  els.forEach((e) => ATTRS.forEach((a) => fixAttr(e, a)));
}

if (active) {
  const run = () => {
    fixTree(document);
    document.title = convert(document.title);
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach((n) => fixTree(n));
        else if (r.type === 'characterData') fixTextNode(r.target);
        else if (r.type === 'attributes') fixAttr(r.target, r.attributeName);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}
