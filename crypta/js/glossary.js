// glossary.js
// 用語集のデータの読み込み。中身は content/glossary.json にある（そこを書き換えると、用語集が変わる）。
//   GLOSSARY            : 用語の一覧
//   GLOSSARY_BY_ID      : id → 用語
//   GLOSSARY_CATEGORIES : 分類の並び順
// ここにある3つは、loadGlossary() で、中身が入る（読み込む前は、空）。

export const GLOSSARY_CATEGORIES = [];
export const GLOSSARY = [];
export const GLOSSARY_BY_ID = new Map();

let version = 0;
export const glossaryVersion = () => version;

export async function loadGlossary(url = 'content/glossary.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} を読み込めませんでした（${res.status}）`);
  const data = await res.json();
  GLOSSARY_CATEGORIES.splice(0, GLOSSARY_CATEGORIES.length, ...(data.categories ?? []));
  GLOSSARY.splice(0, GLOSSARY.length, ...(data.terms ?? []));
  GLOSSARY_BY_ID.clear();
  GLOSSARY.forEach((t) => GLOSSARY_BY_ID.set(t.id, t));
  version += 1;
}
