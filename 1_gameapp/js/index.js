// index.js
// メインページ: ステージ一覧のカード生成、進捗表示、「はじめる」ボタンの行き先更新
//   ・ステージは、前のステージをクリアすると遊べる（開発中は ?dev=1 で、すべて解放）
//   ・最初のステージは、チュートリアル（test）

import './texts.js';
import { makeCharacter } from './characters.js';
import { bindAdminTrigger, endAdminSession } from './admin.js'; // いちばん下の文を、7回クリックすると、管理者用ツールが、開く // 画面の文章を、content/ui-texts.json で、書き換えられるようにする
import { loadStages } from './stages.js';
import { loadProgress, isStageCleared, isStageUnlocked, resetAllProgress, isDev } from './progress.js';

const ATTACKERS = {
  eve: { label: 'Eve', role: '盗聴', className: 'badge-eve' },
  mallory: { label: 'Mallory', role: '改ざん', className: 'badge-mallory' },
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// attacker.type は "eve" / "mallory" / "eve+mallory" のどれでも受け付ける
function attackerKeys(stage) {
  const type = String(stage.attacker?.type ?? '').toLowerCase();
  return type.split(/[+,&\s]+/).filter((key) => key in ATTACKERS);
}

// "stage03" → "3" / チュートリアル → "入門"
function stageLabel(stage) {
  const m = /^stage0*(\d+)$/.exec(stage.id);
  return m ? m[1] : '入門';
}

function simulatorUrl(stageId) {
  return `simulator.html?stage=${encodeURIComponent(stageId)}`;
}

function createCard(stage, state) {
  const { locked, cleared, rating } = state;

  // ロック中はリンクにしない
  const card = locked ? el('div', 'stage-card') : el('a', 'stage-card');
  if (!locked) card.href = simulatorUrl(stage.id);
  if (locked) {
    card.classList.add('is-locked');
    card.setAttribute('aria-disabled', 'true');
  }
  if (cleared) card.classList.add('is-cleared');

  const head = el('div', 'stage-card-head');
  head.append(el('span', 'stage-number', stageLabel(stage)));
  if (cleared && rating && !stage.tutorial) {
    const chip = el('span', `rating rating-${rating}`, rating);
    chip.setAttribute('aria-label', `評価 ${rating}`);
    head.append(chip);
  } else if (cleared) {
    head.append(el('span', 'stage-clear', 'クリア'));
  }
  card.append(head);

  card.append(el('h3', 'stage-title', locked ? '？？？' : stage.title ?? stage.id));
  if (!locked && stage.goal) card.append(el('p', 'stage-goal', stage.goal));

  if (!locked) {
    const badges = el('div', 'stage-badges');
    attackerKeys(stage).forEach((key) => {
      const a = ATTACKERS[key];
      badges.append(el('span', `badge ${a.className}`, `${a.label}（${a.role}）`));
    });
    if (stage.epilogue && cleared) badges.append(el('span', 'badge badge-ai', 'AI')); // 見終わったあとで、AI が、増える
    if (badges.childElementCount > 0) card.append(badges);
  } else {
    card.append(el('p', 'stage-lock-note', '前のステージをクリアすると遊べます'));
  }
  return card;
}

function showStatus(message, isError = false) {
  const status = document.getElementById('stage-status');
  if (!status) return;
  status.textContent = message;
  status.hidden = false;
  status.classList.toggle('is-error', isError);
}

function renderStageList(stages, progress) {
  const list = document.getElementById('stage-list');
  if (!list) return;
  list.replaceChildren();
  let lastGroup = null;
  stages.forEach((stage) => {
    // 解放前のステージは、存在ごと隠す（見出しも。その見出しの、ステージが、1つも、見えないとき）
    if (!isStageUnlocked(stage.id, progress)) return;
    // 学習内容の、まとまりの見出し（content/stages/*.json の group）
    if (stage.group && stage.group !== lastGroup) {
      const head = el('li', 'stage-group');
      head.append(el('h3', null, stage.group));
      list.append(head);
      lastGroup = stage.group;
    }
    const li = el('li');
    const card = createCard(stage, {
      locked: !isStageUnlocked(stage.id, progress),
      cleared: isStageCleared(stage.id, progress),
      rating: progress[stage.id]?.rating,
      exCleared: (progress[stage.id]?.objectives ?? []).includes('EX'),
    });
    li.append(card);
    list.append(li);
  });
}

// 「クリア 3 / 12」表示（チュートリアルは数えない）
function renderProgress(stages, progress) {
  const target = document.getElementById('progress');
  if (!target) return;
  const real = stages.filter((s) => !s.tutorial);
  const done = real.filter((s) => isStageCleared(s.id, progress)).length;
  target.textContent = real.length ? `クリア ${done} / ${real.length}` : '';
}

// 「つづきから」: ヒーローの下に、横長の行を1つ（遊べる、いちばん先のステージ）
function renderContinue(stages, progress) {
  const list = document.getElementById('continue-list');
  if (!list || stages.length === 0) return;
  list.replaceChildren();
  const playable = stages.filter((s) => isStageUnlocked(s.id, progress));
  const next = playable.find((s) => !isStageCleared(s.id, progress)) ?? playable[playable.length - 1];
  if (!next) return;
  const anyCleared = stages.some((s) => isStageCleared(s.id, progress));
  const card = createCard(next, {
    locked: false,
    cleared: isStageCleared(next.id, progress),
    rating: progress[next.id]?.rating,
    exCleared: (progress[next.id]?.objectives ?? []).includes('EX'),
  });
  card.classList.add('is-continue');
  card.querySelector('.stage-card-head')?.append(el('span', 'stage-now', anyCleared ? 'つづきから' : 'はじめる'));
  const li = el('li');
  li.append(card);
  list.append(li);
}

// ヒーローの図: アリス（○）からボブ（□）へ、メッセージが、とどく。途中に、イブ（△）とマロリー（◇）
function renderHeroArt() {
  const art = document.getElementById('hero-art');
  if (!art) return;
  const put = (kind, cls, w) => {
    const wrap = el('div', `art-char ${cls}`);
    wrap.append(makeCharacter(kind, { width: w, height: Math.round(w * 1.28), className: 'character' }));
    art.append(wrap);
  };
  art.append(el('div', 'art-line'), el('div', 'art-packet'));
  put('alice', 'art-alice', 118);
  put('bob', 'art-bob', 118);
  put('eve', 'art-eve', 82);
  put('mallory', 'art-mallory', 82);
}

// エピローグをクリアしたら、ヒーローの絵が、クリックできるようになる（→ 攻撃者の視点）
const attackerOpen = () => true; // 表面と裏面は、同等。いつでも、切り替えられる

function openAttackerNotice() {
  const back = el('div', 'atk-modal-back');
  back.setAttribute('role', 'dialog');
  back.setAttribute('aria-modal', 'true');
  back.setAttribute('aria-labelledby', 'atk-modal-title');
  const box = el('div', 'atk-modal');
  box.append(el('span', 'atk-tag', 'SIMULATION'));
  const h = el('h2', null, 'これから、裏面（Eve と Mallory の視点）に切り替えます');
  h.id = 'atk-modal-title';
  box.append(h);
  const ul = el('ul');
  [
    'これは、教材用のシミュレーションです。画面の中だけで動き、実在の通信・サービス・他人の端末には、いっさい接続しません。',
    'ゲーム内の手順は、仕組みを理解するために簡略化したものです。現実の攻撃手順そのものではありません。',
    '他人の通信やシステムを、許可なく盗み見たり、書き換えたり、不正にアクセスしたりすることは、不正アクセス禁止法などで処罰される犯罪です。',
    '目的は、攻撃者が何を狙うのかを知って、守る側として備えることです。',
  ].forEach((t) => ul.append(el('li', null, t)));
  box.append(ul);
  const label = el('label', 'atk-check');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  label.append(cb, '上の内容を理解したうえで、シミュレーションとして体験します');
  box.append(label);
  const row = el('div', 'atk-modal-actions');
  const cancel = el('button', 'button button-secondary', 'やめる');
  cancel.type = 'button';
  const ok = el('button', 'button button-primary', '裏面へ');
  ok.type = 'button';
  ok.disabled = true;
  cb.onchange = () => { ok.disabled = !cb.checked; };
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  cancel.onclick = close;
  ok.onclick = () => {
    close();
    const art = document.getElementById('hero-art');
    if (art) art.classList.add('is-swapping'); // Alice と Bob が退いて、Eve と Mallory が、前に出る
    setTimeout(() => { location.href = 'attacker.html'; }, 800);
  };
  document.addEventListener('keydown', onKey);
  row.append(cancel, ok);
  box.append(row);
  back.append(box);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  cb.focus();
}

function setupAttackerEntry(progress) {
  const open = attackerOpen(progress);
  const art = document.getElementById('hero-art');
  const entry = document.getElementById('attacker-entry');
  if (entry) entry.hidden = !open;
  if (!art) return;
  const prev = art.querySelector('.art-hint');
  if (prev) prev.remove();
  art.classList.toggle('is-live', open);
  if (open) {
    art.removeAttribute('aria-hidden');
    art.setAttribute('role', 'button');
    art.tabIndex = 0;
    art.setAttribute('aria-label', '裏面（Eve・Mallory）に切り替える');
    art.append(el('div', 'art-hint', 'クリックで、裏面（Eve・Mallory）へ'));
    if (!art.dataset.bound) {
      art.dataset.bound = '1';
      art.addEventListener('click', openAttackerNotice);
      art.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAttackerNotice(); } });
      document.getElementById('attacker-entry-btn')?.addEventListener('click', openAttackerNotice);
    }
  } else {
    art.setAttribute('aria-hidden', 'true');
    art.removeAttribute('role');
    art.removeAttribute('tabindex');
  }
}

async function init() {
  const progress = loadProgress();

  let stages = [];
  try {
    stages = await loadStages();
  } catch (err) {
    console.error(err);
  }

  if (stages.length === 0) {
    const onFile = location.protocol === 'file:';
    showStatus(
      onFile
        ? 'ファイルを直接開いているため、ステージを読み込めません。ローカルサーバー経由で開いてください（例: python -m http.server）。'
        : 'ステージを読み込めませんでした。stages フォルダと JSON を確認してください。',
      true
    );
    return;
  }

  const status = document.getElementById('stage-status');
  if (status) status.hidden = true;
  renderStageList(stages, progress);
  renderProgress(stages, progress);
  renderContinue(stages, progress);
  setupAttackerEntry(progress);

  // いちばん上の「全ステージをリセット」
  const reset = document.getElementById('reset-all');
  if (reset) {
    reset.addEventListener('click', () => {
      if (!window.confirm('全ステージの、進み具合と、保存した回路を、消します。よいですか？')) return;
      resetAllProgress();
      const fresh = loadProgress();
      renderStageList(stages, fresh);
      renderProgress(stages, fresh);
      renderContinue(stages, fresh);
      setupAttackerEntry(fresh);
      window.scrollTo({ top: 0 });
    });
  }
}

renderHeroArt();
init();
endAdminSession(); // トップページを、開き直す（再読み込み・戻る）と、管理者モードは、終わる
bindAdminTrigger(document.getElementById('footer-text'));
