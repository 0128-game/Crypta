// stages.js
// ステージJSONの読み込みだけを担当する（最小版）。
// 判定や描画は simulator.js 側で行う。

// ステージを作ったら、ここにIDを足していく。
// 並び順がそのまま一覧の表示順になる。
export const STAGE_IDS = [
  'test',
  'stage01',
  'stage02',
  'stage03',
  'stage04',
  'stage05',
  'stage06',
  'stage07',
  'stage08',
  'stage09',
  'stage10',
  'stage11',
  'stage12',
];

// 文章（content/stages/<id>.json）を、ロジック（stages/<id>.json）に重ねる。
//   文章のファイルがなくても、ゲームは動く（名前や解説が、空になる）。
function mergeText(logic, text) {
  const out = { ...logic };
  ['title', 'goal', 'situation', 'guide', 'lesson'].forEach((k) => {
    if (text[k] !== undefined) out[k] = text[k];
  });
  if (text.demo) out.demo = { ...(out.demo ?? {}), text: text.demo }; // 各ステージの頭の「事件」の文章
  if (text.epilogue) out.epilogueText = text.epilogue;
  if (text.finale) out.finale = { ...(out.finale ?? {}), text: text.finale };
  if (out.solutions && text.solutionNotes) {
    out.solutions = Object.fromEntries(
      Object.entries(out.solutions).map(([k, sol]) => [k, { ...sol, note: text.solutionNotes[k] ?? '' }])
    );
  }
  if (out.tutorial && text.tutorial) {
    const byId = new Map((text.tutorial.steps ?? []).map((st) => [st.id, st.text]));
    out.tutorial = {
      ...out.tutorial,
      steps: (out.tutorial.steps ?? []).map((st) => ({ ...st, text: byId.get(st.id) ?? '' })),
      finish: text.tutorial.finish ?? '',
    };
  }
  return out;
}

// 文章の読み込みに失敗したステージ（書き方のまちがいなど）
export const textErrors = [];

// 1ステージ分を読み込む。失敗したら例外を投げる。
export async function loadStage(id) {
  const name = encodeURIComponent(id);
  const res = await fetch(`stages/${name}.json`);
  if (!res.ok) {
    throw new Error(`stage "${id}" を読み込めませんでした (HTTP ${res.status})`);
  }
  const data = await res.json();

  let text = {};
  try {
    const t = await fetch(`content/stages/${name}.json`, { cache: 'no-cache' });
    if (t.ok) text = await t.json();
    else textErrors.push(`${id}（HTTP ${t.status}）`);
  } catch (err) {
    console.warn(`[stages] ${id} の文章を読み込めませんでした:`, err);
    textErrors.push(id);
  }
  return mergeText({ ...data, id: data.id ?? id }, text);
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
