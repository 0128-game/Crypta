// attack-page.js  裏面のステージ画面
import { playScenario } from './atk-play.js';
import { ATK_STAGES } from './atk-scenarios.js';
import { markDone, doneList, isOpen, setRank, rankMap } from './atk-progress.js';
import { flipTo } from './flip.js';
import { bindAdminTrigger } from './admin.js';

const app = document.getElementById('app');
const q = new URLSearchParams(location.search);
const id = q.get('stage') ?? 'a0';
const i = ATK_STAGES.findIndex((s) => s.id === id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const nextSt = ATK_STAGES[i + 1];
const go = {
  list: () => { location.href = 'attacker.html'; },
  next: nextSt ? () => { location.href = `attack.html?stage=${nextSt.id}`; } : null,
};

// 表面で「止まる様子」を見て、戻ってきたとき
function backFromFront() {
  const back = el('div', 'atk-modal-back'); const box = el('div', 'atk-modal');
  const r = rankMap()[id];
  box.append(el('h2', null, '止め方を、確認しました'), el('p', 'atk-lead', `${ATK_STAGES[i].title}${r ? `（評価 ${r}）` : ''}`));
  const row = el('div', 'atk-modal-actions');
  const mk = (t, cls, fn, bid) => { const b = el('button', `button ${cls}`, t); b.type = 'button'; if (bid) b.id = bid; b.onclick = fn; row.append(b); };
  mk('もう一度', 'button-secondary', () => back.remove(), 'atk-back-again');
  mk('ステージ一覧へ', 'button-secondary', go.list);
  if (go.next) mk('次のステージへ', 'button-primary', go.next, 'atk-back-next');
  box.append(row); back.append(box); document.body.append(back);
}

if (i < 0 || !isOpen(ATK_STAGES, i, doneList())) {
  app.innerHTML = '<p class="atk-locked">このステージは、前のステージをクリアすると遊べます。<br><a class="button button-primary" href="attacker.html">ステージ一覧へ</a></p>';
} else {
  app.replaceChildren();
  document.title = `${ATK_STAGES[i].title} | CRYPTA 裏面`;
  playScenario(app, ATK_STAGES[i].build(), {
    // クリアした時点で、記録する（画面は、そのまま。ボタンで移る）
    onRecord: (r) => { markDone(id); setRank(id, r); },
    onList: go.list,
    onNext: go.next,
    onGiveUp: () => { setRank(id, 'C'); location.href = 'attacker.html'; },
    // 止まる様子：一瞬、表面に戻って、その回路で攻撃が止まる様子を再生し、また、ここへ戻る
    onStopReplay: (front) => flipTo(`simulator.html?stage=${front}&replay=1&return=${encodeURIComponent(`attack.html?stage=${id}&from=front`)}`, '#F3C63F'),
  });
  if (q.get('from') === 'front') backFromFront();
}
bindAdminTrigger(document.getElementById('footer-text'));
