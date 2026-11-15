// attack-page.js  裏面のステージ画面
import './texts.js'; // 画面の文字を、データ（crypta.json の ui-texts・names）で、置き換える
import { playScenario, defenseBlock } from './atk-play.js';
import { ATK_STAGES } from './atk-scenarios.js';
import { markDone, doneList, isOpen, setRank, rankMap } from './atk-progress.js';
import { flipTo, fadeTo, bindFadeLinks } from './flip.js';
import { bindAdminTrigger } from './admin.js';
import { loadDialogue } from './dialogue.js';
// 文章（content/dialogue.json）を、先に読み込む
try { await loadDialogue(); } catch (err) { console.error(err); }

const app = document.getElementById('app');
const q = new URLSearchParams(location.search);
const id = q.get('stage') ?? 'a0';
const i = ATK_STAGES.findIndex((s) => s.id === id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const nextSt = ATK_STAGES[i + 1];
const LIST = 'attacker.html#stage-section'; // 表面と同じ：一覧は、ステージの見出しの位置へ
const go = {
  list: () => fadeTo(LIST),
  next: nextSt ? () => fadeTo(`attack.html?stage=${nextSt.id}`) : null,
};

// 表面で「止まる様子」を見て、戻ってきたとき：ここで、止め方の説明と、次へのボタンを出す
function backFromFront() {
  let last = null;
  try { last = JSON.parse(sessionStorage.getItem('crypta:atk:last') ?? 'null'); } catch { last = null; }
  const sc = ATK_STAGES[i].build();
  const back = el('div', 'atk-modal-back'); const box = el('div', 'atk-modal result is-safe atk-after-stop');
  back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  const head = el('div', 'result-head');
  head.append(el('h2', 'result-title', '止め方を、確認しました'));
  const r = last?.id === id ? last.r : rankMap()[id];
  if (r) { const chip = el('span', `rating rating-${r}`, r); chip.setAttribute('aria-label', `評価 ${r}`); head.append(chip); }
  box.append(head, el('p', 'atk-lead', `${ATK_STAGES[i].title}${last?.id === id ? `　手数 ${last.m}` : ''}`), ...defenseBlock(sc));
  const row = el('div', 'result-actions');
  const mk = (t, cls, fn, bid) => { const b = el('button', `button ${cls}`, t); b.type = 'button'; if (bid) b.id = bid; b.onclick = fn; row.append(b); };
  // 表面と同じ並び：次へ → もう一度 → ステージ一覧へ
  mk(go.next ? '次のステージへ' : 'ステージ一覧へ', 'button-primary', go.next ?? go.list, 'atk-back-next');
  mk('もう一度', 'button-secondary', () => back.remove(), 'atk-back-again');
  if (go.next) mk('ステージ一覧へ', 'button-secondary', go.list, 'atk-back-list');
  box.append(row); back.append(box); document.body.append(back);
  history.replaceState(null, '', `attack.html?stage=${id}`); // 再読み込みで、もう一度出ないように
}

if (i < 0 || !isOpen(ATK_STAGES, i, doneList())) {
  app.innerHTML = '<p class="atk-locked">このステージは、前のステージをクリアすると遊べます。<br><a class="button button-primary" href="attacker.html#stage-section">ステージ一覧へ戻る</a></p>';
} else {
  app.replaceChildren();
  document.title = `${ATK_STAGES[i].title} | CRYPTA 裏面`;
  playScenario(app, ATK_STAGES[i].build(), {
    // クリアした時点で、記録する（画面は、そのまま。ボタンで移る）
    onRecord: (r, info = {}) => { markDone(id); if (r) setRank(id, r); try { sessionStorage.setItem('crypta:atk:last', JSON.stringify({ id, r, m: info.moves })); } catch { /* なし */ } },
    listHref: LIST,
    nextHref: nextSt ? `attack.html?stage=${nextSt.id}` : null,
    onGiveUp: () => { setRank(id, 'C'); fadeTo(LIST); },
    // 止まる様子：一瞬、表面に戻って、その回路で攻撃が止まる様子を再生し、また、ここへ戻る
    onStopReplay: (front) => flipTo(`simulator.html?stage=${front}&replay=1&return=${encodeURIComponent(`attack.html?stage=${id}&from=front`)}`, '#F3C63F'),
  });
  if (q.get('from') === 'front') backFromFront();
}
bindAdminTrigger(document.getElementById('footer-text'));
bindFadeLinks();
