// progress.js
// 進捗（どのステージ・どの目標をクリアしたか）と、ステージ・用語の「解放」
//
// ・ステージは、前のステージをクリアすると遊べる
// ・用語は、そのステージに着くと読めるようになる（glossary.js の stage）
// ・開発中の確認用に、URL の末尾に ?dev=1 を付けると、すべて解放される（?dev=0 で解除）

import * as stagesModule from './stages.js';

const STAGE_IDS = stagesModule.STAGE_IDS ?? [];
const PROGRESS_KEY = 'crypta:progress';
const DEV_KEY = 'crypta:dev';
const RATING_ORDER = { C: 0, B: 1, A: 2, S: 3 };

export function isDev() {
  try {
    const q = new URLSearchParams(location.search).get('dev');
    if (q === '1') localStorage.setItem(DEV_KEY, '1');
    if (q === '0') localStorage.removeItem(DEV_KEY);
    return localStorage.getItem(DEV_KEY) === '1';
  } catch {
    return false;
  }
}

// 形: { "stage01": { rating: "A", objectives: ["A", "B"], done: true }, ... }
export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== 'object') return {};
    // 以前の版で保存された S+ は、S として扱う
    Object.values(data).forEach((r) => { if (r && r.rating === 'S+') r.rating = 'S'; });
    return data;
  } catch {
    return {};
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[progress] 進捗を保存できませんでした', err);
  }
}

export function stageIndex(id) {
  return STAGE_IDS.indexOf(id);
}

// ステージをクリアしたか（目標 A を達成すれば、クリア）
export function isStageCleared(id, progress = loadProgress()) {
  const r = progress[id];
  if (!r) return false;
  return r.done !== false; // 古い形式（rating だけ）の記録も、クリア済みとして扱う
}

export function clearedObjectives(id, progress = loadProgress()) {
  const r = progress[id];
  if (!r) return [];
  return Array.isArray(r.objectives) ? r.objectives : ['A'];
}

// いま遊べる、いちばん先のステージの番号（クリアが連続している分だけ進む）
export function accessibleIndex(progress = loadProgress()) {
  let i = 0;
  while (i < STAGE_IDS.length - 1 && isStageCleared(STAGE_IDS[i], progress)) i += 1;
  return i;
}

export function isStageUnlocked(id, progress = loadProgress()) {
  if (isDev()) return true;
  const idx = stageIndex(id);
  if (idx < 0) return true;
  return idx <= accessibleIndex(progress);
}

// 用語は、term.stage 番のステージに着いたら読める
export function isTermUnlocked(term, progress = loadProgress()) {
  if (isDev()) return true;
  return (term.stage ?? 0) <= accessibleIndex(progress);
}

// 目標をクリアしたことを記録する。first は、そのステージの最初の目標（A）かどうか。
export function recordObjective(stageId, objectiveKey, rating, first) {
  const data = loadProgress();
  const prev = data[stageId] ?? { objectives: [], done: false };
  const objectives = [...new Set([...(prev.objectives ?? []), objectiveKey])];
  const better = !prev.rating || RATING_ORDER[rating] > RATING_ORDER[prev.rating] ? rating : prev.rating;
  data[stageId] = { rating: better, objectives, done: prev.done || first };
  saveAll(data);
}
