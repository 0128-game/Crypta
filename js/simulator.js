// simulator.js
// 全ステージ共通のシミュレータ本体
//
// 構成:
//   1. 定義        : 攻撃者の能力・アルゴリズム・コンポーネントのテーブル
//   2. 状態とユーティリティ
//   3. データ（パケット）: 暗号化の見た目・色
//   4. 操作        : ノード追加/削除、ドラッグ、線のつなぎ方
//   5. 描画        : ノード・線・条件パネル
//   6. 評価        : 通信をたどって（トレース）、Eve の様子と評価を求める
//   7. アニメーション: トレースを電気が流れる様子として再生する
//   8. 結果表示
//   9. 起動
//
// 評価ロジック（6）は大きくなったら js/evaluator.js に切り出す想定。

// 名前付き import だと、stages.js に export が無いときモジュール全体が起動しなくなる。
// 名前空間 import にして、足りない場合は個別に扱う。
import * as stagesModule from './stages.js';

const STAGE_IDS = stagesModule.STAGE_IDS ?? [];
const PROGRESS_KEY = 'crypta:progress';

/* ==========================================================
   1. 定義
   ========================================================== */

// データの色
const COLORS = {
  plain: '#ff8a1f',   // 元のデータ（暗号化されていない）
  garbled: '#8c93a8', // 意味のないデータ（復号の失敗など）
  key: '#a35cf0',     // 鍵
  cipherFallback: '#8a63d2',
};

// 攻撃者の計算能力。数字が大きいほど強い。
const COMPUTE = {
  observer: { level: 0, label: '観測するだけ' },
  human: { level: 1, label: '手作業で解析できる' },
  computer: { level: 2, label: 'コンピュータで解析できる' },
};

// アルゴリズム。breakLevel 以上の計算能力を持つ攻撃者に破られる。
// 暗号化されたデータは color の色で流れる。（数値は仮置き。ステージを作りながら調整する）
const ALGORITHMS = {
  caesar: {
    label: 'シーザー暗号',
    short: 'Caesar',
    color: '#19b394',
    breakLevel: 1,
    weakness: 'ずらし幅が25通りしかないので、解析されるとすぐに破られます。',
  },
  aes: {
    label: 'AES',
    short: 'AES',
    color: '#4c6fff',
    breakLevel: Infinity,
    weakness: '',
  },
};

const REQUIREMENTS = {
  confidentiality: { label: '機密性', desc: '盗聴者に内容を読まれない' },
  integrity: { label: '完全性', desc: '途中で改ざんされない' },
  authenticity: { label: '真正性', desc: '本当に相手からの通信だとわかる' },
};

const ATTACKERS = {
  eve: { label: 'Eve', role: '盗聴', className: 'badge-eve' },
  mallory: { label: 'Mallory', role: '改ざん', className: 'badge-mallory' },
};

const CAP_LABELS = {
  compute: '計算能力',
  observedMessages: '見られる通信',
  knownInfo: '知っている情報',
  observationScope: '観測できる範囲',
};
const SCOPE_LABELS = { channel: '通信路' };

// コンポーネント定義
//   movable   : false なら動かせない（既定 true）
//   removable : false なら削除できない（既定 true）
//   palette   : false なら下の一覧に出さない（既定 true）
const DATA = 'data';
const KEY = 'key';

const COMPONENTS = {
  alice: {
    label: 'Alice',
    avatar: 'A',
    removable: false,
    palette: false,
    inputs: [],
    outputs: [{ id: 'out', type: DATA, label: 'メッセージ' }],
  },
  bob: {
    label: 'Bob',
    avatar: 'B',
    removable: false,
    palette: false,
    inputs: [{ id: 'in', type: DATA, label: 'メッセージ' }],
    outputs: [],
  },
  channel: {
    label: '通信路',
    removable: false,
    palette: false,
    inputs: [{ id: 'in', type: DATA, label: '' }],
    outputs: [{ id: 'out', type: DATA, label: '' }],
  },
  encrypt: {
    label: '暗号化',
    desc: '読めない形にする',
    hasAlgorithm: true,
    inputs: [
      { id: 'data', type: DATA, label: 'データ' },
      { id: 'key', type: KEY, label: '鍵' },
    ],
    outputs: [{ id: 'out', type: DATA, label: '暗号文' }],
  },
  decrypt: {
    label: '復号',
    desc: '元の形に戻す',
    hasAlgorithm: true,
    inputs: [
      { id: 'data', type: DATA, label: '暗号文' },
      { id: 'key', type: KEY, label: '鍵' },
    ],
    outputs: [{ id: 'out', type: DATA, label: 'データ' }],
  },
  key: {
    label: '鍵',
    desc: '暗号化・復号に使う秘密',
    inputs: [],
    outputs: [{ id: 'out', type: KEY, label: '鍵' }],
  },
};

/* ==========================================================
   2. 状態とユーティリティ
   ========================================================== */

let stage = null;
let graph = { nodes: [], edges: [] };
let seq = 0;
let pending = null;          // タップでつなぐ途中の出力ポート { node, port, type }
let activeObjective = 'A';   // 攻撃者の強さをどの Objective で見るか

const dom = {};
const edgeEls = new Map();    // edgeId → { line, energy, len }
const energyState = new Map(); // edgeId → 色（電気が通った線）

const $ = (selector) => document.querySelector(selector);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nextId(prefix) {
  seq += 1;
  return `${prefix}${seq}`;
}

function findNode(id) {
  return graph.nodes.find((n) => n.id === id);
}

function nodeElOf(id) {
  return dom.board.querySelector(`.node[data-id="${id}"]`);
}

function algorithmInfo(id) {
  return (
    ALGORITHMS[id] ?? {
      label: id ?? '不明',
      short: id ?? '?',
      color: COLORS.cipherFallback,
      breakLevel: Infinity,
      weakness: '',
    }
  );
}

function computeInfo(id) {
  if (!(id in COMPUTE)) {
    console.warn(`[simulator] 未知の compute: ${id}（observer として扱います）`);
    return COMPUTE.observer;
  }
  return COMPUTE[id];
}

function capsFor(objectiveKey) {
  const override = stage.objectives[objectiveKey]?.attackerOverride ?? {};
  return { ...(stage.attacker?.capabilities ?? {}), ...override };
}

function initialGraph() {
  const W = dom.board.clientWidth || 900;
  const H = dom.board.clientHeight || 600;

  // 通信路（背が高い）が、下の部品バーにかぶらない高さに置く
  const barH = dom.paletteBar?.offsetHeight || 120;
  const channelH = 260;
  const channelY = Math.max(70, H - barH - 28 - channelH);

  // 条件パネルを開いていて、横幅に余裕があるときは、パネルの右から並べる
  const side = Math.max(24, Math.round(W * 0.04));
  const panel = overlayRect(dom.briefPanel);
  const needed = 150 + 236 + 150 + 120; // Alice + 通信路 + Bob + すきま
  let left = side;
  if (panel && !dom.briefPanel.classList.contains('is-collapsed')) {
    const afterPanel = Math.round(panel.x + panel.w + 36);
    if (W - afterPanel - side >= needed) left = afterPanel;
  }
  const bobX = Math.max(0, W - side - 150);

  // 横幅が足りない画面（スマホなど）では、左上 → 中央 → 右下とずらして並べる
  if (W < needed + 40) {
    const aliceY = 135;
    const chY = aliceY + 110;
    return {
      nodes: [
        { id: 'alice', type: 'alice', x: 12, y: aliceY, params: {} },
        { id: 'channel', type: 'channel', x: Math.max(0, Math.round((W - 236) / 2)), y: chY, params: {} },
        { id: 'bob', type: 'bob', x: Math.max(0, W - 12 - 150), y: chY + channelH + 12, params: {} },
      ],
      edges: [],
    };
  }

  return {
    nodes: [
      { id: 'alice', type: 'alice', x: left, y: channelY, params: {} },
      {
        id: 'channel',
        type: 'channel',
        x: Math.max(0, Math.round((left + 150 + bobX) / 2 - 118)),
        y: channelY,
        params: {},
      },
      { id: 'bob', type: 'bob', x: bobX, y: channelY, params: {} },
    ],
    edges: [],
  };
}

/* ==========================================================
   3. データ（パケット）の見た目
   ========================================================== */
// packet = { layers: [{ alg, keyId }], garbled, viaChannel }
//   layers が空で garbled でなければ「元のデータ」。
//   暗号化するたびに layers の末尾へ積まれ、復号で外れる。

const newPacket = () => ({ layers: [], garbled: false, viaChannel: false });
const isReadable = (p) => !p.garbled && p.layers.length === 0;

function stageMessage() {
  return stage?.message ?? 'HELLO';
}

function caesar(text, shift) {
  return text.replace(/[A-Za-z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
  });
}

// 暗号文の見た目をそれらしく作る（本物の暗号ではなく、表示用）
function mockEncrypt(alg, text, keyId) {
  if (alg === 'caesar') return caesar(text, 3);
  let seed = 2166136261;
  for (const ch of `${alg}|${keyId}|${text}`) {
    seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  const bytes = [];
  for (let i = 0; i < 5; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    bytes.push((seed >>> 24).toString(16).padStart(2, '0'));
  }
  return `${bytes.join(' ')}…`;
}

function packetText(packet) {
  if (packet.garbled) return '▒▒▒▒▒';
  return packet.layers.reduce((text, l) => mockEncrypt(l.alg, text, l.keyId), stageMessage());
}

function packetColor(packet) {
  if (packet.garbled) return COLORS.garbled;
  if (packet.layers.length === 0) return COLORS.plain;
  return algorithmInfo(packet.layers[packet.layers.length - 1].alg).color;
}

function packetKindLabel(packet) {
  if (packet.garbled) return '意味のないデータ';
  if (packet.layers.length === 0) return '元のデータ';
  return `暗号文（${algorithmInfo(packet.layers[packet.layers.length - 1].alg).short}）`;
}

/* ==========================================================
   4. 操作
   ========================================================== */

function addNode(type, x, y) {
  const def = COMPONENTS[type];
  const node = { id: nextId(type), type, x, y, params: {} };
  if (def.hasAlgorithm) node.params.algorithm = stage.algorithms[0];
  graph.nodes.push(node);
  renderNodes();
  onGraphChanged();
  return node;
}

function removeNode(id) {
  graph.nodes = graph.nodes.filter((n) => n.id !== id);
  graph.edges = graph.edges.filter((e) => e.from.node !== id && e.to.node !== id);
  renderNodes();
  onGraphChanged();
}

function removeEdge(id) {
  graph.edges = graph.edges.filter((e) => e.id !== id);
  renderEdges();
  onGraphChanged();
}

function getPortDef(nodeId, portId, dir) {
  const node = findNode(nodeId);
  if (!node) return null;
  const list = dir === 'in' ? COMPONENTS[node.type].inputs : COMPONENTS[node.type].outputs;
  return list.find((p) => p.id === portId) ?? null;
}

// from: { node, port, type } / toEl: 入力ポートの要素
function isCompatible(from, toEl) {
  return Boolean(
    toEl &&
      toEl.dataset.dir === 'in' &&
      toEl.dataset.type === from.type &&
      toEl.dataset.node !== from.node
  );
}

function connect(from, toEl) {
  const to = { node: toEl.dataset.node, port: toEl.dataset.port };
  if (!getPortDef(to.node, to.port, 'in')) return;
  // 入力ポートにつながる線は1本だけ。つなぎ直したら置き換える。
  graph.edges = graph.edges.filter((e) => !(e.to.node === to.node && e.to.port === to.port));
  graph.edges.push({
    id: nextId('edge'),
    type: from.type,
    from: { node: from.node, port: from.port },
    to,
  });
  renderEdges();
  onGraphChanged();
}

function clearPending() {
  pending = null;
  clearPortMarks();
}

function clearPortMarks() {
  dom.board
    .querySelectorAll('.port.is-target, .port.is-pending')
    .forEach((p) => p.classList.remove('is-target', 'is-pending'));
}

function markTargets(from) {
  dom.board.querySelectorAll('.port[data-dir="in"]').forEach((p) => {
    if (isCompatible(from, p)) p.classList.add('is-target');
  });
}

// --- 出力ポートからのドラッグ（またはタップ）で線をつなぐ ---
function startConnect(e, from, portEl) {
  e.preventDefault();
  e.stopPropagation();

  clearPending();
  markTargets(from);

  const start = { x: e.clientX, y: e.clientY };
  let moved = false;

  const onMove = (ev) => {
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 4) moved = true;
    if (moved) drawTempEdge(from, ev.clientX, ev.clientY);
  };

  const onUp = (ev) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    clearTempEdge();

    if (moved) {
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.port');
      clearPortMarks();
      if (isCompatible(from, target)) connect(from, target);
    } else {
      // タップ: つなぎ先の入力ポートが選ばれるのを待つ
      pending = from;
      portEl.classList.add('is-pending');
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// キーボード操作（Enter/Space）でのポート選択
function togglePendingByKeyboard(from, portEl) {
  if (pending && pending.node === from.node && pending.port === from.port) {
    clearPending();
    return;
  }
  clearPending();
  pending = from;
  portEl.classList.add('is-pending');
  markTargets(from);
}

// --- ノードのドラッグ移動 ---
function startNodeDrag(e, node, nodeEl) {
  e.preventDefault();
  const boardRect = dom.board.getBoundingClientRect();
  const offX = e.clientX - boardRect.left - node.x;
  const offY = e.clientY - boardRect.top - node.y;
  nodeEl.classList.add('is-dragging');

  const onMove = (ev) => {
    const rect = dom.board.getBoundingClientRect();
    const maxX = Math.max(0, dom.board.clientWidth - nodeEl.offsetWidth);
    const maxY = Math.max(0, dom.board.clientHeight - nodeEl.offsetHeight);
    node.x = clamp(ev.clientX - rect.left - offX, 0, maxX);
    node.y = clamp(ev.clientY - rect.top - offY, 0, maxY);
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    renderEdges();
  };

  const onUp = () => {
    nodeEl.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// 画面サイズが変わったとき、はみ出したノードを中に戻す
function clampAllNodes() {
  graph.nodes.forEach((node) => {
    const nodeEl = nodeElOf(node.id);
    if (!nodeEl) return;
    node.x = clamp(node.x, 0, Math.max(0, dom.board.clientWidth - nodeEl.offsetWidth));
    node.y = clamp(node.y, 0, Math.max(0, dom.board.clientHeight - nodeEl.offsetHeight));
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
  });
  renderEdges();
}

// --- コンポーネント一覧からのドラッグ配置（クリックなら空いている場所に置く） ---
let suppressPaletteClick = false;

function startPaletteDrag(e, type, label) {
  if (e.button !== undefined && e.button !== 0) return;
  const start = { x: e.clientX, y: e.clientY };
  let ghost = null;

  const onMove = (ev) => {
    if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
      ghost = el('div', 'drag-ghost', label);
      document.body.append(ghost);
    }
    if (ghost) {
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
    }
  };

  const onUp = (ev) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (!ghost) return; // 動いていない → click イベントに任せる

    ghost.remove();
    suppressPaletteClick = true;
    setTimeout(() => { suppressPaletteClick = false; }, 0);

    const rect = dom.board.getBoundingClientRect();
    const inside =
      ev.clientX >= rect.left && ev.clientX <= rect.right &&
      ev.clientY >= rect.top && ev.clientY <= rect.bottom;
    if (inside) {
      const x = clamp(ev.clientX - rect.left - 76, 0, Math.max(0, dom.board.clientWidth - 152));
      const y = clamp(ev.clientY - rect.top - 40, 0, Math.max(0, dom.board.clientHeight - 110));
      addNode(type, x, y);
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// 重ねて表示している要素（条件パネルなど）のキャンバス上の位置
function overlayRect(element) {
  if (!element || !element.offsetParent) return null;
  const r = element.getBoundingClientRect();
  const b = dom.board.getBoundingClientRect();
  return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
}

// クリック・キーボードで置くときの位置（既存のノードや重ねた要素と重ならない所）
function findFreePosition() {
  const W = dom.board.clientWidth;
  const H = dom.board.clientHeight;
  const w = 152;
  const h = 130;

  const blocked = graph.nodes.map((n) => {
    const e = nodeElOf(n.id);
    return { x: n.x, y: n.y, w: e?.offsetWidth ?? w, h: e?.offsetHeight ?? h };
  });
  [dom.sideStack, dom.toolbar, dom.paletteBar].forEach((overlay) => {
    const r = overlayRect(overlay);
    if (r) blocked.push(r);
  });

  for (let y = 70; y + h <= H - 10; y += 70) {
    for (let x = 20; x + w <= W - 10; x += 80) {
      const hit = blocked.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
      if (!hit) return { x, y };
    }
  }
  return { x: 40 + (graph.nodes.length % 6) * 30, y: 90 + (graph.nodes.length % 5) * 30 };
}

// グラフが変わったら、前の結果は古くなる
function onGraphChanged() {
  hideResult();
  clearOutcome();
}

/* ==========================================================
   5. 描画
   ========================================================== */

function renderNodes() {
  clearPending();
  dom.board.querySelectorAll('.node').forEach((n) => n.remove());
  graph.nodes.forEach((node) => dom.board.append(createNodeEl(node)));
  refreshEveCaps();
  renderEdges();
}

function createNodeEl(node) {
  const def = COMPONENTS[node.type];

  const root = el('div', `node node-${node.type}`);
  root.dataset.id = node.id;
  root.style.left = `${node.x}px`;
  root.style.top = `${node.y}px`;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', def.label);

  // ヘッダー
  const head = el('div', 'node-head');
  if (def.avatar) head.append(el('span', 'node-avatar', def.avatar));
  head.append(el('span', 'node-title', def.label));
  if (def.removable !== false) {
    const remove = el('button', 'node-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `${def.label}を削除`);
    remove.addEventListener('click', () => removeNode(node.id));
    head.append(remove);
  }
  root.append(head);

  // アルゴリズム選択
  if (def.hasAlgorithm) {
    if (stage.algorithms.length > 1) {
      const select = el('select', 'node-algo');
      select.setAttribute('aria-label', `${def.label}のアルゴリズム`);
      stage.algorithms.forEach((id) => {
        const opt = el('option', null, algorithmInfo(id).label);
        opt.value = id;
        opt.selected = id === node.params.algorithm;
        select.append(opt);
      });
      select.addEventListener('change', () => {
        node.params.algorithm = select.value;
        onGraphChanged();
      });
      root.append(select);
    } else {
      root.append(el('span', 'node-algo-fixed', algorithmInfo(node.params.algorithm).label));
    }
  }

  if (node.type === 'channel') {
    buildChannelBody(root, node);
  } else {
    def.inputs.forEach((port) => root.append(createPortRow(node, port, 'in')));
    def.outputs.forEach((port) => root.append(createPortRow(node, port, 'out')));
    if (node.type !== 'key') root.append(createPacketChip());
  }

  // ドラッグ移動
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.port, select, .node-remove')) return;
    startNodeDrag(e, node, root);
  });

  return root;
}

function createPacketChip() {
  const chip = el('div', 'node-packet');
  chip.hidden = true;
  chip.append(el('span', 'packet-dot'), el('span', 'packet-text'));
  return chip;
}

// 通信路: 中を流れるデータと、Eve の「盗む → 解析する」を見せる
function buildChannelBody(root, node) {
  const def = COMPONENTS.channel;

  const tube = el('div', 'tube');
  const slot = el('div', 'tube-packet');
  slot.append(el('span', 'packet-dot'), el('span', 'packet-text', '—'));
  tube.append(
    createPortRow(node, def.inputs[0], 'in'),
    slot,
    createPortRow(node, def.outputs[0], 'out')
  );
  root.append(tube);

  const keys = attackerKeys(stage);
  if (keys.includes('eve')) {
    root.append(el('div', 'tap-line'));

    const box = el('div', 'eve-box');
    const head = el('div', 'eve-head');
    head.append(el('span', 'badge badge-eve', 'Eve'), el('span', 'eve-caps'));
    box.append(head);

    box.append(createEveRow('傍受', 'capture'), createEveRow('解析', 'analysis'));

    const copy = el('div', 'eve-copy');
    copy.hidden = true;
    copy.append(el('span', 'packet-dot'), el('span', 'packet-text'));
    box.append(copy);
    root.append(box);
  }
  if (keys.includes('mallory')) {
    root.append(el('p', 'eve-note', 'Mallory の改ざんは、このシミュレータではまだ判定されません。'));
  }
}

function createEveRow(label, row) {
  const wrap = el('div', 'eve-row');
  wrap.dataset.row = row;
  wrap.append(el('span', 'eve-label', label), el('span', 'eve-value', '待機中'));
  return wrap;
}

function createPortRow(node, port, dir) {
  const def = COMPONENTS[node.type];
  const row = el('div', `port-row port-${dir}`);

  const btn = el('button', `port port-type-${port.type}`);
  btn.type = 'button';
  btn.dataset.node = node.id;
  btn.dataset.port = port.id;
  btn.dataset.dir = dir;
  btn.dataset.type = port.type;
  btn.setAttribute(
    'aria-label',
    `${def.label}の${port.label || (dir === 'in' ? '入口' : '出口')}（${dir === 'in' ? '入力' : '出力'}）`
  );

  const from = { node: node.id, port: port.id, type: port.type };

  if (dir === 'out') {
    btn.addEventListener('pointerdown', (e) => startConnect(e, from, btn));
    // マウス・タッチは pointerdown で処理済み。キーボードのクリック(detail=0)だけここで扱う。
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) togglePendingByKeyboard(from, btn);
    });
  } else {
    btn.addEventListener('click', () => {
      if (pending && isCompatible(pending, btn)) {
        connect(pending, btn);
        clearPending();
      }
    });
  }

  row.append(btn);
  if (port.label) row.append(el('span', 'port-label', port.label));
  return row;
}

function portCenter(nodeId, portId, dir) {
  const p = dom.board.querySelector(
    `.port[data-node="${nodeId}"][data-port="${portId}"][data-dir="${dir}"]`
  );
  if (!p) return null;
  const r = p.getBoundingClientRect();
  const b = dom.board.getBoundingClientRect();
  return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
}

// 直線だけで作る S 字の配線（横 → 縦 → 横）
function route(a, b) {
  const stub = 24;
  const ax = Math.round(a.x);
  const ay = Math.round(a.y);
  const bx = Math.round(b.x);
  const by = Math.round(b.y);

  if (bx - ax >= stub * 2) {
    const mx = Math.round((ax + bx) / 2);
    return `M ${ax} ${ay} H ${mx} V ${by} H ${bx}`;
  }
  // 戻る向きや近すぎる場合は、いったん外へ出てから回り込む
  let my = Math.round((ay + by) / 2);
  if (Math.abs(ay - by) < 60) my = ay + 90;
  return `M ${ax} ${ay} H ${ax + stub} V ${my} H ${bx - stub} V ${by} H ${bx}`;
}

function renderEdges() {
  if (!dom.edgeLayer) return;
  dom.edgeLayer.replaceChildren();
  edgeEls.clear();

  graph.edges.forEach((edge) => {
    const a = portCenter(edge.from.node, edge.from.port, 'out');
    const b = portCenter(edge.to.node, edge.to.port, 'in');
    if (!a || !b) return;
    const d = route(a, b);

    const g = svgEl('g', { class: `edge edge-${edge.type}` });
    const title = svgEl('title');
    title.textContent = 'クリックで線を消す';
    const line = svgEl('path', { class: 'edge-line', d });
    const energy = svgEl('path', { class: 'edge-energy', d });
    const hit = svgEl('path', { class: 'edge-hit', d });
    g.append(title, line, energy, hit);
    g.addEventListener('click', () => removeEdge(edge.id));
    dom.edgeLayer.append(g);

    const len = line.getTotalLength();
    edgeEls.set(edge.id, { line, energy, len });

    // すでに電気が通った線は、そのまま色をつけて残す
    const color = energyState.get(edge.id);
    if (color) {
      energy.setAttribute('stroke', color);
      energy.style.filter = `drop-shadow(0 0 3px ${color})`;
    } else {
      energy.style.display = 'none';
    }
  });
}

function drawTempEdge(from, clientX, clientY) {
  const a = portCenter(from.node, from.port, 'out');
  if (!a) return;
  const b = dom.board.getBoundingClientRect();
  const end = { x: clientX - b.left, y: clientY - b.top };
  dom.tempLayer.replaceChildren(svgEl('path', { class: 'edge-temp', d: route(a, end) }));
}

function clearTempEdge() {
  dom.tempLayer.replaceChildren();
}

// --- コンポーネント一覧 ---
function renderPalette() {
  dom.palette.replaceChildren();
  stage.components.forEach((type) => {
    const def = COMPONENTS[type];
    if (!def || def.palette === false) {
      console.warn(`[simulator] 一覧に出せないコンポーネント: ${type}`);
      return;
    }
    const btn = el('button', `palette-item palette-${type}`);
    btn.type = 'button';
    btn.append(el('strong', null, def.label), el('span', null, def.desc ?? ''));
    btn.addEventListener('pointerdown', (e) => startPaletteDrag(e, type, def.label));
    btn.addEventListener('click', () => {
      if (suppressPaletteClick) return;
      const pos = findFreePosition();
      addNode(type, pos.x, pos.y);
    });
    dom.palette.append(btn);
  });
}

// --- 凡例（データの色） ---
function renderLegend() {
  dom.legend.replaceChildren();
  const items = [
    { label: '元のデータ', color: COLORS.plain },
    ...stage.algorithms.map((id) => ({
      label: `暗号文（${algorithmInfo(id).short}）`,
      color: algorithmInfo(id).color,
    })),
    { label: '鍵', color: COLORS.key },
    { label: '意味のないデータ', color: COLORS.garbled },
  ];
  items.forEach((item) => {
    const li = el('li');
    const dot = el('span', 'legend-dot');
    dot.style.setProperty('--chip', item.color);
    li.append(dot, el('span', null, item.label));
    dom.legend.append(li);
  });
}

// --- ステージの条件パネル ---
function attackerKeys(s) {
  const type = String(s.attacker?.type ?? '').toLowerCase();
  return type.split(/[+,&\s]+/).filter((key) => key in ATTACKERS);
}

function capText(key, value) {
  switch (key) {
    case 'compute':
      return computeInfo(value).label;
    case 'observedMessages':
      return `${value}通`;
    case 'knownInfo':
      return Array.isArray(value) && value.length > 0 ? value.join('、') : 'なし';
    case 'observationScope':
      return SCOPE_LABELS[value] ?? String(value);
    default:
      return String(value);
  }
}

function requirementsText(list) {
  return (list ?? [])
    .map((r) => {
      const info = REQUIREMENTS[r];
      return info ? `${info.label}（${info.desc}）` : r;
    })
    .join('、');
}

function renderBrief() {
  const title = stage.title ?? stage.id;
  document.title = `CRYPTA | ${title}`;
  $('#stage-title').textContent = title;
  $('#stage-goal').textContent = stage.goal ?? '';

  const badges = $('#attacker-badges');
  badges.replaceChildren();
  attackerKeys(stage).forEach((key) => {
    const a = ATTACKERS[key];
    badges.append(el('span', `badge ${a.className}`, `${a.label}（${a.role}）`));
  });

  const dl = $('#attacker-caps');
  dl.replaceChildren();
  Object.entries(stage.attacker?.capabilities ?? {}).forEach(([key, value]) => {
    dl.append(el('dt', null, CAP_LABELS[key] ?? key), el('dd', null, capText(key, value)));
  });

  const list = $('#objective-list');
  list.replaceChildren();
  Object.entries(stage.objectives).forEach(([key, obj]) => {
    const li = el('li', 'objective');
    li.append(el('span', 'objective-mark', key));
    const body = el('div');
    body.append(el('p', 'objective-title', requirementsText(obj.require) || '（条件なし）'));
    if (obj.attackerOverride) {
      const changes = Object.entries(obj.attackerOverride)
        .map(([k, v]) => `${CAP_LABELS[k] ?? k}が「${capText(k, v)}」`)
        .join('、');
      body.append(el('p', 'objective-note', `攻撃者が強くなります: ${changes}`));
    }
    li.append(body);
    list.append(li);
  });
}

function setBriefCollapsed(collapsed) {
  dom.briefPanel.classList.toggle('is-collapsed', collapsed);
  dom.briefToggle.setAttribute('aria-expanded', String(!collapsed));
  dom.briefToggle.textContent = collapsed ? '条件を見る' : '隠す';
}

// 「どの攻撃者の強さで見るか」の切り替え（Objective が複数あるときだけ）
function renderObjectiveToggle() {
  const keys = Object.keys(stage.objectives);
  const box = dom.objectiveToggle;
  box.replaceChildren();
  box.hidden = keys.length < 2;
  if (keys.length < 2) return;

  box.append(el('span', null, '攻撃者'));
  keys.forEach((key) => {
    const btn = el('button', 'segmented-btn', key);
    btn.type = 'button';
    btn.title = `Objective ${key} の攻撃者の強さで見る`;
    btn.setAttribute('aria-pressed', String(key === activeObjective));
    btn.addEventListener('click', () => {
      if (sim.running) return;
      activeObjective = key;
      box.querySelectorAll('.segmented-btn').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.textContent === key))
      );
      hideResult();
      clearOutcome();
      refreshEveCaps();
    });
    box.append(btn);
  });
}

// 通信路の Eve 欄に、いま見ている攻撃者の計算能力を出す
function refreshEveCaps() {
  const text = `計算能力: ${capText('compute', capsFor(activeObjective).compute)}`;
  dom.board.querySelectorAll('.eve-caps').forEach((n) => { n.textContent = text; });
}

/* ==========================================================
   6. 評価
   ========================================================== */

// --- 6-1. トレース: Alice から出たデータが、線に沿って実際にどう流れるか ---
function keyOf(node) {
  const e = graph.edges.find((x) => x.type === KEY && x.to.node === node.id);
  return e ? e.from.node : null;
}

function processNode(node, packet) {
  switch (node.type) {
    case 'encrypt': {
      const keyId = keyOf(node);
      if (!keyId) {
        return { kind: 'transform', blocked: true, out: null, reason: '鍵がつながっていないので暗号化できません。' };
      }
      return {
        kind: 'transform',
        out: { ...packet, layers: [...packet.layers, { alg: node.params.algorithm, keyId }] },
      };
    }
    case 'decrypt': {
      const keyId = keyOf(node);
      if (!keyId) {
        return { kind: 'transform', blocked: true, out: null, reason: '鍵がつながっていないので復号できません。' };
      }
      const top = packet.layers[packet.layers.length - 1];
      const ok = !packet.garbled && top && top.alg === node.params.algorithm && top.keyId === keyId;
      return {
        kind: 'transform',
        out: ok
          ? { ...packet, layers: packet.layers.slice(0, -1) }
          : { ...packet, layers: [], garbled: true },
      };
    }
    case 'channel':
      return { kind: 'channel', out: { ...packet, viaChannel: true } };
    case 'bob':
      return { kind: 'bob', out: null };
    default:
      return { kind: 'other', out: null };
  }
}

// step = { edge, node, packet, result, next: [step...] }
// 1つの出力から線が分かれていれば、next にも枝分かれして入る。
function buildTrace() {
  const outEdges = (id) => graph.edges.filter((e) => e.type === DATA && e.from.node === id);

  const visit = (edge, packet, seen) => {
    const node = findNode(edge.to.node);
    const step = { edge, node: node.id, packet, result: processNode(node, packet), next: [] };
    if (step.result.out) {
      const nextSeen = new Set(seen).add(edge.id); // ぐるぐる回る配線で止まらなくならないように
      outEdges(node.id).forEach((e) => {
        if (!nextSeen.has(e.id)) step.next.push(visit(e, step.result.out, nextSeen));
      });
    }
    return step;
  };

  return outEdges('alice').map((e) => visit(e, newPacket(), new Set()));
}

function flatten(steps) {
  return steps.flatMap((s) => [s, ...flatten(s.next)]);
}

function routeTo(steps, kind) {
  for (const s of steps) {
    if (s.result.kind === kind) return [s.node];
    const sub = routeTo(s.next, kind);
    if (sub) return [s.node, ...sub];
  }
  return null;
}

// --- 6-2. Eve の様子: 盗めたか → 解読できたか ---
function canCapture(caps) {
  return (caps.observationScope ?? 'channel') === 'channel' && (caps.observedMessages ?? 1) > 0;
}

function notCapturedReason(caps, index) {
  if ((caps.observationScope ?? 'channel') !== 'channel') {
    return `Eve は通信路を観測できません（観測範囲: ${capText('observationScope', caps.observationScope)}）`;
  }
  if ((caps.observedMessages ?? 1) <= 0) return 'Eve が見られる通信は 0 通です';
  return `Eve が見られる通信は ${caps.observedMessages} 通までです（${index + 1} 通目は見えません）`;
}

// 盗んだデータ1つについて、Eve が何をできるか
function analyzeStolen(packet, caps) {
  if (packet.garbled) return { state: 'garbled' };
  if (packet.layers.length === 0) return { state: 'plain' };

  const level = computeInfo(caps.compute).level;
  // 外側の層から順に破っていく。破れない層に当たったらそこで止まる。
  const blocker = [...packet.layers]
    .reverse()
    .map((l) => ({ ...l, info: algorithmInfo(l.alg) }))
    .find((l) => l.info.breakLevel > level);
  return blocker
    ? { state: 'uncracked', layer: blocker }
    : { state: 'cracked', layers: packet.layers };
}

// 通信路を通ったデータすべてについての Eve のレポート（channelSteps と同じ並び）
function eveReports(channelSteps, caps) {
  return channelSteps.map((step, i) => {
    const allowed = canCapture(caps) && i < (caps.observedMessages ?? 1);
    if (!allowed) return { captured: false, reason: notCapturedReason(caps, i) };
    return { captured: true, ...analyzeStolen(step.packet, caps) };
  });
}

// --- 6-3. 要件ごとの判定 ---
function checkConfidentiality(channelSteps, caps) {
  const label = REQUIREMENTS.confidentiality.label;
  const reports = eveReports(channelSteps, caps);
  const attacker = computeInfo(caps.compute);

  // ① そもそも盗めていない
  if (!reports.some((r) => r.captured)) {
    return {
      key: 'confidentiality',
      label,
      met: true,
      reason: `Eve はデータを盗めていません。${reports[0]?.reason ?? ''}。`,
    };
  }

  // ② 盗まれて、読まれた
  const leak = reports.find((r) => r.captured && (r.state === 'plain' || r.state === 'cracked'));
  if (leak) {
    if (leak.state === 'plain') {
      return {
        key: 'confidentiality',
        label,
        met: false,
        reason: 'メッセージが暗号化されないまま通信路に出たため、Eve は盗んだデータをそのまま読めました。',
      };
    }
    const weakest = leak.layers
      .map((l) => algorithmInfo(l.alg))
      .sort((a, b) => b.breakLevel - a.breakLevel)[0];
    return {
      key: 'confidentiality',
      label,
      met: false,
      reason: `Eve（${attacker.label}）は暗号文を盗み、「${weakest.label}」を解読して中身を読みました。${weakest.weakness}`,
    };
  }

  // ③ 盗まれたが、解読できなかった
  const uncracked = reports.find((r) => r.captured && r.state === 'uncracked');
  if (uncracked) {
    return {
      key: 'confidentiality',
      label,
      met: true,
      reason: `Eve は暗号文を盗めましたが、「${uncracked.layer.info.label}」を解読できませんでした（Eve: ${attacker.label}）。`,
    };
  }

  // ④ 盗んだのは意味のないデータだけ
  return {
    key: 'confidentiality',
    label,
    met: true,
    reason: 'Eve が盗めたのは、意味のないデータだけでした。',
  };
}

function checkRequirement(req, ctx, caps) {
  if (req === 'confidentiality') return checkConfidentiality(ctx.channelSteps, caps);
  console.warn(`[simulator] 未対応の要件: ${req}`);
  return {
    key: req,
    label: REQUIREMENTS[req]?.label ?? req,
    met: false,
    reason: 'この要件の判定は、まだシミュレータに入っていません。',
  };
}

function deliveryCheck(ctx) {
  const delivered = ctx.bobSteps.some((s) => isReadable(s.packet));
  let reason = 'Bob は元のメッセージを読めました。';
  if (!delivered) {
    const first = ctx.bobSteps[0]?.packet;
    reason = first?.garbled
      ? '復号が暗号化と対応していません。アルゴリズム・鍵・順番を確認しましょう。'
      : 'Bob に届いたメッセージが暗号化されたままです。復号を足しましょう。';
  }
  return { key: 'delivery', label: 'Bob にメッセージが届く', met: delivered, reason };
}

function evaluateObjective(key, obj, ctx) {
  const caps = capsFor(key);
  const checks = [deliveryCheck(ctx), ...(obj.require ?? []).map((req) => checkRequirement(req, ctx, caps))];
  return { met: checks.every((c) => c.met), checks };
}

// --- 6-4. 余分な部品の数（クリア条件に関係なく置いたものも含む） ---
function countExtras() {
  const minimal = stage.rating?.minimalComponents;
  if (!Array.isArray(minimal)) return 0;

  const need = {};
  minimal.forEach((t) => { need[t] = (need[t] ?? 0) + 1; });

  const have = {};
  graph.nodes.forEach((n) => {
    if (COMPONENTS[n.type].removable === false) return; // Alice・Bob・通信路は数えない
    have[n.type] = (have[n.type] ?? 0) + 1;
  });

  return Object.entries(have).reduce(
    (sum, [type, count]) => sum + Math.max(0, count - (need[type] ?? 0)),
    0
  );
}

// --- 6-5. 評価 ---
//   A を満たさない                  → C
//   A だけ満たす                    → B
//   A・B を満たす（B がなければ A のみ）→ 余分なし S / 余分あり A
function computeRating(objectives, extras) {
  const metA = objectives.A ? objectives.A.met : true;
  const metB = objectives.B ? objectives.B.met : true;
  if (!metA) return 'C';
  if (!metB) return 'B';
  return extras === 0 ? 'S' : 'A';
}

function describeNode(id) {
  const node = findNode(id);
  const base = COMPONENTS[node.type].label;
  return node.params.algorithm ? `${base}（${algorithmInfo(node.params.algorithm).short}）` : base;
}

function evaluate() {
  const trace = buildTrace();
  const flat = flatten(trace);
  const channelSteps = flat.filter((s) => s.result.kind === 'channel');
  const bobSteps = flat.filter((s) => s.result.kind === 'bob');
  const blockedSteps = flat.filter((s) => s.result.blocked);

  // 通信として成り立っているかの確認
  const problems = [];
  if (trace.length === 0) {
    problems.push('Alice から出ている線がありません。Alice の出口から線を引きましょう。');
  }
  const seenReasons = new Set();
  blockedSteps.forEach((s) => {
    const msg = `「${COMPONENTS[findNode(s.node).type].label}」: ${s.result.reason}`;
    if (!seenReasons.has(msg)) {
      seenReasons.add(msg);
      problems.push(msg);
    }
  });
  if (trace.length > 0 && blockedSteps.length === 0) {
    if (channelSteps.length === 0) {
      problems.push('通信が「通信路」を通っていません。Alice から Bob へ送る道の途中に通信路を入れましょう。');
    } else if (bobSteps.length === 0) {
      problems.push('メッセージが Bob に届いていません。Bob の入口まで線をつなぎましょう。');
    } else if (bobSteps.some((s) => !s.packet.viaChannel)) {
      problems.push('通信路を通らずに Bob へ届く線があります。Alice と Bob の通信は通信路を通ります。');
    }
  }

  const base = { trace, flat, channelSteps, bobSteps };
  if (problems.length > 0) return { ...base, status: 'incomplete', problems };

  const ctx = { channelSteps, bobSteps };
  const objectives = {};
  Object.entries(stage.objectives).forEach(([key, obj]) => {
    objectives[key] = evaluateObjective(key, obj, ctx);
  });

  const extras = countExtras();
  const route = routeTo(trace, 'bob') ?? [];
  return {
    ...base,
    status: 'done',
    flow: ['alice', ...route].map(describeNode),
    objectives,
    extras,
    rating: computeRating(objectives, extras),
    cleared: objectives.A ? objectives.A.met : true,
  };
}

/* ==========================================================
   7. アニメーション
   ========================================================== */
// 評価で作ったトレースを、線の上を電気が流れる様子として再生する。
//   ・元のデータはオレンジ、暗号化されたデータは方式ごとの色
//   ・出力が枝分かれしていれば、並行して流れる
//   ・通信路の中では、Eve が「盗む → 解析する」様子を見せる

const SPEED = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.15 : 1;
const sim = { running: false, skipped: false, jobs: new Set() };

// 時間経過つきの処理。skip されたら最後の状態まで一気に進む。
function runTween(duration, onFrame) {
  return new Promise((resolve) => {
    if (sim.skipped || duration <= 0) {
      onFrame(1);
      resolve();
      return;
    }
    const t0 = performance.now();
    const job = {
      finish() {
        onFrame(1);
        resolve();
      },
    };
    sim.jobs.add(job);
    const tick = (now) => {
      if (!sim.jobs.has(job)) return;
      const p = Math.min(1, (now - t0) / duration);
      onFrame(p);
      if (p >= 1) {
        sim.jobs.delete(job);
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

const wait = (ms) => runTween(ms * SPEED, () => {});

function skipSimulation() {
  sim.skipped = true;
  [...sim.jobs].forEach((job) => {
    sim.jobs.delete(job);
    job.finish();
  });
}

// 線に沿って電気を伸ばす
function drawEdge(edge, color) {
  const info = edgeEls.get(edge.id);
  if (!info) return Promise.resolve();

  energyState.set(edge.id, color);
  const { line, energy, len } = info;
  energy.setAttribute('stroke', color);
  energy.style.display = '';
  energy.style.filter = `drop-shadow(0 0 3px ${color})`;
  energy.style.strokeDasharray = `${len}`;
  energy.style.strokeDashoffset = `${len}`;

  const spark = svgEl('circle', { r: 7, fill: color });
  spark.style.filter = `drop-shadow(0 0 4px ${color})`;
  dom.sparkLayer.append(spark);

  const duration = clamp(len / 0.3, 500, 1800) * SPEED;
  return runTween(duration, (p) => {
    energy.style.strokeDashoffset = `${len * (1 - p)}`;
    const pt = line.getPointAtLength(len * p);
    spark.setAttribute('cx', pt.x);
    spark.setAttribute('cy', pt.y);
    if (p >= 1) {
      spark.remove();
      energy.style.strokeDasharray = 'none';
    }
  });
}

// ノードの下に「いま持っているデータ」を出す
function setNodeChip(nodeId, { packet, text, color }) {
  const chip = nodeElOf(nodeId)?.querySelector('.node-packet');
  if (!chip) return;
  chip.hidden = false;
  chip.style.setProperty('--chip', color ?? packetColor(packet));
  chip.querySelector('.packet-text').textContent = text ?? packetText(packet);
  if (packet) chip.title = packetKindLabel(packet);
}

function setTube(nodeEl, packet) {
  const slot = nodeEl.querySelector('.tube-packet');
  slot.style.setProperty('--chip', packetColor(packet));
  slot.querySelector('.packet-text').textContent = packetText(packet);
  slot.title = packetKindLabel(packet);
}

function setEveRow(nodeEl, row, text, tone) {
  const value = nodeEl.querySelector(`.eve-row[data-row="${row}"] .eve-value`);
  if (!value) return;
  value.textContent = text;
  value.className = `eve-value${tone ? ` tone-${tone}` : ''}`;
}

// 通信路を通ったデータに対する Eve の動き（通信が先へ進むのと並行して見せる）
async function playEve(nodeEl, step, report) {
  const tap = nodeEl.querySelector('.tap-line');
  if (!tap) return; // Eve がいないステージ
  const copy = nodeEl.querySelector('.eve-copy');

  setEveRow(nodeEl, 'capture', '傍受中…', 'work');
  setEveRow(nodeEl, 'analysis', '待機中', null);
  copy.hidden = true;
  await wait(450);

  // ① 盗めたか
  if (!report.captured) {
    setEveRow(nodeEl, 'capture', '盗めない', 'good');
    setEveRow(nodeEl, 'analysis', report.reason, null);
    return;
  }
  tap.style.background = packetColor(step.packet);
  setEveRow(nodeEl, 'capture', '盗んだ！', 'work');
  copy.hidden = false;
  copy.style.setProperty('--chip', packetColor(step.packet));
  copy.querySelector('.packet-text').textContent = packetText(step.packet);
  await wait(600);

  // ② 解析できたか
  switch (report.state) {
    case 'plain':
      setEveRow(nodeEl, 'analysis', 'そのまま読めた', 'bad');
      break;
    case 'garbled':
      setEveRow(nodeEl, 'analysis', '意味のないデータ', 'good');
      break;
    case 'uncracked':
      setEveRow(nodeEl, 'analysis', `${report.layer.info.short} を解読中…`, 'work');
      await wait(1000);
      setEveRow(nodeEl, 'analysis', '解読できない', 'good');
      break;
    case 'cracked': {
      const names = report.layers.map((l) => algorithmInfo(l.alg).short).join('・');
      setEveRow(nodeEl, 'analysis', `${names} を解読中…`, 'work');
      await wait(1000);
      setEveRow(nodeEl, 'analysis', '解読できた！', 'bad');
      copy.style.setProperty('--chip', COLORS.plain);
      copy.querySelector('.packet-text').textContent = stageMessage();
      break;
    }
    default:
      break;
  }
}

// 線を伸ばし、着いたノードで処理し、枝分かれ先へ進む
async function playStep(step, eveMap) {
  await drawEdge(step.edge, packetColor(step.packet));

  const nodeEl = nodeElOf(step.node);
  const r = step.result;
  let sideTask = Promise.resolve();

  if (r.kind === 'transform') {
    nodeEl.classList.add('is-active');
    await wait(450);
    nodeEl.classList.remove('is-active');
    if (r.blocked) {
      nodeEl.classList.add('is-blocked');
      setNodeChip(step.node, { text: '鍵がない！', color: '#ee5f78' });
      return;
    }
    setNodeChip(step.node, { packet: r.out });
    await wait(250);
  } else if (r.kind === 'channel') {
    setTube(nodeEl, step.packet);
    nodeEl.classList.add('is-active');
    sideTask = playEve(nodeEl, step, eveMap.get(step) ?? { captured: false, reason: '' });
    await wait(500);
    nodeEl.classList.remove('is-active');
  } else if (r.kind === 'bob') {
    const readable = isReadable(step.packet);
    setNodeChip(step.node, { packet: step.packet });
    nodeEl.classList.add(readable ? 'is-received' : 'is-garbled');
    await wait(300);
    return;
  }

  await Promise.all([sideTask, ...step.next.map((s) => playStep(s, eveMap))]);
}

async function playTrace(res, eveMap) {
  // Alice が元のデータを送り出す
  const alice = nodeElOf('alice');
  alice?.classList.add('is-active');
  setNodeChip('alice', { packet: newPacket() });
  await wait(500);
  alice?.classList.remove('is-active');

  // 鍵の線にも電気を通す（鍵は事前に共有してある想定）
  const keyJobs = graph.edges.filter((e) => e.type === KEY).map((e) => drawEdge(e, COLORS.key));

  // 元のデータが流れ出す（出口から線が分かれていれば、並行して進む）
  await Promise.all([...keyJobs, ...res.trace.map((s) => playStep(s, eveMap))]);
  await wait(300);
}

// 前回のシミュレーション結果の表示を消す
function clearOutcome() {
  energyState.clear();
  dom.sparkLayer.replaceChildren();
  renderEdges();

  dom.board.querySelectorAll('.node').forEach((n) => {
    n.classList.remove('is-active', 'is-blocked', 'is-received', 'is-garbled', 'is-breached', 'is-safe');
  });
  dom.board.querySelectorAll('.node-packet').forEach((c) => { c.hidden = true; });

  dom.board.querySelectorAll('.node-channel').forEach((ch) => {
    const slot = ch.querySelector('.tube-packet');
    slot.style.removeProperty('--chip');
    slot.querySelector('.packet-text').textContent = '—';
    slot.removeAttribute('title');
    const tap = ch.querySelector('.tap-line');
    if (tap) tap.style.background = '';
    ch.querySelectorAll('.eve-row .eve-value').forEach((v) => {
      v.textContent = '待機中';
      v.className = 'eve-value';
    });
    const copy = ch.querySelector('.eve-copy');
    if (copy) copy.hidden = true;
  });
}

function markOutcome(res) {
  const ch = dom.board.querySelector('.node-channel');
  if (!ch || res.status !== 'done') return;
  const obj = res.objectives[activeObjective] ?? res.objectives.A;
  const breached = obj
    ? obj.checks.some((c) => c.key === 'confidentiality' && !c.met)
    : false;
  ch.classList.add(breached ? 'is-breached' : 'is-safe');
}

function setSimulating(on) {
  sim.running = on;
  dom.editor.classList.toggle('is-simulating', on);
  dom.runButton.textContent = on ? 'スキップ' : 'シミュレーション開始';
  dom.resetButton.disabled = on;
  dom.objectiveToggle.querySelectorAll('button').forEach((b) => { b.disabled = on; });
}

async function runSimulation() {
  clearPending();
  hideResult();
  clearOutcome();
  sim.skipped = false;

  const res = evaluate();
  const eveMap = new Map();
  const reports = eveReports(res.channelSteps, capsFor(activeObjective));
  res.channelSteps.forEach((step, i) => eveMap.set(step, reports[i]));

  setSimulating(true);
  try {
    await playTrace(res, eveMap);
  } finally {
    setSimulating(false);
  }

  markOutcome(res);
  showResult(res);
}

/* ==========================================================
   8. 結果表示
   ========================================================== */

const RATING_ORDER = { C: 0, B: 1, A: 2, S: 3 };

function saveProgress(id, rating) {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const prev = data[id]?.rating;
    if (!prev || RATING_ORDER[rating] > RATING_ORDER[prev]) {
      data[id] = { rating };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
    }
  } catch (err) {
    console.warn('[simulator] 進捗を保存できませんでした', err);
  }
}

let briefRestore = null; // 結果を出す前に条件パネルが開いていたか

function hideResult() {
  dom.result.hidden = true;
  dom.result.replaceChildren();
  dom.editor.classList.remove('has-result');
  if (briefRestore !== null) {
    setBriefCollapsed(!briefRestore);
    briefRestore = null;
  }
}

function showResult(res) {
  const box = dom.result;
  box.replaceChildren();
  box.hidden = false;
  box.className = 'result';
  dom.editor.classList.add('has-result');
  if (briefRestore === null) briefRestore = !dom.briefPanel.classList.contains('is-collapsed');
  setBriefCollapsed(true); // 結果に場所をゆずる

  const close = el('button', 'result-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '結果を閉じる');
  close.addEventListener('click', hideResult);

  if (res.status === 'incomplete') {
    box.classList.add('is-incomplete');
    const head = el('div', 'result-head');
    head.append(el('h2', 'result-title', '通信がまだ完成していません'), close);
    box.append(head);

    const ul = el('ul', 'result-problems');
    res.problems.forEach((p) => ul.append(el('li', null, p)));
    box.append(ul, createActions(false));
    revealResult();
    return;
  }

  const allMet = Object.values(res.objectives).every((o) => o.met);
  // 守りの要件（機密性など）が破られたか、それとも Bob に届かなかっただけか
  const breached = Object.values(res.objectives).some((o) =>
    o.checks.some((c) => c.key !== 'delivery' && !c.met)
  );
  box.classList.add(res.cleared ? 'is-safe' : 'is-broken');

  let title = 'Objective A クリア！';
  if (!res.cleared) title = breached ? '💥 突破された！' : 'メッセージがうまく届いていません';
  else if (allMet) title = '守り切った！';

  const head = el('div', 'result-head');
  head.append(el('h2', 'result-title', title));
  const chip = el('span', `rating rating-${res.rating}`, res.rating);
  chip.setAttribute('aria-label', `評価 ${res.rating}`);
  head.append(chip, close);
  box.append(head);

  // 組んだ通信の流れ
  box.append(el('p', 'result-flow', res.flow.join('  →  ')));

  // Objective ごとの結果
  const grid = el('div', 'result-objectives');
  Object.entries(res.objectives).forEach(([key, obj]) => {
    const card = el('div', `result-objective ${obj.met ? 'is-met' : 'is-unmet'}`);
    const h3 = el('h3');
    h3.append(el('span', null, `Objective ${key}`), el('span', null, obj.met ? '達成' : '未達成'));
    card.append(h3);

    const list = el('div', 'check-list');
    obj.checks.forEach((c) => {
      const item = el('div', `check-item ${c.met ? 'is-met' : 'is-unmet'}`);
      item.append(el('strong', null, c.label), el('p', null, c.reason));
      list.append(item);
    });
    card.append(list);
    grid.append(card);
  });
  box.append(grid);

  // 無駄の指摘
  if (res.cleared && allMet) {
    box.append(
      el(
        'p',
        'result-note',
        res.extras === 0
          ? '無駄のない構成です。'
          : `必要以上の部品が ${res.extras} 個あります。減らすと S になります。`
      )
    );
  }

  box.append(createActions(res.cleared));

  if (res.cleared) saveProgress(stage.id, res.rating);
  revealResult();
}

function createActions(cleared) {
  const actions = el('div', 'result-actions');

  const retry = el('button', 'button button-secondary', 'もう一度つくる');
  retry.type = 'button';
  retry.addEventListener('click', hideResult);
  actions.append(retry);

  const idx = STAGE_IDS.indexOf(stage.id);
  const nextId = idx >= 0 ? STAGE_IDS[idx + 1] : null;
  if (cleared && nextId) {
    const next = el('a', 'button button-primary', '次のステージへ');
    next.href = `simulator.html?stage=${encodeURIComponent(nextId)}`;
    actions.append(next);
  }

  const back = el('a', 'button button-secondary', 'ステージ一覧へ');
  back.href = 'index.html#stage-section';
  actions.append(back);

  return actions;
}

function revealResult() {
  dom.result.scrollTop = 0;
  dom.result.focus({ preventScroll: true });
}

/* ==========================================================
   9. 起動
   ========================================================== */

function showStatus(message, isError = false) {
  dom.status.textContent = message;
  dom.status.hidden = false;
  dom.status.classList.toggle('is-error', isError);
}

function resetBoard() {
  seq = 0;
  energyState.clear();
  graph = initialGraph();
  renderNodes();
  hideResult();
  clearOutcome();
}

function normalizeStage(raw) {
  return {
    ...raw,
    components: Array.isArray(raw.components) ? raw.components : [],
    algorithms:
      Array.isArray(raw.algorithms) && raw.algorithms.length > 0 ? raw.algorithms : ['caesar'],
    objectives:
      raw.objectives && Object.keys(raw.objectives).length > 0
        ? raw.objectives
        : { A: { require: ['confidentiality'] } },
  };
}

async function init() {
  dom.status = $('#sim-status');
  dom.root = $('#sim-root');
  dom.editor = $('#editor');
  dom.board = $('#board');
  dom.result = $('#result');
  dom.palette = $('#palette');
  dom.paletteBar = $('#palette-bar');
  dom.legend = $('#legend');
  dom.sideStack = $('#side-stack');
  dom.briefPanel = $('#brief-panel');
  dom.briefToggle = $('#brief-toggle');
  dom.toolbar = $('#toolbar');
  dom.runButton = $('#run-button');
  dom.resetButton = $('#reset-button');
  dom.objectiveToggle = $('#objective-toggle');

  const id = new URLSearchParams(location.search).get('stage') ?? 'test';

  try {
    stage = normalizeStage(await stagesModule.loadStage(id));
  } catch (err) {
    console.error(err);
    showStatus(
      location.protocol === 'file:'
        ? 'ファイルを直接開いているため、ステージを読み込めません。ローカルサーバー経由で開いてください（例: python -m http.server）。'
        : `ステージ「${id}」を読み込めませんでした。URL と stages フォルダを確認してください。`,
      true
    );
    return;
  }

  activeObjective = Object.keys(stage.objectives)[0];

  // 線を描く SVG のレイヤー（確定した線 / つなぎ途中の線 / 電気の先頭の光）
  const svg = $('#edges');
  dom.edgeLayer = svgEl('g');
  dom.tempLayer = svgEl('g');
  dom.sparkLayer = svgEl('g');
  svg.append(dom.edgeLayer, dom.tempLayer, dom.sparkLayer);

  dom.status.hidden = true;
  dom.root.hidden = false;

  renderBrief();
  renderLegend();
  renderPalette();
  renderObjectiveToggle();
  setBriefCollapsed(window.innerWidth < 900);
  resetBoard();

  dom.briefToggle.addEventListener('click', () => {
    setBriefCollapsed(!dom.briefPanel.classList.contains('is-collapsed'));
  });
  dom.runButton.addEventListener('click', () => {
    if (sim.running) skipSimulation();
    else runSimulation();
  });
  dom.resetButton.addEventListener('click', resetBoard);

  // 何もないところをクリックしたら、つなぎ途中の選択を解除
  dom.board.addEventListener('click', (e) => {
    if (e.target === dom.board) clearPending();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearPending();
  });

  window.addEventListener('resize', clampAllNodes);
  if (document.fonts?.ready) document.fonts.ready.then(renderEdges);
}

init();
