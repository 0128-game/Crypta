// stages.js
// ステージJSONの読み込みだけを担当する（最小版）。
// 判定や描画は simulator.js 側で行う。

// ステージを作ったら、ここにIDを足していく。
// 並び順がそのまま一覧の表示順になる。
export const STAGE_IDS = [
  'test',
  // 'stage01',
  // 'stage02',
  // 'stage03',
  // 'stage04',
  // 'stage05',
  // 'stage06',
  // 'stage07',
  // 'stage08',
  // 'stage09',
  // 'stage10',
  // 'stage11',
  // 'stage12',
];

// 1ステージ分を読み込む。失敗したら例外を投げる。
export async function loadStage(id) {
  const res = await fetch(`stages/${encodeURIComponent(id)}.json`);
  if (!res.ok) {
    throw new Error(`stage "${id}" を読み込めませんでした (HTTP ${res.status})`);
  }
  const data = await res.json();
  return { ...data, id: data.id ?? id };
}

// 全ステージを読み込む。読み込めなかったものは飛ばす。
export async function loadStages() {
  const results = await Promise.allSettled(STAGE_IDS.map(loadStage));
  const stages = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      stages.push(r.value);
    } else {
      console.warn(`[stages] ${STAGE_IDS[i]} をスキップ:`, r.reason);
    }
  });
  return stages;
}
