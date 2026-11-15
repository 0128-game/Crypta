// paths.js
// データ（文章・ステージ）は、別のフォルダ（2_content-stages）にある。
// 'content/…' と 'stages/…' で始まる場所は、そこへ読み替える。assets/ など、ほかはそのまま。
export const DATA_ROOT = '../2_content-stages/';
export const dataUrl = (p) => (/^(content|stages)\//.test(String(p)) ? DATA_ROOT + p : p);
