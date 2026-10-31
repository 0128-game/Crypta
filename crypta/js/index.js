// index.js
// メインページ: ステージ一覧のカード生成、進捗表示、「はじめる」ボタンの行き先更新
//   ・ステージは、前のステージをクリアすると遊べる（開発中は ?dev=1 で、すべて解放）
//   ・最初のステージは、チュートリアル（test）

import './texts.js'; // 画面の文章を、content/ui-texts.json で、書き換えられるようにする
import { loadStages } from './stages.js';
import { loadProgress, isStageCleared, isStageUnlocked } from './progress.js';

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
    // 学習内容の、まとまりの見出し（content/stages/*.json の group）
    if (stage.group && stage.group !== lastGroup) {
      const head = el('li', 'stage-group');
      head.append(el('h3', null, stage.group));
      list.append(head);
      lastGroup = stage.group;
    }
    const li = el('li');
    li.append(
      createCard(stage, {
        locked: !isStageUnlocked(stage.id, progress),
        cleared: isStageCleared(stage.id, progress),
        rating: progress[stage.id]?.rating,
        exCleared: (progress[stage.id]?.objectives ?? []).includes('EX'),
      })
    );
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

// 「はじめる」ボタン: 遊べる、いちばん先のステージへ
function updateStartButton(stages, progress) {
  const button = document.getElementById('start-button');
  if (!button || stages.length === 0) return;

  const playable = stages.filter((s) => isStageUnlocked(s.id, progress));
  const next = playable.find((s) => !isStageCleared(s.id, progress)) ?? playable[playable.length - 1];
  const anyCleared = stages.some((s) => isStageCleared(s.id, progress));
  button.href = simulatorUrl(next.id);
  button.textContent = anyCleared ? 'つづきから' : 'はじめる';
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
  updateStartButton(stages, progress);
}

init();
