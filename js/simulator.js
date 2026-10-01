// simulator.js
// 全ステージ共通のシミュレータ本体（最小版）
//
// 構成:
//   1. 定義        : 攻撃者の能力・アルゴリズム・コンポーネントのテーブル
//   2. 状態        : キャンバスの内容 graph = { nodes, edges }
//   3. 操作        : ノード追加/削除、ドラッグ、線のつなぎ方
//   4. 描画        : ノード・線・条件パネル
//   5. 評価        : graph × 攻撃者の能力 → 突破されたか / 評価
//   6. 結果表示
//   7. 起動
//
// 評価ロジック（5）は大きくなったら js/evaluator.js に切り出す想定。

import { loadStage, STAGE_IDS } from './stages.js';

const PROGRESS_KEY = 'crypta:progress';

/* ==========================================================
   1. 定義
   ========================================================== */

// 攻撃者の計算能力。数字が大きいほど強い。
const COMPUTE = {
  observer: { level: 0, label: '観測するだけ' },
  human: { level: 1, label: '手作業で解析できる' },
  computer: { level: 2, label: 'コンピュータで解析できる' },
};

// アルゴリズム。breakLevel 以上の計算能力を持つ攻撃者に破られる。
// （数値は仮置き。ステージを作りながら調整する）
const ALGORITHMS = {
  caesar: {
    label: 'シーザー暗号',
    breakLevel: 1,
    weakness: 'ずらし幅が25通りしかないので、解析されるとすぐに破られます。',
  },
  aes: {
    label: 'AES',
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
    movable: false,
    removable: false,
    palette: false,
    inputs: [],
    outputs: [{ id: 'out', type: DATA, label: 'メッセージ' }],
  },
  bob: {
    label: 'Bob',
    movable: false,
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
   2. 状態
   ========================================================== */

let stage = null;
let graph = { nodes: [], edges: [] };
let seq = 0;
let pending = null; // タップでつなぐ途中の出力ポート { node, port, type }

const dom = {};

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

function nextId(prefix) {
  seq += 1;
  return `${prefix}${seq}`;
}

function initialGraph() {
  return {
    nodes: [
      { id: 'alice', type: 'alice', x: 20, y: 160, params: {} },
      { id: 'channel', type: 'channel', x: 330, y: 150, params: {} },
      { id: 'bob', type: 'bob', x: 640, y: 160, params: {} },
    ],
    edges: [],
  };
}

function findNode(id) {
  return graph.nodes.find((n) => n.id === id);
}

function algorithmInfo(id) {
  return ALGORITHMS[id] ?? { label: id ?? '不明', breakLevel: Infinity, weakness: '' };
}

function computeInfo(id) {
  if (!(id in COMPUTE)) {
    console.warn(`[simulator] 未知の compute: ${id}（observer として扱います）`);
    return COMPUTE.observer;
  }
  return COMPUTE[id];
}

/* ==========================================================
   3. 操作
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
  return (
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
    const maxX = dom.board.clientWidth - nodeEl.offsetWidth;
    const maxY = dom.board.clientHeight - nodeEl.offsetHeight;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
      const x = clamp(ev.clientX - rect.left - 76, 0, dom.board.clientWidth - 152);
      const y = clamp(ev.clientY - rect.top - 40, 0, dom.board.clientHeight - 110);
      addNode(type, x, y);
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// クリック・キーボードで置くときの位置（既存のノードと重ならない所）
function findFreePosition() {
  const rows = [20, 300, 160];
  const cols = [170, 330, 490, 650];
  for (const y of rows) {
    for (const x of cols) {
      const overlaps = graph.nodes.some(
        (n) => Math.abs(n.x - x) < 150 && Math.abs(n.y - y) < 120
      );
      if (!overlaps) return { x, y };
    }
  }
  const n = graph.nodes.length;
  return { x: 40 + (n % 6) * 30, y: 20 + (n % 5) * 30 };
}

// グラフが変わったら、前の結果は古くなる
function onGraphChanged() {
  hideResult();
  clearOutcomeMarks();
}

/* ==========================================================
   4. 描画
   ========================================================== */

function renderNodes() {
  clearPending();
  dom.board.querySelectorAll('.node').forEach((n) => n.remove());
  graph.nodes.forEach((node) => dom.board.append(createNodeEl(node)));
  renderEdges();
}

function createNodeEl(node) {
  const def = COMPONENTS[node.type];
  const movable = def.movable !== false;

  const root = el('div', `node node-${node.type}`);
  if (!movable) root.classList.add('is-static');
  root.dataset.id = node.id;
  root.style.left = `${node.x}px`;
  root.style.top = `${node.y}px`;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', def.label);

  // ヘッダー
  const head = el('div', 'node-head');
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

  // ポート
  def.inputs.forEach((port) => root.append(createPortRow(node, port, 'in')));
  def.outputs.forEach((port) => root.append(createPortRow(node, port, 'out')));

  // 通信路には攻撃者の表示
  if (node.type === 'channel') {
    const box = el('div', 'node-attacker');
    attackerKeys(stage).forEach((key) => {
      const a = ATTACKERS[key];
      box.append(el('span', `badge ${a.className}`, a.label));
    });
    box.append(el('div', 'node-attacker-note', '通信を見ています'));
    root.append(box);
  }

  // ドラッグ移動
  if (movable) {
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('.port, select, .node-remove')) return;
      startNodeDrag(e, node, root);
    });
  }

  return root;
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

  row.append(btn, el('span', 'port-label', port.label));
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

function curve(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function renderEdges() {
  if (!dom.edgeLayer) return;
  dom.edgeLayer.replaceChildren();
  graph.edges.forEach((edge) => {
    const a = portCenter(edge.from.node, edge.from.port, 'out');
    const b = portCenter(edge.to.node, edge.to.port, 'in');
    if (!a || !b) return;
    const d = curve(a, b);

    const g = svgEl('g', { class: `edge edge-${edge.type}` });
    const title = svgEl('title');
    title.textContent = 'クリックで線を消す';
    g.append(title, svgEl('path', { class: 'edge-line', d }), svgEl('path', { class: 'edge-hit', d }));
    g.addEventListener('click', () => removeEdge(edge.id));
    dom.edgeLayer.append(g);
  });
}

function drawTempEdge(from, clientX, clientY) {
  const a = portCenter(from.node, from.port, 'out');
  if (!a) return;
  const b = dom.board.getBoundingClientRect();
  const end = { x: clientX - b.left, y: clientY - b.top };
  dom.tempLayer.replaceChildren(svgEl('path', { class: 'edge-temp', d: curve(a, end) }));
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

/* ==========================================================
   5. 評価
   ========================================================== */

// 5-1. 構成の解析: つながっているか、どんな順で暗号化・復号されるか
function analyze() {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const dataEdges = graph.edges.filter((e) => e.type === DATA);

  // Alice → Bob の経路を幅優先で探す
  const prev = new Map([['alice', null]]);
  const queue = ['alice'];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === 'bob') break;
    dataEdges.forEach((e) => {
      if (e.from.node === cur && !prev.has(e.to.node)) {
        prev.set(e.to.node, cur);
        queue.push(e.to.node);
      }
    });
  }
  if (!prev.has('bob')) {
    return {
      ok: false,
      problems: ['Alice と Bob がつながっていません。Alice の出口から Bob の入口まで、線でつなぎましょう。'],
    };
  }

  const path = [];
  for (let id = 'bob'; id !== null; id = prev.get(id)) path.unshift(id);

  const problems = [];
  if (!path.includes('channel')) {
    problems.push('通信が「通信路」を通っていません。Alice から Bob へ送る道の途中に通信路を入れましょう。');
  }

  // 暗号化・復号に鍵がつながっているか。つながっていれば鍵ノードのIDを返す。
  const keyOf = (node) => {
    const e = graph.edges.find((x) => x.type === KEY && x.to.node === node.id);
    return e ? e.from.node : null;
  };
  path.forEach((id) => {
    const n = byId.get(id);
    if ((n.type === 'encrypt' || n.type === 'decrypt') && !keyOf(n)) {
      problems.push(`「${COMPONENTS[n.type].label}」に鍵がつながっていません。`);
    }
  });
  if (problems.length > 0) return { ok: false, problems };

  // 経路に沿ってメッセージの状態を追う（暗号化で積み、復号で外す）
  const stack = [];
  let garbled = false;
  let layersAtChannel = [];
  path.forEach((id) => {
    const n = byId.get(id);
    if (n.type === 'encrypt') {
      stack.push({ alg: n.params.algorithm, key: keyOf(n) });
    } else if (n.type === 'decrypt') {
      const top = stack.pop();
      if (!top || top.alg !== n.params.algorithm || top.key !== keyOf(n)) garbled = true;
    } else if (n.type === 'channel') {
      layersAtChannel = stack.map((l) => ({ ...l }));
    }
  });

  const delivered = !garbled && stack.length === 0;
  let deliveryReason = 'Bob は元のメッセージを読めました。';
  if (garbled) {
    deliveryReason =
      '復号が暗号化と対応していません。アルゴリズム・鍵・順番を確認しましょう。';
  } else if (stack.length > 0) {
    deliveryReason = 'Bob に届いたメッセージが暗号化されたままです。復号を足しましょう。';
  }

  const flow = path.map((id) => {
    const n = byId.get(id);
    const base = COMPONENTS[n.type].label;
    return n.params.algorithm ? `${base}（${algorithmInfo(n.params.algorithm).label}）` : base;
  });

  return { ok: true, path, flow, layers: layersAtChannel, delivered, deliveryReason };
}

// 5-2. 要件ごとの判定
function checkConfidentiality(a, caps) {
  const label = REQUIREMENTS.confidentiality.label;
  const attacker = computeInfo(caps.compute);

  if (a.layers.length === 0) {
    return {
      key: 'confidentiality',
      label,
      met: false,
      reason: 'メッセージが暗号化されないまま通信路に出ています。Eve はそのまま読めてしまいます。',
    };
  }

  // 何重にも暗号化していれば、いちばん強い層が守ってくれる
  const strongest = a.layers
    .map((l) => ({ ...l, info: algorithmInfo(l.alg) }))
    .reduce((best, cur) => (cur.info.breakLevel > best.info.breakLevel ? cur : best));

  if (strongest.info.breakLevel <= attacker.level) {
    return {
      key: 'confidentiality',
      label,
      met: false,
      reason: `Eve（${attacker.label}）に「${strongest.info.label}」を解読されました。${strongest.info.weakness}`,
    };
  }
  return {
    key: 'confidentiality',
    label,
    met: true,
    reason: `Eve（${attacker.label}）には「${strongest.info.label}」を解読できませんでした。`,
  };
}

function checkRequirement(req, a, caps) {
  if (req === 'confidentiality') return checkConfidentiality(a, caps);
  console.warn(`[simulator] 未対応の要件: ${req}`);
  return {
    key: req,
    label: REQUIREMENTS[req]?.label ?? req,
    met: false,
    reason: 'この要件の判定は、まだシミュレータに入っていません。',
  };
}

// 5-3. Objective ごとの判定（攻撃者の能力を上書きして評価）
function evaluateObjective(obj, a) {
  const caps = { ...(stage.attacker?.capabilities ?? {}), ...(obj.attackerOverride ?? {}) };
  const checks = [
    {
      key: 'delivery',
      label: 'Bob にメッセージが届く',
      met: a.delivered,
      reason: a.deliveryReason,
    },
    ...(obj.require ?? []).map((req) => checkRequirement(req, a, caps)),
  ];
  return { met: checks.every((c) => c.met), checks };
}

// 5-4. 余分な部品の数（クリア条件に関係なく置いたものも含む）
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

// 5-5. 評価
//   A を満たさない                  → C（突破された）
//   A だけ満たす                    → B
//   A・B を満たす（B がなければ A のみ）→ 余分なし S / 余分あり A
function computeRating(objectives, extras) {
  const metA = objectives.A ? objectives.A.met : true;
  const metB = objectives.B ? objectives.B.met : true;
  if (!metA) return 'C';
  if (!metB) return 'B';
  return extras === 0 ? 'S' : 'A';
}

function evaluate() {
  const a = analyze();
  if (!a.ok) return { status: 'incomplete', problems: a.problems };

  const objectives = {};
  Object.entries(stage.objectives).forEach(([key, obj]) => {
    objectives[key] = evaluateObjective(obj, a);
  });

  const extras = countExtras();
  const rating = computeRating(objectives, extras);
  const cleared = objectives.A ? objectives.A.met : true;

  return { status: 'done', flow: a.flow, objectives, extras, rating, cleared };
}

/* ==========================================================
   6. 結果表示
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

function hideResult() {
  dom.result.hidden = true;
  dom.result.replaceChildren();
}

function clearOutcomeMarks() {
  const ch = dom.board.querySelector('.node-channel');
  if (!ch) return;
  ch.classList.remove('is-breached', 'is-safe');
  const note = ch.querySelector('.node-attacker-note');
  if (note) note.textContent = '通信を見ています';
}

function markOutcome(res) {
  const ch = dom.board.querySelector('.node-channel');
  if (!ch || res.status !== 'done') return;
  const a = res.objectives.A;
  const breached = a ? a.checks.some((c) => c.key === 'confidentiality' && !c.met) : false;
  ch.classList.add(breached ? 'is-breached' : 'is-safe');
  const note = ch.querySelector('.node-attacker-note');
  if (note) note.textContent = breached ? '読まれてしまった！' : '読めなかった';
}

function showResult(res) {
  const box = dom.result;
  box.replaceChildren();
  box.hidden = false;
  box.className = 'result';

  if (res.status === 'incomplete') {
    box.classList.add('is-incomplete');
    const head = el('div', 'result-head');
    head.append(el('h2', 'result-title', '通信がまだ完成していません'));
    box.append(head);

    const ul = el('ul', 'result-problems');
    res.problems.forEach((p) => ul.append(el('li', null, p)));
    box.append(ul);
    box.append(createActions(false));
    revealResult();
    return;
  }

  const allMet = Object.values(res.objectives).every((o) => o.met);
  box.classList.add(res.cleared ? 'is-safe' : 'is-broken');

  // 見出し + 評価
  const head = el('div', 'result-head');
  head.append(
    el(
      'h2',
      'result-title',
      !res.cleared ? '💥 突破された！' : allMet ? '守り切った！' : 'Objective A クリア！'
    )
  );
  const chip = el('span', `rating rating-${res.rating}`, res.rating);
  chip.setAttribute('aria-label', `評価 ${res.rating}`);
  head.append(chip);
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
  markOutcome(res);
  revealResult();
}

function createActions(cleared) {
  const actions = el('div', 'result-actions');

  const retry = el('button', 'button button-secondary', 'もう一度つくる');
  retry.type = 'button';
  retry.addEventListener('click', () => {
    hideResult();
    dom.board.scrollIntoView({ behavior: motionBehavior(), block: 'center' });
  });
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

function motionBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function revealResult() {
  dom.result.focus({ preventScroll: true });
  dom.result.scrollIntoView({ behavior: motionBehavior(), block: 'start' });
}

/* ==========================================================
   7. 起動
   ========================================================== */

function showStatus(message, isError = false) {
  dom.status.textContent = message;
  dom.status.hidden = false;
  dom.status.classList.toggle('is-error', isError);
}

function resetBoard() {
  seq = 0;
  graph = initialGraph();
  renderNodes();
  hideResult();
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
  dom.board = $('#board');
  dom.result = $('#result');
  dom.palette = $('#palette');

  const id = new URLSearchParams(location.search).get('stage') ?? 'test';

  try {
    stage = normalizeStage(await loadStage(id));
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

  // 線を描く SVG のレイヤー（確定した線 / つなぎ途中の線）
  const svg = $('#edges');
  dom.edgeLayer = svgEl('g');
  dom.tempLayer = svgEl('g');
  svg.append(dom.edgeLayer, dom.tempLayer);

  dom.status.hidden = true;
  dom.root.hidden = false;

  renderBrief();
  renderPalette();
  resetBoard();

  $('#run-button').addEventListener('click', () => showResult(evaluate()));
  $('#reset-button').addEventListener('click', resetBoard);

  // 何もないところをクリックしたら、つなぎ途中の選択を解除
  dom.board.addEventListener('click', (e) => {
    if (e.target === dom.board) clearPending();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearPending();
  });

  window.addEventListener('resize', renderEdges);
  if (document.fonts?.ready) document.fonts.ready.then(renderEdges);
}

init();
