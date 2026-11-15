// attack-page.js  裏面のステージ画面
import { playScenario } from './atk-play.js';
import { ATK_STAGES } from './atk-scenarios.js';
import { markDone, doneList, isOpen, setRank } from './atk-progress.js';

const app = document.getElementById('app');
const id = new URLSearchParams(location.search).get('stage') ?? 'a0';
const i = ATK_STAGES.findIndex((s) => s.id === id);
if (i < 0 || !isOpen(ATK_STAGES, i, doneList())) {
  app.innerHTML = '<p class="atk-locked">このステージは、前のステージをクリアすると遊べます。<br><a class="button button-primary" href="attacker.html">ステージ一覧へ</a></p>';
} else {
  app.replaceChildren();
  document.title = `${ATK_STAGES[i].title} | CRYPTA 裏面`;
  playScenario(app, ATK_STAGES[i].build(), { onClear: (r) => { markDone(id); setRank(id, r); location.href = 'attacker.html'; }, onGiveUp: () => { setRank(id, 'C'); location.href = 'attacker.html'; } });
}
