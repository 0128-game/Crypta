// admin.js
// 管理者モード（管理者用のツールへの、入り口）
//   ・トップページの、いちばん下の文（「CRYPTA は暗号と情報セキュリティを学ぶための教材ゲームです。」）を、すばやく 7 回クリックすると、開く。
//   ・管理者モードが、オンのあいだは、セリフの編集・CSS のプレビュー・画像の道具などが、使える。
//   ・content/admin.json の passcode に、文字を入れると、入るときに、合言葉を聞く（うっかり防止。本当のアクセス制限では、ない）。

import { resetAllProgress } from './progress.js';

const ADMIN_KEY = 'crypta:admin';
const DEV_KEY = 'crypta:dev';
export const OVERRIDE_PREFIX = 'crypta:override:';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できなくても、続けられる */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 同上 */ } },
};

// 管理者モードの、オン・オフは、このタブの中だけ（sessionStorage）。タブを閉じるか、トップページを開き直すと、終わる
export const isAdmin = () => {
  try { return sessionStorage.getItem(ADMIN_KEY) === '1'; } catch { return false; }
};
export function setAdmin(on) {
  try {
    if (on) sessionStorage.setItem(ADMIN_KEY, '1');
    else sessionStorage.removeItem(ADMIN_KEY);
  } catch { /* 同上 */ }
}
export const endAdminSession = () => setAdmin(false);
export const overrideKeys = () => {
  try { return Object.keys(localStorage).filter((k) => k.startsWith(OVERRIDE_PREFIX)); } catch { return []; }
};

// 管理者用の道具の一覧（ここに足すと、管理者用の画面に、並ぶ）
export const TOOLS = [
  {
    group: '管理者センター',
    items: [
      { title: '管理者センター', desc: 'crypta.zip のダウンロード（変更前・変更後・両方）・ロゴ・ステージの開閉と進み具合・バックアップ・ファイルの点検など、すべての管理機能です。', href: 'admin.html' },
    ],
  },
  {
    group: '文章',
    items: [
      { title: '文章の編集', desc: 'セリフ・名前・ステージの文章（説明スライドの、追加・削除・並べ替え）・ブロックの説明を、画面で、書き換えます。変更は、自動で、この端末に、保存されます。', href: 'dialogue-editor.html' },
    ],
  },
  {
    group: '見た目',
    items: [
      { title: 'CSS のプレビュー', desc: 'ゲームの部品と、CSS を、並べて、書き換えながら、見ます。', href: 'css-preview.html' },
    ],
  },
  {
    group: 'キャラクターの画像',
    items: [
      { title: '画像のチェック', desc: '置いた画像が、読み込めているか、背景が透明かを、調べます。', href: 'characters-check.html' },
      { title: '画像の自動整形', desc: '画像の背景を透明にして、大きさをそろえ、zip にします。', href: 'characters-tool.html' },
    ],
  },
];

async function loadConfig() {
  try {
    const res = await fetch('content/admin.json', { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch { /* 設定がなくても、続けられる */ }
  return {};
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function closeAdminPanel() {
  document.querySelector('.admin-overlay')?.remove();
}

export function openAdminPanel() {
  closeAdminPanel();
  const overlay = el('div', 'admin-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '管理者用ツール');
  const card = el('div', 'admin-card');

  const head = el('div', 'admin-head');
  head.append(el('h2', null, '管理者用ツール'));
  const close = el('button', 'admin-close', '閉じる');
  close.type = 'button';
  close.addEventListener('click', closeAdminPanel);
  head.append(close);
  card.append(head, el('p', 'admin-state', '管理者モード: オン'));

  TOOLS.forEach((g) => {
    const sec = el('section', 'admin-group');
    sec.append(el('h3', null, g.group));
    g.items.forEach((t) => {
      const a = el('a', 'admin-tool');
      a.href = t.href;
      a.append(el('strong', null, t.title), el('span', null, t.desc));
      sec.append(a);
    });
    card.append(sec);
  });

  // ゲームの管理
  const mg = el('section', 'admin-group');
  mg.append(el('h3', null, 'ゲームの管理'));
  const row = (label, desc, onClick, on = false) => {
    const b = el('button', `admin-action${on ? ' is-on' : ''}`);
    b.type = 'button';
    b.append(el('strong', null, label), el('span', null, desc));
    b.addEventListener('click', () => onClick(b));
    mg.append(b);
    return b;
  };
  const devOn = () => store.get(DEV_KEY) === '1';
  row(
    `全ステージを解放: ${devOn() ? 'オン' : 'オフ'}`,
    '前のステージをクリアしなくても、すべてのステージを遊べます（確認用）。',
    (b) => {
      if (devOn()) store.del(DEV_KEY);
      else store.set(DEV_KEY, '1');
      b.firstChild.textContent = `全ステージを解放: ${devOn() ? 'オン' : 'オフ'}`;
      b.classList.toggle('is-on', devOn());
    },
    devOn()
  );
  row('進み具合を、すべて消す', 'クリアの記録・保存した回路・事件の既読を消します。', () => {
    if (!window.confirm('全ステージの、進み具合と、保存した回路を、消します。よいですか？')) return;
    resetAllProgress();
    location.reload();
  });
  const ov = overrideKeys();
  row(
    `試し用の設定を、消す（いま ${ov.length} 件）`,
    '「ゲームで試す」で、一時的に、使っているセリフ・名前を、元に戻します。',
    (b) => {
      overrideKeys().forEach((k) => store.del(k));
      b.firstChild.textContent = '試し用の設定を、消す（いま 0 件）';
    }
  );
  card.append(mg);

  const foot = el('div', 'admin-foot');
  const off = el('button', 'admin-off', '管理者モードを終わる');
  off.type = 'button';
  off.addEventListener('click', () => {
    setAdmin(false);
    closeAdminPanel();
    document.querySelector('.admin-chip')?.remove();
  });
  foot.append(off);
  card.append(foot);

  overlay.append(card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAdminPanel(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { closeAdminPanel(); document.removeEventListener('keydown', esc); }
  });
  document.body.append(overlay);
  card.querySelector('a, button')?.focus();
}

async function tryEnter() {
  if (!isAdmin()) {
    const cfg = await loadConfig();
    const code = String(cfg.passcode ?? '');
    if (code) {
      const input = window.prompt('合言葉を、入れてください');
      if (input !== code) {
        if (input !== null) window.alert('合言葉が、ちがいます。');
        return;
      }
    }
    setAdmin(true);
    addChip();
  }
  openAdminPanel();
}

function addChip() {
  if (document.querySelector('.admin-chip')) return;
  const footer = document.querySelector('.site-footer');
  if (!footer) return;
  const chip = el('button', 'admin-chip', '管理者モード');
  chip.type = 'button';
  chip.addEventListener('click', openAdminPanel);
  footer.append(chip);
}

// 入り口: 指定した要素（トップページの、いちばん下の文）を、すばやく 7 回クリック
export function bindAdminTrigger(target) {
  if (!target) return;
  let count = 0;
  let timer;
  target.addEventListener('click', () => {
    count += 1;
    clearTimeout(timer);
    timer = setTimeout(() => { count = 0; }, 4000);
    if (count >= 7) {
      count = 0;
      tryEnter();
    }
  });
  if (isAdmin()) addChip();
}

// 管理者用のページ（ツール）の、入り口。管理者モードでなければ、中身を出さない
export function requireAdmin() {
  if (isAdmin()) return true;
  document.body.replaceChildren();
  document.body.className = '';
  const main = el('main', 'admin-locked');
  main.append(el('h1', null, '管理者用のページです'), el('p', null, '管理者モードに入ってから、開いてください。'));
  const a = el('a', 'button button-secondary', 'トップページへ');
  a.href = 'index.html';
  main.append(a);
  document.body.append(main);
  return false;
}
