// atk-scenarios.js
// 攻撃者ステージの内容（11ステージ）。それぞれが「1つの攻撃者の考え方」を学ぶ。
// 各パート: { lead, tools, inv(), lying(), makeWire(round), bob(pkt, api, slot), onDeliver, goals[], after }
//   bob() は、霧の向こうにいる「受け取る側」のルール。判定は台本ではなく、このルールで行う。

import { pkt, item, fnv, caesar } from './atk-play.js';
import { text as dtext, raw as draw } from './dialogue.js';
// 文章は、content/dialogue.json の「atk」に、まとめてある（管理者用の「文章の編集」で、書き換えられる）。
// ここに書いてある文は、JSON が読めなかったときの、予備。
const V = (k, vars) => dtext(`atk.voice.${k}`, vars);

const ok = (p, who = 'Bob') => ({ ok: true, text: p.corrupt ? '▒▒▒' : p.body, note: p.corrupt ? V('receivedBroken', { who }) : V('received', { who, body: p.body }) });
const no = (note) => ({ ok: false, note });
const logHas = (api, f) => api.S.log.some((l) => l.pkt && l.res && f(l));
// 攻撃者の成功は、「流した」まで。向こうでどう処理されたかは、攻撃者には見えない
const sent = (api, f) => api.S.log.some((l) => l.pkt && !l.res?.missed && f(l));
const MSG = 'あしたの6じに、えきまえで あおう';
const PW = 'sakura2024';
// ステージ1の暗号文。待ち合わせの連絡の中で、Alice が「いつもの」パスワードを、うっかり書いている（エピローグで回収）
const MSG1 = `あしたの 6じ、えきまえで。そういえば シアターの かいいんとうろく、パスワード かんがえるの めんどうで、また いつもの ${PW} に しちゃった`;

// ---------- 入門（Eve だけ。読めたらOK） ----------
const intro = {
  id: 'a0', badge: '入門', title: '攻撃者は、何が見えて、何ができる？', link: '入門・ステージ1',
  who: 'eve',
  principle: '攻撃者は、「何が見えて、何ができるか」から考える。',
  defense: '暗号のない通信は、通った所で、誰にでも読まれる。何を守りたいのか（秘密・書き換え・通信の存在）を、分けて考える。',
  tutorial: [
    { text: '線は、Alice から Bob へ流れる通信です。まず、線を1本クリックしてください。', ok: (S) => S.pick || S.flags.pick || S.flags.inspect, target: 'wire' },
    { text: '下のメッセージボックスに、できることが出ます。「調べる」か「コピーする」を選ぼう。', ok: (S) => S.flags.pick || S.flags.inspect, target: '[data-cmd="inspect"], [data-cmd="pick"]' },
    { text: '調べた線には、色と文字が付きます。手紙の中身が、読めたはず。これで、達成です。', ok: () => false },
  ],
  phases: [
    {
      lead: 'あなたは Eve。見えるのは、公開ゾーンを流れる物だけです。左の Alice と、右の Bob は、霧がかかって、よく見えません。',
      tools: ['pick', 'inspect'],
      start: '流れてくる手紙の線をクリックして、「調べる」か「コピーする」を選んでみよう。',
      inv: () => [],
      makeWire: () => [pkt({ label: 'Alice の手紙', body: MSG })],
      bob: (p) => ok(p),
      goals: [
        { key: 'g1', text: 'Eve：流れている手紙を、調べるか、コピーして、読む', test: (a) => a.S.flags.inspect || a.S.flags.pick },
      ],
      after: '暗号のない通信は、通った所で、そのまま読める。「誰が・いつ・何を」送ったか、全部、見える。',
    },
  ],
};

// ---------- 1 弱い暗号は破られる（元のステージ2） ----------
const s1 = {
  id: 'a1', badge: 'ステージ 1', title: '弱い暗号は破られる', link: 'ステージ2（シーザー暗号は破られる）',
  who: 'eve',
  principle: '破れる所から破る。強い暗号は避けて、鍵を狙う。',
  defense: '暗号が強くても、鍵の置き場所が弱ければ意味がない。「暗号の強さ」と「鍵の守り」を、セットで考える。',
  phases: [
    {
      lead: 'Alice が、シーザー暗号で送りました。25通りしかない暗号を、どう破る？',
      tools: ['pick', 'inspect'],
      start: '暗号文を「コピーする」→ 持ち物の暗号文を「調べる」で、ずらし幅を試してみよう。',
      inv: () => [],
      makeWire: () => [pkt({ label: 'Alice の暗号文', body: MSG1, enc: { alg: 'caesar' } })],
      bob: (p) => ok(p),
      goals: [{ key: 'g1', text: '暗号文を解読して、中身を読む', test: (a) => a.S.flags.decoded }],
      after: '25通りしかないので、すぐ読めた。弱い暗号は、人の目でも破れる。',
    },
  ],
};

// ---------- 2 一番弱い輪（元のステージ3・4） ----------
const s2 = {
  id: 'a2', badge: 'ステージ 2', title: '鎖は、一番弱い輪で切れる', link: 'ステージ3・4（会えない相手／大きなデータ）',
  who: 'eve',
  principle: '鎖は、一番弱い輪で切れる。強い暗号を使っていても、鍵の運び方が弱ければ、そこから破れる。',
  defense: '強い部品を足すだけでは足りない。鍵の運び方や保管場所まで、全部が同じ強さか、見直す。',
  phases: [{
    lead: '', tools: ['pick', 'inspect', 'try', 'combine'],
    inv: () => [],
    makeWire: () => [
      pkt({ label: 'Alice の通信', body: 'ひみつの はなし：テストの せいせきは 87てん', enc: { alg: 'aes', keyId: 'K3' }, attackCost: 'ほぼ無限（10^51 年）' }),
      pkt({ label: 'Alice の通信', body: '共通鍵（AES）', carries: { keyId: 'K3' } }),
    ],
    bob: (p) => ok(p),
    goals: [{ key: 'g1', text: '暗号文を解読して、中身を読む', test: (a) => a.S.flags.decoded }],
    after: 'AES は破っていない。鍵を、そのまま運んでいた所が、一番弱い輪だった。',
  }],
};

// ---------- 3 書き換え（ハイブリッド暗号の通信） ----------
const s3 = {
  id: 'a3', badge: 'ステージ 3', title: '書き換え', link: 'ステージ5（書き換え）',
  who: 'mallory',
  principle: '中身が読めなくても、書き換えて流すことは、できる。暗号は、「読まれない」ことを守るもので、「書き換えられない」ことは、守らない。',
  defense: '暗号化だけでは、書き換えは防げない。書き換えを見抜く仕組み（指紋・MAC・署名）が、別に要る。',
  tutorial: [
    { text: '線は、Alice から Bob へ流れる通信です。まず、線を1本クリックしてください。', ok: (S) => S.pick || S.flags.pick, target: 'wire' },
    { text: '下のメッセージボックスで「コピーする」を選ぼう。流れている通信は、そのまま Bob に向かいます。', ok: (S) => S.flags.pick, target: '[data-cmd="pick"]' },
    { text: '次は、下の持ち物に入ったコピーをクリックして、「書き換える」を選ぼう。暗号文は、中身が読めなくても、壊すことができます。', ok: (S) => S.flags.edit, target: (S) => (S.pick?.type === 'inv' ? '[data-cmd="edit"]' : '.atk-inv-item') },
    { text: '同じ線をクリックして「取り替える…」→ 書き換えた通信を選ぶと、線の上の通信が、差し替わります。', ok: (S) => S.flags.swap, target: (S) => (S.pending ? '[data-pick]' : S.pick?.type === 'slot' ? '[data-cmd="swap"]' : 'wire') },
    { text: '最後に、右上の「流す」で、通信を Bob へ流そう。', ok: () => false, target: '#atk-advance' },
  ],
  phases: [{
    lead: '', tools: ['pick', 'edit', 'swap', 'inspect'],
    start: '線をクリックして、通信を、調べてみよう。',
    inv: () => [],
    makeWire: () => [
      pkt({ label: '通信（その1）', body: 'ひみつの はなし：あしたの 6じ', enc: { alg: 'aes', keyId: 'K4' }, attackCost: 'ほぼ無限（10^51 年）' }),
      pkt({ label: '通信（その2）', body: '共通鍵（AES）', wrapsKey: true, enc: { alg: 'rsa2048', keyId: 'BOBPRIV' }, attackCost: 'ほぼ無限（10^30 年以上）' }),
    ],
    bob: (p) => (p.corrupt ? { ok: true, note: V('brokenDecrypt') } : ok(p)),
    goals: [{ key: 'g1', text: '内容を書き換えて、Bob に流す', test: (a) => sent(a, (l) => l.pkt.corrupt) }],
    after: '中身は、読めないまま。それでも、壊して流すことは、できた。暗号は、書き換えを防がない。',
  }],
};

// ---------- 3 書き換え（元のステージ5） ----------
const ORIG3 = 'Alice の口座へ 1,000円';
const sHash = {
  id: 'a4', badge: 'ステージ 4', title: '書き換え（指紋つき）', link: 'ステージ5（書き換え）',
  who: 'mallory',
  principle: '守りが「何を守っているか」を見る。誰でも作れる指紋は、書き換えを防げない。',
  defense: '内容の指紋（ハッシュ）は、誰でも計算し直せる。書き換えを防ぐには、鍵を持つ人だけが作れる印（MAC・署名）が、要る。',
  phases: [{
    lead: 'この通信には、内容の指紋（ハッシュ）が付いています。Bob は、指紋が合わないと、拒否します。書き換えて、Bob に信じさせよう。',
    tools: ['pick', 'edit', 'compute', 'combine', 'swap', 'inspect'],
    start: '手紙を拾って、書き換えて、取り替えてみよう。Bob が拒否したら、理由を、考えよう。',
    inv: () => [],
    makeWire: () => [pkt({ label: 'Alice の送金指示', body: ORIG3, hash: fnv(ORIG3) })],
    bob: (p) => (p.hash === fnv(p.body) ? ok(p) : no(V('hashNg'))),
    goals: [{ key: 'g1', text: '内容を書き換えて、Bob に流す', test: (a) => sent(a, (l) => l.pkt.body !== ORIG3 && l.pkt.hash === a.fnv(l.pkt.body)) }],
    after: '指紋は、誰でも計算し直せた。Bob は、書き換えに、気づけない。',
  }],
};

// ---------- 4 妨害（元のステージ6） ----------
const MAC4 = (b) => ({ keyId: 'KM', tag: fnv(`KM|${b}`) });
const sMac = {
  id: 'a5', badge: 'ステージ 5', title: '妨害', link: 'ステージ6（偽造）',
  who: 'mallory',
  principle: '正面が閉まっていたら、別の入口を探す。',
  defense: '改ざんを見抜けても、通信を止める・遅らせる攻撃は、別問題。期限切れや再送の仕組みも、一緒に考える。',
  phases: [{
    lead: 'この通信には、MAC（鍵を持つ人だけが作れる印）が付いています。Bob は、期限（3ステップ目まで）に、2通とも届かないと、送金を実行できません。',
    tools: ['pick', 'edit', 'compute', 'grab', 'delay', 'reorder', 'swap', 'combine', 'inspect'],
    start: 'まず、書き換えて、MAC を作り直せるか、試してみよう。',
    inv: () => [],
    makeWire: () => [
      pkt({ label: '①残高の確認', body: '残高を確認', mac: MAC4('残高を確認'), deadline: 3 }),
      pkt({ label: '②送金の指示', body: 'Bob に 1万円 送金', mac: MAC4('Bob に 1万円 送金'), deadline: 3 }),
    ],
    bob: (p, a, slot) => {
      if (p.label.startsWith('②') && !a.S.log.some((l) => l.pkt?.label?.startsWith('①') && !l.res?.missed)) return no(V('orderNg'));
      if (slot.eta > p.deadline) return { ok: false, late: true, note: V('lateNg') };
      if (!p.mac || p.mac.tag !== fnv(`KM|${p.body}`)) return no(V('macNg'));
      return ok(p);
    },
    goals: [{ key: 'g1', text: '②送金の指示を、止めるか、遅らせる', test: (a) => a.S.flags.grab || a.S.flags.delay || a.S.flags.reorder }],
    after: '偽造は、できなかった。でも、止めたり、遅らせたりは、できる。',
  }],
};

// ---------- 5 人をだます（元のステージ7とのつながり） ----------
const N1 = 'Bob の投稿「駅前のカフェ、最高」';
const N2 = 'Bob の口ぐせ「りょーかい！」';
const N3 = '二人は、よく夕食の話をする';
const cues5base = [
  { text: '急ぎだ、と焦らせる（+25）', v: 25 },
  { text: `Bob の口ぐせで書く（+20）`, v: 20, needs: N2 },
  { text: `二人だけの話題を入れる（+30）`, v: 30, needs: N3 },
  { text: '「電話で確認しないで」と、念を押す（+15）', v: 15 },
];
const cues5 = () => cues5base.map((c, i) => ({ ...c, text: draw('atk.stages.a6.cues')?.[i] ?? c.text })); // 手口の文は、JSON から
const compose5 = (final) => ({
  lead: '拾った情報から、手口を選びます。（架空の数値による、簡易モデルです）',
  get cues() { return cues5(); },
  send: (sel, a) => {
    const p = Math.min(95, 10 + sel.reduce((s, i) => s + cues5base[i].v, 0));
    a.flag('composed');
    a.S.compose = { p: final ? 5 : p, n: sel.length };
    if (sel.length >= 3) a.flag('composed3');
    a.S.log.push({ pkt: { label: '連絡' }, res: { ok: !final && p >= 60, note: p >= 60 && !final ? V('tricked', { p }) : V('notTricked', { p }) } });
    a.say(`連絡を送った。Alice が信じる確率の目安：${final ? 5 : p}%（実際にどうしたかは、霧の向こうで、分からない）。`, '');
  },
});
const sHuman = {
  id: 'a6', badge: 'ステージ 6', title: '人をだます', link: 'ステージ7（否認）とのつながり',
  who: 'mallory',
  principle: '人の信頼は、暗号より破りやすい。',
  defense: '急ぎ・いつもと違う頼みごとは、別の手段（電話・対面）で、本人に確かめる。手順として、決めておく。',
  phases: [
    {
      lead: 'Mallory は、暗号に触れず、Alice に「Bob のふりをした連絡」を送ります。Eve が拾った、公開の情報を、材料にしよう。',
      tools: ['pick', 'inspect', 'compose'],
      start: '落ちている情報を「コピーする」でコピーしてから、「文面を作る」で、手口を選ぼう。',
      lying: () => [item({ kind: 'note', label: N1, text: 'SNS で、公開されている' }), item({ kind: 'note', label: N2, text: 'チャットの口調' }), item({ kind: 'note', label: N3, text: '公開の投稿から、分かる' })],
      makeWire: () => [pkt({ label: 'Alice の予定', body: '今夜、Bob と ごはん' })],
      bob: (p) => ok(p, 'Alice'),
      compose: compose5(false),
      goals: [{ key: 'g1', text: 'Alice に、連絡を送る', test: (a) => a.S.flags.composed3 }],
      after: '暗号は、1ビットも破られていない。Alice が、自分から、渡してしまった。',
    },
  ],
};

// ---------- 6 偽の公開鍵（元のステージ8） ----------
const MALPUB_INV = () => item({ kind: 'key', label: 'マロリーの秘密鍵', keyId: 'MALPRIV', keyName: 'MALPRIV', opens: ['MALPUB'] });
function aliceRecv(p, a) {
  if (p.pubkey) {
    if (a.S.phaseKey === 'cert') {
      if (!p.cert) return no(V('noCert'));
      if (p.cert.valid === false) return { ok: true, note: V('clickedContinue'), accepted: p.body };
    }
    return { ok: true, note: V('keyAccepted', { body: p.body }), accepted: p.body };
  }
  return ok(p, 'Bob');
}
const reactAlice = (p, res, a) => {
  // 鍵が受け取られなかったとき：Bob の公開鍵が、もう一度送られてくる（行き止まりにしない）
  if (!res.ok && p.pubkey) {
    a.S.wire.push({ p: pkt({ label: 'Bob の公開鍵', body: 'BOBPUB', pubkey: true, from: 'bob', to: 'alice', cert: a.S.phaseKey === 'cert' ? { valid: true } : undefined }), eta: a.S.tick + 1, state: 'wait', id: `w${Math.random()}` });
    a.say('Bob の公開鍵が、もう一度、送られてきた。（さっきの鍵は、受け取られなかったらしい）', 'bad');
    return;
  }
  if (res.ok && p.pubkey) {
    a.S.recvKey = res.accepted;
    a.S.wire.push({ p: pkt({ label: 'Alice の秘密の連絡', body: '口座の合言葉は 7788', enc: { alg: 'rsa', keyId: res.accepted } }), eta: a.S.tick + 1, state: 'wait', id: `w${Math.random()}` });
  }
};
const sKey = {
  id: 'a7', badge: 'ステージ 7', title: '偽の公開鍵', link: 'ステージ8（偽の公開鍵）',
  who: 'mallory',
  principle: '信頼の出発点（公開鍵）を乗っ取れば、あとの暗号は、全部、こちらの味方になる。',
  defense: '公開鍵が本物か、証明書（信頼できる所の保証）で確かめる。',
  phases: [
    {
      lead: 'Alice が、Bob の公開鍵を取り寄せます。その鍵で、秘密の連絡を暗号化して送ります。公開鍵を、すり替えられたら？',
      tools: ['pick', 'swap', 'combine', 'inspect'],
      start: 'Bob の公開鍵を、持ち物のマロリーの公開鍵と、「取り替えて」みよう。',
      inv: () => [pkt({ label: 'マロリーの公開鍵', body: 'MALPUB', pubkey: true, from: 'mallory', to: 'alice' }), MALPUB_INV()],
      makeWire: () => [pkt({ label: 'Bob の公開鍵', body: 'BOBPUB', pubkey: true, from: 'bob', to: 'alice' })],
      bob: (p, a) => { a.S.phaseKey = 'plain'; if (p.enc) return p.enc.keyId === 'BOBPUB' ? ok(p) : no(V('cannotDecrypt')); return aliceRecv(p, a); },
      onDeliver: reactAlice,
      goals: [
        { key: 'g1', text: 'Bob の公開鍵の線で、マロリーの公開鍵と取り替えて流す', test: (a) => sent(a, (l) => l.pkt.body === 'MALPUB') },
        { key: 'g2', text: 'Eve：Alice の秘密の連絡をコピーして、マロリーの秘密鍵と合わせて、読む', test: (a) => a.S.flags.decoded },
      ],
      after: '公開鍵を差し替えただけで、Alice の秘密の連絡は、Mallory に読まれた。',
    },
  ],
};

// ---------- 8 警告を無視させる（証明書があっても） ----------
const sCert = {
  id: 'a8', badge: 'ステージ 8', title: '警告を無視させる', link: 'ステージ8（偽の公開鍵）',
  who: 'mallory',
  principle: '守りが正しく働いても、人がそれを無視すれば、意味がない。',
  defense: '証明書の警告は、「本物ではないかもしれない」という知らせ。「続行」を押さずに、止まる。',
  phases: [
    {
      lead: '公開鍵に、証明書（本物だという保証）が付いています。Alice は、証明書のない鍵を、受け取りません。',
      change: 'Bob の公開鍵には「証明書」が付いている。Alice は、証明書のない鍵を受け取らない。持ち物には、自分で作った「自己署名の証明書」つきの鍵もある。公開されている情報も、手がかりになるかもしれない。',
      tools: ['pick', 'swap', 'combine', 'inspect'],
      start: '証明書のない鍵は、通らないはず。他の入口はないか、公開ゾーンを調べよう。',
      inv: () => [
        pkt({ label: 'マロリーの公開鍵（証明書なし）', body: 'MALPUB', pubkey: true, from: 'mallory', to: 'alice' }),
        pkt({ label: 'マロリーの公開鍵（自己署名の証明書つき）', body: 'MALPUB', pubkey: true, from: 'mallory', to: 'alice', cert: { valid: false } }),
        MALPUB_INV(),
      ],
      lying: () => [item({ kind: 'note', label: 'Alice の SNS の投稿', text: '公開されている', get inspect() { return [V('aliceSns')]; } })],
      makeWire: () => [pkt({ label: 'Bob の公開鍵', body: 'BOBPUB', pubkey: true, from: 'bob', to: 'alice', cert: { valid: true } })],
      bob: (p, a) => { a.S.phaseKey = 'cert'; if (p.enc) return p.enc.keyId === 'BOBPUB' ? ok(p) : no(V('cannotDecrypt')); return aliceRecv(p, a); },
      onDeliver: reactAlice,
      goals: [
        { key: 'g1', text: '証明書があっても、Alice の秘密の連絡を読む', test: (a) => a.S.flags.decoded },
      ],
      after: '証明書は、破っていない。警告を無視する癖が、入口になった。',
    },
  ],
};

// ---------- 9 再送（元のステージ9） ----------
const ORIG7 = 'Bob に 1万円 送る';
const sig7 = (b, seq) => ({ signer: 'alice', tag: fnv(`sig|alice|${b}|${seq}`) });
const sReplay = {
  id: 'a9', badge: 'ステージ 9', title: '作らなくても、本物を使い回せばよい', link: 'ステージ9（再送）',
  who: 'mallory',
  principle: '作れなくても、本物を使い回せばよい。',
  defense: '署名が正しくても、同じ通信を何度も受け入れてしまう。通し番号など、「一度きり」の仕組みを足す。',
  phases: [
    {
      lead: '送金の指示に、Alice の署名が付いています。署名は、偽造できません。でも、本物を、もう一度、流したら？',
      tools: ['pick', 'replay', 'inspect'],
      start: '署名つきの通信を、拾って、もう一度、流してみよう。',
      inv: () => [],
      makeWire: () => [pkt({ label: '送金の指示（署名つき）', body: ORIG7, sig: sig7(ORIG7, null) })],
      bob: (p) => (p.sig && p.sig.tag === fnv(`sig|alice|${p.body}|${p.seq}`) ? ok(p) : no(V('sigNg'))),
      goals: [
        { key: 'g1', text: '署名つきの通信を、コピーする', test: (a) => a.S.flags.pick },
        { key: 'g2', text: '持ち物から、同じ通信を「再送する」→「流す」で、もう一度流す', test: (a) => sent(a, (l) => l.pkt.replayed) },
      ],
      after: '署名は、本物のまま。1万円が、二重に、送られてしまった。',
    },
  ],
};

// ---------- 10 継ぎ目を探す（毎回、守りの組み方が変わる。どれにも効く1つの手がある） ----------
const ORIG10 = 'Bob に 5,000円 送る';
function buildRedteam() {
  const variants = [
    { name: '暗号だけ', wire: () => pkt({ label: '送金の指示', body: ORIG10, enc: { alg: 'aes', keyId: 'K10' }, attackCost: 'ほぼ無限（10^51 年）' }),
      bob: (p) => (p.corrupt ? no(V('aesNg')) : p.enc?.keyId === 'K10' ? ok(p) : no('Bob：読めない。破棄しました')) },
    { name: '指紋だけ', wire: () => pkt({ label: '送金の指示', body: ORIG10, hash: fnv(ORIG10) }),
      bob: (p) => (p.hash === fnv(p.body) ? ok(p) : no('Bob：指紋が合わない。拒否しました')) },
    { name: '署名だけ', wire: () => pkt({ label: '送金の指示', body: ORIG10, sig: sig7(ORIG10, null) }),
      bob: (p) => (p.sig && p.sig.tag === fnv(`sig|alice|${p.body}|${p.seq}`) ? ok(p) : no(V('sigNg'))) },
  ];
  const v = variants[Math.floor(Math.random() * variants.length)];
  return {
    id: 'a10', badge: 'ステージ 10', title: '継ぎ目を探す', link: 'ステージ10（もう一度すべてを組む）',
    who: 'mallory', variant: v.name,
    principle: '守りは、組み合わせの継ぎ目で崩れる。どの守りにも「一度きり」を確かめる仕組みがなければ、同じ1つの手が、全部に効く。',
    defense: '部品を足したら、「読む・書き換える・使い回す」の全部の攻撃に対して、穴がないかを、通しで見直す。',
    phases: [{
      lead: '',
      change: 'この通信の守りは、来るたびに組み方が変わる（暗号・指紋・署名のどれか1つ）。どれが来ても通る攻撃は、あるだろうか。線を調べると、今回の守りが分かる。',
      tools: ['pick', 'inspect', 'edit', 'compute', 'combine', 'swap', 'replay'],
      inv: () => [],
      makeWire: () => [v.wire()],
      bob: v.bob,
      goals: [{ key: 'g1', text: 'Alice が頼んでいない送金を、Bob に実行させる', test: (a) => sent(a, (l) => l.pkt.replayed || (l.pkt.body !== ORIG10 && !l.pkt.corrupt && l.pkt.hash && l.pkt.hash === a.fnv(l.pkt.body))) }],
      after: `今回の守りは「${v.name}」だった。でも、どの組み方でも、同じ本物を、もう一度流せば通った。3通りとも、「一度きり」を確かめる仕組みが、抜けていた。`,
    }],
  };
}

// ---------- エピローグ 一番危険なのは、誰か ----------
const epilogue = {
  id: 'a11', badge: 'エピローグ', title: '一番危険なのは、誰か', link: '',
  who: 'mallory', auto: true,
  principle: '暗号が守れるのは、通信の途中の「道」だけ。入力する前と、届いた後は、守れない。一度盗まれた情報は、あとから別の場所で効いてくる。',
  defense: 'サービスごとに、違うパスワードを使う。二段階認証を付ける。',
  script: { tag: 'エピローグ', pw: PW, msg: MSG1 },
  phases: [{
    lead: '', tools: [], inv: () => [], lying: () => [],
    makeWire: () => [pkt({ label: 'Alice と Bob の通信（TLS 1.3）', body: 'ひみつの はなし', enc: { alg: 'tls13', keyId: 'TLSK' }, attackCost: 'ほぼ無限（10^51 年）' })],
    bob: (p) => ok(p),
    goals: [{ key: 'g1', text: '見届ける', test: () => false }],
  }],
};

const ROLE = { eve: 'あなたは Eve（盗み見る人）', mallory: 'あなたは Mallory（書き換える人）', both: 'あなたは Eve と Mallory' };
// 全ステージ共通：見せるのは、「いま、どちらか」と「何をしたいか」だけ
const AIMS = {
  a0: ['通信の中身を、読む'],
  a1: ['元の文を、読む'],
  a2: ['本文を、読む'],
  a3: ['Bob に届く内容を、変える（または、壊す）'],
  a4: ['書き換えた内容を、Bob に受け入れさせる'],
  a5: ['Bob が、期限までに、正しく受け取れない状態にする'],
  a6: ['Alice に、だまされてもらう'],
  a7: ['Alice に、自分の公開鍵を、Bob のものだと思わせて、秘密の連絡を読む'],
  a8: ['証明書があっても、Alice の秘密の連絡を読む'],
  a9: ['Bob に、同じ指示を、2回受け取らせる'],
  a10: ['Alice が頼んでいない送金を、Bob に実行させる'],
  a11: ['最後の攻撃を、見届ける'],
};
// 最小の手数（評価用。画面には出さない。手数＝コマンドを実行した回数。「調べる」（見るだけ）と「流す」は数えない。総当たりは何通り試しても1手）
// replay：止まる様子を再生する、表面のステージ（その想定解の回路で、攻撃が止まる様子を見せる）／止める技術と、止まる様子
const META = {
  a0: { par: [1], replay: 'stage01', tech: '暗号化', stop: ['Alice：本文を、暗号化して送る', '公開ゾーンを通る：Eve には、読めない文字', 'Bob：鍵で、元に戻して、読む'], block: '暗号化' },
  a1: { par: [2], replay: 'stage02', tech: '鍵の種類が多い暗号（置換暗号・AES）', stop: ['Alice：鍵の種類が、とても多い暗号（AES）で送る', 'Eve：全部の鍵を試そうとする → 試す数が、多すぎて、終わらない'], block: '全部試すのは、終わらない' },
  a2: { par: [3], replay: 'stage04', tech: '公開鍵暗号で鍵を送る（RSA ＋ AES）', stop: ['Alice：鍵を、Bob の公開鍵で、暗号化して送る', 'Eve：鍵の線を、コピーする → 暗号化されていて、読めない', 'Eve：鍵が、手に入らない → 本文も、読めない'], block: '鍵が、読めない' },
  a3: { par: [3], replay: 'stage05', tech: 'ハッシュ（改ざんの検出）', stop: ['Alice：本文の指紋（ハッシュ）を付けて送る', 'Mallory：本文を書き換える', 'Bob：指紋が合わない → 改ざんに気づいて、拒否'], block: '指紋が合わない' },
  a4: { par: [5], replay: 'stage06', tech: 'MAC（鍵つきの指紋）', stop: ['Alice：鍵を使って、MAC を付けて送る', 'Mallory：本文を書き換えて、指紋を、作り直す', 'Mallory：MAC は、鍵がないと作れない → Bob が、拒否'], block: 'MAC が作れない' },
  a5: { par: [1], replay: 'stage09', tech: '通し番号・時刻（完全には止められないが、「届いていない」「順番が違う」に気づける）', stop: ['Alice：通し番号と時刻を付けて送る', 'Mallory：通信を、遅らせる・入れ替える', 'Bob：番号が抜けている・順番が違う → 気づいて、再送を求める'], block: '番号の抜けに気づく' },
  a6: { par: [3], replay: 'stage07', tech: 'デジタル署名 ＋ 別の手段での本人確認', stop: ['Alice：連絡が、急ぎ・いつもと違う、と気づく', 'Alice：別の手段（電話・対面）で、本人に確かめる', 'Mallory：本人ではないと、ばれる'], block: '本人確認で、ばれる' },
  a7: { par: [3], replay: 'stage08', tech: '証明書（PKI）', stop: ['Alice：公開鍵の、証明書を確かめる', 'Mallory：偽の公開鍵 → 証明書が、合わない', 'Alice：受け取らない'], block: '証明書が、合わない' },
  a8: { par: [3], replay: 'stage08', tech: '警告が出たら、続行しない', stop: ['Mallory：自己署名の証明書つきの鍵を送る', 'Alice の画面：「この証明書は信頼できません」', 'Alice：「続行」を押さずに、止まる → 鍵は、受け取られない'], block: '警告で、止まる' },
  a9: { par: [2], replay: 'stage09', tech: '通し番号・時刻を、署名に含める', stop: ['Alice：通し番号を含めて、署名する', 'Mallory：同じ通信を、もう一度、流す', 'Bob：この番号は、もう受け取った → 拒否'], block: '同じ番号を、拒否' },
  a10: { par: [2], replay: 'stage11', tech: 'TLS（暗号・改ざんの検出・通し番号を、一式まとめて使う）', stop: ['Alice：TLS で、守りを一式まとめて送る', 'Mallory：同じ通信を、もう一度流す', 'Bob：番号が古い → 使い回しに気づいて、破棄'], block: '使い回しに気づく' },
  a11: { par: [1], tech: '人が気をつける（サービスごとに、違うパスワード。二段階認証）', stop: ['Alice：サービスごとに、違うパスワードを使う', 'Mallory：ステージ1のパスワードで、入ろうとする → 通らない', '（二段階認証があれば、もっと被害は、小さくなる）'], block: 'パスワードが、通らない' },
};
// JSON（content/dialogue.json の atk.stages）の文章を、ステージに重ねる
function applyTexts(sc) {
  const J = draw(`atk.stages.${sc.id}`);
  if (!J || typeof J !== 'object') return sc;
  ['principle', 'defense', 'tech', 'block'].forEach((k) => { if (typeof J[k] === 'string') sc[k] = J[k]; });
  if (Array.isArray(J.stop)) sc.stop = J.stop;
  if (Array.isArray(J.tutorial) && sc.tutorial) sc.tutorial = sc.tutorial.map((t, i) => ({ ...t, text: J.tutorial[i] ?? t.text }));
  if (J.challenge && sc.challenge) sc.challenge = { ...sc.challenge, ...J.challenge };
  sc.phases = sc.phases.map((ph, i) => (i > 0 ? ph : { ...ph, ...(J.aim ? { aim: J.aim } : {}), ...(J.change ? { change: J.change } : {}), ...(J.after ? { after: dtext(`atk.stages.${sc.id}.after`, { variant: sc.variant ?? '' }) } : {}) }));
  if (sc.auto) sc.script = { ...sc.script, ...(draw('atk.epilogue') ?? {}) };
  return sc;
}
const withRoleBase = (st, r) => ({ ...st, roleText: ROLE[r], ...(META[st.id] ?? {}), challenge: CHALLENGES[st.id], phases: st.phases.map((ph, i) => ({ ...ph, aim: ph.aim ?? AIMS[st.id]?.[i] ?? AIMS[st.id]?.[0], par: ph.par ?? (META[st.id]?.par?.[i]) ?? 99 })) });
const withRole = (st, r) => applyTexts(withRoleBase(st, r));
// 題と一言は、JSON から（なければ、ここの文）
const T = (id, k, fb) => { const v = draw(`atk.stages.${id}.${k}`); return typeof v === 'string' ? v : fb; };
const stage = (id, title, theme, roles, build) => ({ id, get title() { return T(id, 'title', title); }, get theme() { return T(id, 'theme', theme); }, roles, build });
export const ATK_STAGES = [
  stage('a0', '入門：盗み見', '暗号のない通信は、誰でも読める', ['eve'], () => withRole(intro, 'eve')),
  stage('a1', '1　弱い暗号は破られる', '鍵の種類が少なければ、全部試せばよい', ['eve'], () => withRole(s1, 'eve')),
  stage('a2', '2　一番弱い輪', '暗号が強くても、鍵の運び方が弱ければ破れる', ['eve'], () => withRole(s2, 'eve')),
  stage('a3', '3　書き換え', '隠されていても、書き換えはできる', ['mallory'], () => withRole(s3, 'mallory')),
  stage('a4', '4　指紋ごとすり替え', '誰でも計算できる指紋は、指紋ごと作り直せる', ['mallory'], () => withRole(sHash, 'mallory')),
  stage('a5', '5　妨害', '中身を変えられなくても、届け方は邪魔できる', ['mallory'], () => withRole(sMac, 'mallory')),
  stage('a6', '6　人をだます', '人の信頼は、暗号より破りやすい', ['mallory'], () => withRole(sHuman, 'mallory')),
  stage('a7', '7　偽の公開鍵', '「信頼の出発点」を乗っ取る', ['mallory'], () => withRole(sKey, 'mallory')),
  stage('a8', '8　警告を無視させる', '守りが働いても、人が無視すれば通る', ['mallory'], () => withRole(sCert, 'mallory')),
  stage('a9', '9　再送', '作らなくても、本物を使い回せばよい', ['mallory'], () => withRole(sReplay, 'mallory')),
  stage('a10', '10　継ぎ目を探す', '守りは、組み合わせの継ぎ目で崩れる', ['both'], () => withRole(buildRedteam(), 'both')),
  stage('a11', 'エピローグ　一番危険なのは、誰か', '技術では止められない。人が気をつける', ['both'], () => withRole(epilogue, 'both')),
];
// 自作チャレンジ（ゲームの外でツールを作って、出てきた答えを入力する。評価には、関係しない）
export const CHALLENGES = {
  a1: { title: '自作チャレンジ：26通りを一度に出す総当たりツール', text: '暗号文を、ずらし幅 1〜25 で全部戻すツールを、ゲームの外で作り、読めた文（本文）を、入力してください。', answer: MSG1, show: caesar(MSG1, 3) },
  a4: { title: '自作チャレンジ：ハッシュ値を計算するツール', text: '「Mallory の口座へ 1,000円」の指紋（ハッシュ値。この教材の簡易方式）を、ゲームの外で作ったツールで計算して、入力してください。', answer: fnv('Mallory の口座へ 1,000円'), target: 'Mallory の口座へ 1,000円', hint: '方式：FNV-1a（32ビット）の16進8桁' },
};
