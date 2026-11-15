// atk-scenarios.js
// 攻撃者ステージの内容（11ステージ）。それぞれが「1つの攻撃者の考え方」を学ぶ。
// 各パート: { lead, tools, inv(), lying(), makeWire(round), bob(pkt, api, slot), onDeliver, goals[], after }
//   bob() は、霧の向こうにいる「受け取る側」のルール。判定は台本ではなく、このルールで行う。

import { pkt, item, fnv } from './atk-play.js';

const ok = (p, who = 'Bob') => ({ ok: true, text: p.corrupt ? '▒▒▒' : p.body, note: `${who}：「${p.corrupt ? '▒▒▒（壊れた文字）' : p.body}」を受け取りました${p.corrupt ? '（壊れていることに、気づけていません）' : ''}` });
const no = (note) => ({ ok: false, note });
const logHas = (api, f) => api.S.log.some((l) => l.pkt && l.res && f(l));
const MSG = 'あしたの6じに、えきまえで あおう';

// ---------- 入門（元の入門＋ステージ1） ----------
const intro = {
  id: 'a0', badge: '入門', title: '攻撃者は、何が見えて、何ができる？', link: '入門・ステージ1',
  who: 'eve',
  principle: '攻撃者は、「何が見えて、何ができるか」から考える。',
  defense: '暗号をかけても、「通信があること」「書き換え」までは、防げない。何を守りたいのか（秘密・書き換え・通信の存在）を、分けて考える。',
  phases: [
    {
      lead: 'あなたは Eve と Mallory。見えるのは、公開ゾーンを流れる物だけです。Alice と Bob のゾーンは、霧がかかって、見えません。',
      tools: ['pick', 'edit', 'swap', 'inspect'],
      start: '流れてくる手紙を、「拾う」で、コピーしてみよう。',
      inv: () => [pkt({ label: '偽の手紙（Mallory 作）', body: 'あしたは こなくていい', from: 'mallory' })],
      makeWire: () => [pkt({ label: 'Alice の手紙', body: MSG })],
      bob: (p) => ok(p),
      goals: [
        { key: 'g1', text: 'Eve：流れている手紙を、「拾う」でコピーする', test: (a) => a.S.flags['pick:Alice の手紙'] },
        { key: 'g2', text: 'Mallory：偽の手紙と、「取り替える」で差し替え、「進める」で Bob に届ける', test: (a) => logHas(a, (l) => l.res.ok && l.pkt.body !== MSG) },
      ],
      after: '暗号のない通信は、見られるし、書き換えられる。Bob は、偽物に、気づけません。',
    },
    {
      lead: '次は、Alice が暗号をかけて送ります。Eve は、何が分かるでしょう。',
      tools: ['pick', 'inspect', 'edit', 'swap'],
      start: '暗号文は、読めません。でも、「調べる」と、分かることがあります。',
      inv: () => [],
      makeWire: () => [pkt({ label: 'Alice の暗号文', body: MSG, enc: { alg: 'aes', keyId: 'K1' }, attackCost: 'ほぼ無限（10^51 年）' })],
      bob: (p) => ok(p),
      goals: [
        { key: 'g1', text: 'Eve：暗号文を「調べる」。読めない代わりに、何が分かる？', test: (a) => a.S.flags['inspect:Alice の暗号文'] },
        { key: 'g2', text: 'Mallory：暗号文を拾って「書き換える」→「取り替える」→「進める」。Bob は、気づける？', test: (a) => logHas(a, (l) => l.pkt.corrupt) },
      ],
      after: '中身は読めなくても、「誰が・いつ・どれだけ」送ったかは、見える。そして、書き換えは、暗号化だけでは、防げない。',
    },
  ],
};

// ---------- 1 弱い暗号は破られる（元のステージ2） ----------
const s1 = {
  id: 'a1', badge: 'ステージ 1', title: '破れる所から破る', link: 'ステージ2（シーザー暗号は破られる）',
  who: 'eve',
  principle: '破れる所から破る。強い暗号は避けて、鍵を狙う。',
  defense: '暗号が強くても、鍵の置き場所が弱ければ意味がない。「暗号の強さ」と「鍵の守り」を、セットで考える。',
  phases: [
    {
      lead: 'Alice が、シーザー暗号で送りました。25通りしかない暗号を、どう破る？',
      tools: ['pick', 'try', 'inspect'],
      start: '暗号文を「拾う」→「試す」で、全部の幅を、試してみよう。',
      inv: () => [],
      makeWire: () => [pkt({ label: 'Alice の暗号文', body: MSG, enc: { alg: 'caesar' } })],
      bob: (p) => ok(p),
      goals: [
        { key: 'g1', text: '暗号文を、「拾う」でコピーする', test: (a) => a.S.flags['pick:Alice の暗号文'] },
        { key: 'g2', text: '持ち物の暗号文を、「試す」で解読する（読める行を、クリック）', test: (a) => a.S.flags.decoded },
      ],
      after: '25通りしかないので、すぐ読めた。弱い暗号は、人の目でも破れる。',
    },
    {
      lead: '今度は、Alice が、AES（今の暗号）に変えました。同じ手では、解けるでしょうか。公開ゾーンには、何かが落ちています。',
      tools: ['pick', 'try', 'combine', 'inspect'],
      start: '「試す」で、AES が解けるか、確かめよう。',
      inv: () => [],
      lying: () => [item({ kind: 'key', label: '共通鍵のメモ（共有フォルダに置き忘れ）', keyId: 'K2', keyName: 'K2', opens: ['K2'], zone: 'public', inspect: ['Alice が、印刷して、共有フォルダに置き忘れた、鍵のメモ。'] })],
      makeWire: () => [pkt({ label: 'Alice の暗号文', body: MSG, enc: { alg: 'aes', keyId: 'K2' }, attackCost: '宇宙の年齢より、はるかに長い（約 10^51 年）' })],
      bob: (p) => ok(p),
      goals: [
        { key: 'g1', text: '暗号文を「拾って」、「試す」。AES は、解けるか？', test: (a) => a.S.flags['try:Alice の暗号文'] },
        { key: 'g2', text: '公開ゾーンで、鍵のヒントになる物を、「拾う」', test: (a) => a.S.flags['pick:共通鍵のメモ（共有フォルダに置き忘れ）'] },
        { key: 'g3', text: '「合わせる」で、暗号文と鍵を合わせて、読む', test: (a) => a.S.flags.decoded },
      ],
      after: 'AES は破っていない。置き忘れた鍵を使っただけ。攻撃者は、破れない所を避ける。',
    },
  ],
};

// ---------- 2 一番弱い輪（元のステージ3・4） ----------
const VAULT = '鍵のバックアップ（4けたの暗証番号つき）';
const s2 = {
  id: 'a2', badge: 'ステージ 2', title: '鎖は、一番弱い輪で切れる', link: 'ステージ3・4（会えない相手／大きなデータ）',
  who: 'eve',
  principle: '鎖は、一番弱い輪で切れる。',
  defense: '強い部品を足すだけでは足りない。つなぎ目や保管場所まで、全部が同じ強さか、見直す。',
  phases: [{
    lead: '本文は AES、その鍵は RSA-2048 で包まれて、送られています。どちらも強そうです。どこから破るのが、一番楽でしょう。',
    tools: ['pick', 'inspect', 'try', 'combine'],
    start: '3つの物について、「調べる」で、手間の見積もりを、見比べよう。',
    inv: () => [],
    lying: () => [item({
      kind: 'vault', label: VAULT, zone: 'public', noPick: true,
      inspect: ['Alice が、念のために作った、鍵のバックアップ。', '暗証番号は、4けた（10000通り）。手間の見積もり：数秒'],
      tryResult: (a) => ({ ok: true, text: '暗証番号は10000通りしかない。数秒で開いた。鍵 K3 を手に入れた。', gain: item({ kind: 'key', label: '鍵 K3（バックアップから）', keyId: 'K3', keyName: 'K3', opens: ['K3'] }), effort: '数秒' }),
    })],
    makeWire: () => [
      pkt({ label: '本文（AES）', body: 'ひみつの はなし：せいかは 87てん', enc: { alg: 'aes', keyId: 'K3' }, attackCost: 'ほぼ無限（10^51 年）' }),
      pkt({ label: '鍵の箱（RSA-2048）', body: 'K3', enc: { alg: 'rsa2048', keyId: 'BOBPRIV' }, attackCost: 'ほぼ無限（10^30 年以上）' }),
    ],
    bob: (p) => ok(p),
    goals: [
      { key: 'g1', text: '3つ（本文・鍵の箱・バックアップ）を、「調べる」で、手間を比べる', test: (a) => a.S.flags['inspect:本文（AES）'] && a.S.flags['inspect:鍵の箱（RSA-2048）'] && a.S.flags[`inspect:${VAULT}`] },
      { key: 'g2', text: '一番手間が小さい所を「試す」→「合わせる」で、本文を読む', test: (a) => a.S.flags.decoded },
    ],
    after: '暗号は破っていない。破ったのは、4けたの暗証番号。一番弱い輪を、狙えば、足りる。',
  }],
};

// ---------- 3 書き換え（元のステージ5） ----------
const ORIG3 = 'Alice の口座へ 1,000円';
const s3 = {
  id: 'a3', badge: 'ステージ 3', title: '守りが、何を守っているかを見る', link: 'ステージ5（書き換え）',
  who: 'mallory',
  principle: '守りが「何を守っているか」を見る。誰でも作れる指紋は、書き換えを防げない。',
  defense: '内容の指紋（ハッシュ）は、誰でも計算し直せる。書き換えを防ぐには、鍵を持つ人だけが作れる印（MAC・署名）が、要る。',
  phases: [{
    lead: 'この通信には、内容の指紋（ハッシュ）が付いています。Bob は、指紋が合わないと、拒否します。書き換えて、Bob に信じさせよう。',
    tools: ['pick', 'edit', 'compute', 'combine', 'swap', 'inspect'],
    start: '手紙を拾って、書き換えて、取り替えてみよう。Bob が拒否したら、理由を、考えよう。',
    inv: () => [],
    makeWire: () => [pkt({ label: 'Alice の送金指示', body: ORIG3, hash: fnv(ORIG3) })],
    bob: (p) => (p.hash === fnv(p.body) ? ok(p) : no('Bob：指紋が合わない。改ざんされたと判断して、拒否しました')),
    goals: [
      { key: 'g1', text: '手紙を「拾って」、「書き換える」', test: (a) => a.S.flags.edit },
      { key: 'g2', text: '指紋を「計算する」→「合わせる」で付け直し、「取り替える」→「進める」。Bob に、書き換えた内容を、受け取らせる', test: (a) => logHas(a, (l) => l.res.ok && l.pkt.body !== ORIG3) },
    ],
    after: '指紋は、誰でも計算し直せた。Bob は、書き換えに、気づけない。',
  }],
};

// ---------- 4 妨害（元のステージ6） ----------
const MAC4 = (b) => ({ keyId: 'KM', tag: fnv(`KM|${b}`) });
const s4 = {
  id: 'a4', badge: 'ステージ 4', title: '正面が閉まっていたら、別の入口を探す', link: 'ステージ6（偽造）',
  who: 'mallory',
  principle: '正面が閉まっていたら、別の入口を探す。',
  defense: '改ざんを見抜けても、通信を止める・遅らせる攻撃は、別問題。期限切れや再送の仕組みも、一緒に考える。',
  phases: [{
    lead: 'この通信には、MAC（鍵を持つ人だけが作れる印）が付いています。Bob は、期限（3ステップ目まで）に、2通とも届かないと、送金を実行できません。',
    tools: ['pick', 'edit', 'compute', 'grab', 'delay', 'swap', 'combine', 'inspect'],
    start: 'まず、書き換えて、MAC を作り直せるか、試してみよう。',
    inv: () => [],
    makeWire: () => [
      pkt({ label: '①残高の確認', body: '残高を確認', mac: MAC4('残高を確認'), deadline: 3 }),
      pkt({ label: '②送金の指示', body: 'Bob に 1万円 送金', mac: MAC4('Bob に 1万円 送金'), deadline: 3 }),
    ],
    bob: (p, a, slot) => {
      if (slot.eta > p.deadline) return { ok: false, late: true, note: 'Bob：期限に、間に合いませんでした。送金は、行われませんでした' };
      if (!p.mac || p.mac.tag !== fnv(`KM|${p.body}`)) return no('Bob：MAC が合わない。偽物と判断して、拒否しました');
      return ok(p);
    },
    goals: [
      { key: 'g1', text: '「計算する」で MAC を作ろうとして、鍵がないと作れないことを、確かめる', test: (a) => a.S.flags.macFailed },
      { key: 'g2', text: '別の入口：「奪う」か「遅らせる」で、②送金の指示を、Bob に届かなくする', test: (a) => logHas(a, (l) => /送金/.test(l.pkt.body) && (l.res.missed || l.res.late)) },
    ],
    after: '偽造は、できなかった。でも、止めたり、遅らせたりは、できる。',
  }],
};

// ---------- 5 人をだます（元のステージ7とのつながり） ----------
const N1 = 'Bob の投稿「駅前のカフェ、最高」';
const N2 = 'Bob の口ぐせ「りょーかい！」';
const N3 = '二人は、よく夕食の話をする';
const cues5 = [
  { text: '急ぎだ、と焦らせる（+25）', v: 25 },
  { text: `Bob の口ぐせで書く（+20）`, v: 20, needs: N2 },
  { text: `二人だけの話題を入れる（+30）`, v: 30, needs: N3 },
  { text: '「電話で確認しないで」と、念を押す（+15）', v: 15 },
];
const compose5 = (final) => ({
  lead: '拾った情報から、手口を選びます。（架空の数値による、簡易モデルです）',
  cues: cues5,
  send: (sel, a) => {
    const p = Math.min(95, 10 + sel.reduce((s, i) => s + cues5[i].v, 0));
    a.flag('composed');
    if (final) { a.flag('blocked'); a.say(`Alice：「念のため、電話で確認するね」→ 本人に確認して、偽物と分かった。だまされる確率：5%`, 'ok'); }
    else if (p >= 60) { a.flag('fooled'); a.say(`Alice：「りょーかい！」と、合言葉を返信してしまった。だまされる確率：${p}%`, 'bad'); }
    else a.say(`Alice：「なんか変」と思って、電話で確かめた。だまされる確率：${p}%（手口が足りない）`, 'ok');
  },
});
const s5 = {
  id: 'a5', badge: 'ステージ 5', title: '人の信頼は、暗号より破りやすい', link: 'ステージ7（否認）とのつながり',
  who: 'mallory',
  principle: '人の信頼は、暗号より破りやすい。',
  defense: '急ぎ・いつもと違う頼みごとは、別の手段（電話・対面）で、本人に確かめる。手順として、決めておく。',
  phases: [
    {
      lead: 'Mallory は、暗号に触れず、Alice に「Bob のふりをした連絡」を送ります。Eve が拾った、公開の情報を、材料にしよう。',
      tools: ['pick', 'inspect', 'compose'],
      start: '落ちている情報を「拾って」から、「文面を作る」で、手口を選ぼう。',
      lying: () => [item({ kind: 'note', label: N1, text: 'SNS で、公開されている' }), item({ kind: 'note', label: N2, text: 'チャットの口調' }), item({ kind: 'note', label: N3, text: '公開の投稿から、分かる' })],
      makeWire: () => [pkt({ label: 'Alice の予定', body: '今夜、Bob と ごはん' })],
      bob: (p) => ok(p, 'Alice'),
      compose: compose5(false),
      goals: [
        { key: 'g1', text: '情報を、2つ以上「拾う」', test: (a) => ['pick:' + N1, 'pick:' + N2, 'pick:' + N3].filter((k) => a.S.flags[k]).length >= 2 },
        { key: 'g2', text: '「文面を作る」で、手口を選び、Alice に合言葉を返信させる（確率 60% 以上）', test: (a) => a.S.flags.fooled },
      ],
      after: '暗号は、1ビットも破られていない。Alice が、自分から、渡してしまった。',
    },
    {
      lead: '今度は、Alice が「別の手段で、本人に確かめる」ことにしました。同じ手口は、通じるでしょうか。',
      tools: ['pick', 'inspect', 'compose'],
      start: '同じ手口で、もう一度、試してみよう。',
      lying: () => [item({ kind: 'note', label: N1, text: 'SNS で、公開されている' }), item({ kind: 'note', label: N2, text: 'チャットの口調' }), item({ kind: 'note', label: N3, text: '公開の投稿から、分かる' })],
      makeWire: () => [pkt({ label: 'Alice の予定', body: '今夜、Bob と ごはん' })],
      bob: (p) => ok(p, 'Alice'),
      compose: compose5(true),
      goals: [{ key: 'g1', text: '「文面を作る」で、全部の手口を選んで、送ってみる。通じる？', test: (a) => a.S.flags.blocked }],
      after: '「別の手段で、確かめる」だけで、この攻撃は、ほとんど成り立たない。',
    },
  ],
};

// ---------- 6 偽の公開鍵（元のステージ8） ----------
const MALPUB_INV = () => item({ kind: 'key', label: 'マロリーの秘密鍵', keyId: 'MALPRIV', keyName: 'MALPRIV', opens: ['MALPUB'] });
function aliceRecv(p, a) {
  if (p.pubkey) {
    if (a.S.phaseKey === 'cert') {
      if (!p.cert) return no('Alice：証明書のない鍵は、受け取りません');
      if (p.cert.valid === false) return { ok: true, note: 'Alice：「この証明書は信頼できません」→ いつものように「続行」を押した', accepted: p.body };
    }
    return { ok: true, note: `Alice：「${p.body}」を、Bob の公開鍵として、受け取りました`, accepted: p.body };
  }
  return ok(p, 'Bob');
}
const reactAlice = (p, res, a) => {
  if (res.ok && p.pubkey) {
    a.S.recvKey = res.accepted;
    a.S.wire.push({ p: pkt({ label: 'Alice の秘密の連絡', body: '口座の合言葉は 7788', enc: { alg: 'rsa', keyId: res.accepted } }), eta: a.S.tick + 1, state: 'wait', id: `w${Math.random()}` });
  }
};
const s6 = {
  id: 'a6', badge: 'ステージ 6', title: '「信頼の出発点」を乗っ取る', link: 'ステージ8（偽の公開鍵）',
  who: 'mallory',
  principle: '信頼の出発点（公開鍵）を乗っ取れば、あとの暗号は、全部、こちらの味方になる。',
  defense: '公開鍵が本物か、証明書で確かめる。そして、警告が出たら、必ず止まる。',
  phases: [
    {
      lead: 'Alice が、Bob の公開鍵を取り寄せます。その鍵で、秘密の連絡を暗号化して送ります。公開鍵を、すり替えられたら？',
      tools: ['pick', 'swap', 'combine', 'inspect'],
      start: 'Bob の公開鍵を、持ち物のマロリーの公開鍵と、「取り替えて」みよう。',
      inv: () => [pkt({ label: 'マロリーの公開鍵', body: 'MALPUB', pubkey: true, from: 'mallory', to: 'alice' }), MALPUB_INV()],
      makeWire: () => [pkt({ label: 'Bob の公開鍵', body: 'BOBPUB', pubkey: true, from: 'bob', to: 'alice' })],
      bob: (p, a) => { a.S.phaseKey = 'plain'; if (p.enc) return p.enc.keyId === 'BOBPUB' ? ok(p) : no('Bob：復号できません'); return aliceRecv(p, a); },
      onDeliver: reactAlice,
      goals: [
        { key: 'g1', text: 'Bob の公開鍵を、マロリーの公開鍵と「取り替える」→「進める」', test: (a) => a.S.flags.swap },
        { key: 'g2', text: 'Alice の秘密の連絡を「拾って」、マロリーの秘密鍵と「合わせて」、読む', test: (a) => a.S.flags.decoded },
      ],
      after: '公開鍵を差し替えただけで、Alice の秘密の連絡は、Mallory に読まれた。',
    },
    {
      lead: '今度は、公開鍵に、証明書（本物だという保証）が付いています。Alice は、証明書のない鍵を、受け取りません。',
      tools: ['pick', 'swap', 'combine', 'inspect'],
      start: '証明書のない鍵は、通らないはず。他の入口はないか、公開ゾーンを調べよう。',
      inv: () => [
        pkt({ label: 'マロリーの公開鍵（証明書なし）', body: 'MALPUB', pubkey: true, from: 'mallory', to: 'alice' }),
        pkt({ label: 'マロリーの公開鍵（自己署名の証明書つき）', body: 'MALPUB', pubkey: true, from: 'mallory', to: 'alice', cert: { valid: false } }),
        MALPUB_INV(),
      ],
      lying: () => [item({ kind: 'note', label: 'Alice のスマホ画面の写真', text: '警告 → 続行', inspect: ['警告が出ても、いつも「続行」を押している。', '（Alice は、この癖を、自覚していない）'] })],
      makeWire: () => [pkt({ label: 'Bob の公開鍵', body: 'BOBPUB', pubkey: true, from: 'bob', to: 'alice', cert: { valid: true } })],
      bob: (p, a) => { a.S.phaseKey = 'cert'; if (p.enc) return p.enc.keyId === 'BOBPUB' ? ok(p) : no('Bob：復号できません'); return aliceRecv(p, a); },
      onDeliver: reactAlice,
      goals: [
        { key: 'g1', text: '公開ゾーンで、Alice の様子を「調べる」', test: (a) => a.S.flags['inspect:Alice のスマホ画面の写真'] },
        { key: 'g2', text: '手持ちの鍵を、うまく使って、Alice の秘密の連絡を読む', test: (a) => a.S.flags.decoded },
      ],
      after: '証明書は、破っていない。警告を無視する癖が、入口になった。',
    },
  ],
};

// ---------- 7 再送（元のステージ9） ----------
const ORIG7 = 'Bob に 1万円 送る';
const sig7 = (b, seq) => ({ signer: 'alice', tag: fnv(`sig|alice|${b}|${seq}`) });
const s7 = {
  id: 'a7', badge: 'ステージ 7', title: '作らなくても、本物を使い回せばよい', link: 'ステージ9（再送）',
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
      bob: (p) => (p.sig && p.sig.tag === fnv(`sig|alice|${p.body}|${p.seq}`) ? ok(p) : no('Bob：署名が合わない。拒否しました')),
      goals: [
        { key: 'g1', text: '署名つきの通信を、「拾う」', test: (a) => a.S.flags.pick },
        { key: 'g2', text: '「再送する」→「進める」で、Bob に、同じ送金を、2回、受け取らせる', test: (a) => a.S.log.filter((l) => l.pkt && l.res.ok && l.pkt.body === ORIG7).length >= 2 },
      ],
      after: '署名は、本物のまま。1万円が、二重に、送られてしまった。',
    },
    {
      lead: '今度は、通し番号が付きました。署名には、番号も含まれています。同じ手は、通じるでしょうか。',
      tools: ['pick', 'replay', 'edit', 'inspect'],
      start: '拾って、再送してみよう。番号を書き換えることは、できる？',
      inv: () => [],
      makeWire: (r) => { const n = r + 1; return [pkt({ label: '送金の指示（署名＋番号）', body: ORIG7, seq: n, sig: sig7(ORIG7, n) })]; },
      bob: (p, a) => {
        if (!p.sig || p.sig.tag !== fnv(`sig|alice|${p.body}|${p.seq}`)) return no('Bob：署名が合わない。拒否しました');
        if (a.S.log.some((l) => l.res.ok && l.pkt.seq === p.seq)) return no('Bob：この番号は、もう受け取りました。拒否しました');
        return ok(p);
      },
      goals: [{ key: 'g1', text: '「再送する」→「進める」。通じる？', test: (a) => logHas(a, (l) => l.pkt.replayed && !l.res.ok) }],
      after: '通し番号が付くと、再送は、見抜かれる。守りが、1つ増えると、攻撃の入口が、1つ減る。',
    },
  ],
};

// ---------- 8 継ぎ目を探す（元のステージ10） ----------
function buildRedteam() {
  const variants = [
    { name: '鍵の置き場所', spec: '守り：AES 暗号化。鍵の保管場所：共有フォルダ', phase: s1.phases[1] },
    { name: '指紋だけ', spec: '守り：本文＋指紋（ハッシュ）。鍵を使う守りは、なし', phase: s3.phases[0] },
    { name: '通し番号なし', spec: '守り：署名つき。通し番号は、なし', phase: s7.phases[0] },
  ];
  const v = variants[Math.floor(Math.random() * variants.length)];
  const ph = { ...v.phase };
  ph.lead = 'この回路には、1か所、穴があります（毎回、違う場所です）。仕様書を「調べて」、穴を見つけ、破ってみよう。';
  ph.start = '落ちている仕様書を、調べてみよう。';
  const baseLying = v.phase.lying ? v.phase.lying() : [];
  ph.lying = () => [...baseLying, item({ kind: 'note', label: 'このシステムの仕様書', text: '調べてください', inspect: [v.spec, '（ここまでの守りを、組み合わせたつもりの回路です）'] })];
  ph.goals = [{ key: 'g0', text: '仕様書を「調べて」、穴の場所を、見つける', test: (a) => a.S.flags['inspect:このシステムの仕様書'] }, ...v.phase.goals.map((g, i) => ({ ...g, key: `h${i}` }))];
  return {
    id: 'a8', badge: 'ステージ 8', title: '守りは、継ぎ目で崩れる', link: 'ステージ10（もう一度すべてを組む）',
    who: 'eve',
    principle: '守りは、組み合わせの継ぎ目で崩れる。',
    defense: '部品を足したら、「全部の攻撃に対して、穴がないか」を、通しで見直す。',
    phases: [ph],
  };
}

// ---------- 9 破れない相手（元のステージ11） ----------
const TLS_DATA = () => pkt({ label: 'TLS の通信', body: '送金：1万円', enc: { alg: 'tls13', keyId: 'TLSK' }, attackCost: 'ほぼ無限（10^51 年）' });
function tlsPhase(strict) {
  return {
    lead: strict
      ? '今度は、サーバーの設定が、きちんとしています。古い方式は、受け付けません。同じ手は、通じるでしょうか。'
      : 'TLS は、破れません。でも、接続のあいさつ（ハロー）で、「古い方式しか使えない」と偽ったら？',
    tools: ['pick', 'swap', 'try', 'inspect'],
    start: 'まず、サーバー設定の公開情報を「調べる」。',
    inv: () => [pkt({ label: 'ハロー（TLS 1.0 だけ、と偽る）', body: '対応方式：TLS 1.0 のみ', version: '1.0', from: 'mallory' })],
    lying: () => [item({ kind: 'note', label: 'サーバー設定の公開情報', text: '公開されている', inspect: strict ? ['TLS 1.3 / 1.2 のみ。古い方式は、受け付けない。'] : ['TLS 1.3 / 1.2 / 1.0（古い方式も、許可している）'] })],
    makeWire: () => (strict
      ? [pkt({ label: 'ハロー（接続のあいさつ）', body: '対応方式：TLS 1.3', version: '1.3' }), TLS_DATA()]
      : [pkt({ label: 'ハロー（接続のあいさつ）', body: '対応方式：TLS 1.3 / TLS 1.0', version: '1.3' })]),
    bob: (p) => {
      if (p.version) {
        if (p.version === '1.0' && strict) return no('サーバー：古い方式は、受け付けません。接続を、切りました');
        return { ok: true, note: `サーバー：TLS ${p.version} で、話しましょう`, ver: p.version };
      }
      return ok(p);
    },
    onDeliver: (p, res, a) => {
      if (!strict && res.ok && p.version) {
        a.S.wire.push({ p: pkt({ label: 'TLS の通信', body: '送金：1万円', enc: { alg: res.ver === '1.0' ? 'tls10' : 'tls13', keyId: 'TLSK' }, attackCost: res.ver === '1.0' ? '数秒（古い方式は、弱い）' : 'ほぼ無限（10^51 年）' }), eta: a.S.tick + 1, state: 'wait', id: `w${Math.random()}` });
      }
    },
    goals: strict
      ? [
        { key: 'g1', text: 'ハローを取り替えて、古い方式に下げさせてみる', test: (a) => logHas(a, (l) => l.pkt.version === '1.0' && !l.res.ok) },
        { key: 'g2', text: 'TLS の通信を「拾って」「試す」。解けるか？', test: (a) => a.S.flags['try:TLS の通信'] },
      ]
      : [
        { key: 'g1', text: 'ハローを「取り替えて」、古い方式（TLS 1.0）に、下げさせる', test: (a) => a.S.flags.swap },
        { key: 'g2', text: '続いて流れる TLS の通信を「拾って」「試す」で、読む', test: (a) => a.S.flags.decoded },
      ],
    after: strict ? '設定が正しければ、TLS は、破れない。だから攻撃者は、次に、何を狙うだろう？' : 'TLS を破ったのではない。古い方式を許す「設定」が、入口になった。',
  };
}
const s9 = {
  id: 'a9', badge: 'ステージ 9', title: '破れない相手には、設定を狙う', link: 'ステージ11（TLS）',
  who: 'eve',
  principle: '破れない相手には、設定を狙う。',
  defense: '強い仕組みを使っても、古い方式を許す設定のままだと、弱い方に下げられる。設定も、守りの一部。',
  phases: [tlsPhase(false), tlsPhase(true)],
};

// ---------- エピローグ 一番危険なのは、誰か ----------
const M = [
  ['モニターに貼られた付箋（パスワード）', '席を離れた間に、写真を撮られた。', 'パスワードが、写真に写ってしまった！'],
  ['ほかのサービスと同じ合言葉（使い回し）', '別のサービスから漏れた合言葉が、そのまま通じる。', '使い回しの合言葉で、そのまま、入られた！'],
  ['宛先を確認せずに送ったメール', 'Bob 宛のつもりが、似た名前の別人に届いた。', '秘密の資料が、別人に、届いてしまった！'],
  ['閉じられた警告ダイアログ（「いつもの」）', '警告を、読まずに閉じた。', '警告を無視した間に、攻撃が、通った！'],
  ['初期設定のままの管理画面（admin / admin）', '設定を変えずに、公開してしまった。', '初期パスワードで、そのまま入られた！'],
];
const epilogue = {
  id: 'a10', badge: 'エピローグ', title: '一番危険なのは、誰か', link: '',
  who: 'mallory',
  principle: '人は、ミスをする。だから、ミスをしないよう頑張るのではなく、ミスをしても大事にならない仕組みを作る。',
  defense: '二要素認証・送信前の確認・警告をすぐ閉じさせない設計・最小限の権限。人を責めるより、仕組みで、被害を小さくする。',
  questions: ['どの手が一番安い？', 'どこで、人が、ミスをしている？', '守る側は、何を仕組みにできる？'],
  phases: [{
    lead: 'Alice と Bob の通信は、AES と TLS で、守られています。攻撃者の予算は、限られています。どの手を、選びますか。',
    tools: ['pick', 'try', 'inspect'],
    start: 'まず「いまの予算」を調べて、手間を比べよう。',
    inv: () => [],
    lying: () => [
      item({ kind: 'note', label: 'いまの予算（見積もり）', text: '調べてください', inspect: ['暗号を破る：約 10^51 年。予算を、はるかに超える。', '設定の穴を探す：数時間〜数日。', '人のミスを待つ：待つだけ。ほぼ無料。'] }),
      ...M.map(([label, ins, leak]) => item({ kind: 'note', label, text: ins, inspect: [ins, '暗号は、1ビットも破っていない。'], onPick: (a) => a.say(leak, 'bad') })),
    ],
    makeWire: () => [pkt({ label: 'Alice と Bob の通信（AES・TLS 1.3）', body: 'ひみつの はなし', enc: { alg: 'tls13', keyId: 'TLSK' }, attackCost: 'ほぼ無限（10^51 年）' })],
    bob: (p) => ok(p),
    goals: [
      { key: 'g1', text: '「いまの予算」を「調べて」、一番安い手を、見つける', test: (a) => a.S.flags['inspect:いまの予算（見積もり）'] },
      { key: 'g2', text: '「ふだんの1日」に落ちている、5つのミスを、全部「拾う」', test: (a) => M.every(([l]) => a.S.flags[`pick:${l}`]) },
    ],
    after: '5つとも、暗号は、破っていない。人のミスだけで、通信は、漏れた。',
  }],
};

export const ATK_STAGES = [
  { id: 'a0', title: '入門：攻撃者は、何が見えて、何ができる？', theme: '何が見えて、何ができるか', build: () => intro },
  { id: 'a1', title: '1　破れる所から破る', theme: '強い暗号は避けて、鍵を狙う', build: () => s1 },
  { id: 'a2', title: '2　一番弱い輪', theme: '鎖は、一番弱い輪で切れる', build: () => s2 },
  { id: 'a3', title: '3　書き換え', theme: '守りが、何を守っているかを見る', build: () => s3 },
  { id: 'a4', title: '4　妨害', theme: '正面が閉まっていたら、別の入口', build: () => s4 },
  { id: 'a5', title: '5　人をだます', theme: '人の信頼は、暗号より破りやすい', build: () => s5 },
  { id: 'a6', title: '6　偽の公開鍵', theme: '信頼の出発点を乗っ取る', build: () => s6 },
  { id: 'a7', title: '7　再送', theme: '本物を使い回す', build: () => s7 },
  { id: 'a8', title: '8　継ぎ目を探す', theme: '守りは、継ぎ目で崩れる', build: buildRedteam },
  { id: 'a9', title: '9　破れない相手', theme: '破れない相手には、設定を狙う', build: () => s9 },
  { id: 'a10', title: 'エピローグ　一番危険なのは、誰か', theme: '人は、ミスをする', build: () => epilogue },
];
