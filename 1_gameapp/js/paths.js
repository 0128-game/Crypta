// paths.js
// データ（文章・ステージ）は、すべて 2_content-stages/crypta.json の、1つのファイルにまとめてある。
//   ゲームの中では、これまでどおり 'content/dialogue.json'・'content/stages/stage01.json'・'stages/stage01.json' のような名前で読む。
//   その名前を、crypta.json の中の「まとまり」に読み替えるのが、ここ。
//     content/<名前>.json        → crypta.json の <名前>（dialogue・ui-texts・glossary など）
//     content/stages/<id>.json   → crypta.json の stageTexts.<id>（ステージの文章）
//     stages/<id>.json           → crypta.json の stages.<id>（ステージの設定）
export const DATA_ROOT = '../2_content-stages/';
export const DATA_FILE = `${DATA_ROOT}crypta.json`;
export const DATA_FILE_REPO = '2_content-stages/crypta.json'; // リポジトリの中での場所（zip・点検用）
export const dataUrl = (p) => (/^(content|stages)\//.test(String(p)) ? DATA_ROOT + p : p);

// 'content/dialogue.json' などを、crypta.json の中の場所に読み替える（データでなければ null）
export function dataKey(p) {
  const s = String(p);
  let m = /^content\/stages\/([^/]+)\.json$/.exec(s); if (m) return ['stageTexts', decodeURIComponent(m[1])];
  m = /^stages\/([^/]+)\.json$/.exec(s); if (m) return ['stages', decodeURIComponent(m[1])];
  m = /^content\/([^/]+)\.json$/.exec(s); if (m) return [m[1]];
  return null;
}
let bundle = null;
export function loadBundle(force = false) {
  if (!bundle || force) {
    bundle = fetch(DATA_FILE, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`crypta.json を読み込めませんでした（HTTP ${r.status}）`);
      return r.json();
    });
    bundle.catch(() => { bundle = null; });
  }
  return bundle;
}
export const getIn = (obj, keys) => keys.reduce((o, k) => (o == null ? undefined : o[k]), obj);
export function setIn(obj, keys, v) { const last = keys[keys.length - 1]; keys.slice(0, -1).reduce((o, k) => (o[k] ??= {}), obj)[last] = v; }
// fetch の代わり：データの名前なら、crypta.json の中から返す（Response の形で）。それ以外は、ふつうの fetch
export async function fetchData(p, opts = {}) {
  const key = dataKey(p);
  if (!key) return fetch(dataUrl(p), opts);
  try {
    const value = getIn(await loadBundle(), key);
    if (value === undefined) return new Response('', { status: 404 });
    return new Response(opts.method === 'HEAD' ? null : JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response('', { status: 404 });
  }
}
