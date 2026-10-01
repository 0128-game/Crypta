// index.js
// メインページ: ステージ一覧のカード生成、進捗表示、「はじめる」ボタンの行き先更新

import { loadStages } from './stages.js';

// ---------- 設定 ----------
const PROGRESS_KEY = 'crypta:progress';

// true にすると「前のステージをクリアするまで次は遊べない」になる。
// 開発中は false のままにしておく。
const LOCK_ENABLED = false;

const ATTACKERS = {
  eve: { label: 'Eve', role: '盗聴', className: 'badge-eve' },
  mallory: { label: 'Mallory', role: '改ざん', className: 'badge-mallory' },
};

// ---------- 進捗（localStorage） ----------
// 形式: { "stage01": { "rating": "A" }, ... }
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

// ---------- ユーティリティ ----------
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

// "stage03" → "3" / それ以外（test など）→ "T"
function stageLabel(stage) {
  const m = /^stage0*(\d+)$/.exec(stage.id);
  return m ? m[1] : 'T';
}

function simulatorUrl(stageId) {
  return `simulator.html?stage=${encodeURIComponent(stageId)}`;
}

// ---------- カード生成 ----------
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

  // 上段: ステージ番号 + 評価
  const head = el('div', 'stage-card-head');
  head.append(el('span', 'stage-number', stageLabel(stage)));
  if (cleared && rating) {
    const chip = el('span', `rating rating-${rating}`, rating);
    chip.setAttribute('aria-label', `評価 ${rating}`);
    head.append(chip);
  }
  card.append(head);

  // タイトルと目標
  card.append(el('h3', 'stage-title', stage.title ?? stage.id));
  if (stage.goal) card.append(el('p', 'stage-goal', stage.goal));

  // 攻撃者バッジ
  const badges = el('div', 'stage-badges');
  attackerKeys(stage).forEach((key) => {
    const a = ATTACKERS[key];
    badges.append(el('span', `badge ${a.className}`, `${a.label}（${a.role}）`));
  });
  if (badges.childElementCount > 0) card.append(badges);

  if (locked) {
    card.append(el('p', 'stage-lock-note', '前のステージをクリアすると遊べます'));
  }

  return card;
}

// ---------- 画面の更新 ----------
function showStatus(message, isError = false) {
  const status = document.getElementById('stage-status');
  if (!status) return;
  status.textContent = message;
  status.hidden = false;
  status.classList.toggle('is-error', isError);
}

function hideStatus() {
  const status = document.getElementById('stage-status');
  if (status) status.hidden = true;
}

function renderStageList(stages, progress) {
  const list = document.getElementById('stage-list');
  if (!list) return;
  list.replaceChildren();

  let previousCleared = true; // 最初のステージは常に解放

  stages.forEach((stage) => {
    const record = progress[stage.id];
    const cleared = Boolean(record);
    const isTest = stage.id === 'test';
    const locked = LOCK_ENABLED && !isTest && !previousCleared;

    const li = el('li');
    li.append(createCard(stage, { locked, cleared, rating: record?.rating }));
    list.append(li);

    if (!isTest) previousCleared = cleared;
  });
}

// 「クリア 3 / 12」表示（test は数えない）
function renderProgress(stages, progress) {
  const target = document.getElementById('progress');
  if (!target) return;
  const real = stages.filter((s) => s.id !== 'test');
  if (real.length === 0) {
    target.textContent = '';
    return;
  }
  const done = real.filter((s) => progress[s.id]).length;
  target.textContent = `クリア ${done} / ${real.length}`;
}

// 「はじめる」ボタンの行き先と文言
function updateStartButton(stages, progress) {
  const button = document.getElementById('start-button');
  if (!button || stages.length === 0) return;

  const real = stages.filter((s) => s.id !== 'test');
  if (real.length === 0) {
    button.href = simulatorUrl(stages[0].id); // test しかない間は test へ
    return;
  }

  const anyCleared = real.some((s) => progress[s.id]);
  const next = real.find((s) => !progress[s.id]) ?? real[0];
  button.href = simulatorUrl(next.id);
  button.textContent = anyCleared ? 'つづきから' : 'はじめる';
}

// ---------- 起動 ----------
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

  hideStatus();
  renderStageList(stages, progress);
  renderProgress(stages, progress);
  updateStartButton(stages, progress);
}

init();
