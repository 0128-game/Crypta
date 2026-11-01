// dialogue.js
// キャラクターのセリフ（Alice・Bob・Eve・Mallory が話すこと）は、content/dialogue.json にまとめてある。
// ここでは、それを読み込んで、{message} のような差し込み部分を、そのときの言葉に置き換える。
//   text('bob.received', { message: 'HELLO' })  → 文字列
//   line('attacker.capture.think')               → { icon, text, detail }

let DATA = {};

export async function loadDialogue(url = 'content/dialogue.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} を読み込めませんでした（${res.status}）`);
  DATA = await res.json();
}

const get = (path) => path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), DATA);

// {name} を、vars.name に置き換える。vars にない名前は、そのまま残す
const fill = (template, vars = {}) =>
  String(template).replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));

export function text(path, vars) {
  const value = get(path);
  if (typeof value !== 'string') {
    console.warn(`[dialogue] セリフが見つかりません: ${path}`);
    return '';
  }
  return fill(value, vars);
}

export function line(path, vars) {
  const value = get(path);
  if (!value || typeof value !== 'object') {
    console.warn(`[dialogue] セリフが見つかりません: ${path}`);
    return { icon: '', text: '', detail: '' };
  }
  return {
    icon: value.icon ?? '',
    text: fill(value.text ?? '', vars),
    detail: value.detail ? fill(value.detail, vars) : '',
  };
}
