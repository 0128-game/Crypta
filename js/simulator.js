// simulator.js
// 全ステージ共通のシミュレータ画面
//
// 通信の評価（Eve・Mallory の攻撃、Bob が受け入れたか）は engine.js が行う。
// この simulator.js は、
//   ・キャンバスの操作（部品の配置・ドラッグ・配線・拡大・移動）
//   ・ステージの条件の表示
//   ・engine.js が求めた「流れ」を、線の上を電気が流れるアニメーションにして見せる
//   ・結果の表示
// を担当する。

// 名前付き import だと、stages.js に export が無いときモジュール全体が起動しなくなる。
// 名前空間 import にして、足りない場合は個別に扱う。
import * as stagesModule from './stages.js';
import { GLOSSARY, GLOSSARY_BY_ID, GLOSSARY_CATEGORIES } from './glossary.js';
import {
  DATA, KEY, PUB, PRIV,
  COMPONENTS, ATTACKS, REQUIREMENTS, COLORS,
  typesCompatible, availableComponents, availableAlgorithms,
  algorithmInfo, computeInfo, capsFor, rulesFor, objectiveKeys, stageMessage,
  bundleText, bundleColor, valueColor, valueText, evaluateStage,
} from './engine.js';

const STAGE_IDS = stagesModule.STAGE_IDS ?? [];
const PROGRESS_KEY = 'crypta:progress';
const RATING_ORDER = { C: 0, B: 1, A: 2, S: 3 };

const ATTACKERS = {
  eve: { label: 'Eve', role: '盗聴', className: 'badge-eve' },
  mallory: { label: 'Mallory', role: '改ざん・なりすまし', className: 'badge-mallory' },
};

const CAP_LABELS = {
  compute: '計算能力',
  observedMessages: '通信データベース',
  knownInfo: '既知情報',
  observationScope: '観測範囲',
  attacks: 'できる攻撃（介入範囲）',
  seesMetadata: '宛先・アプリ',
};

// 攻撃者の環境の項目 → 用語集の説明 / ひとこと説明
const ENV_TERMS = {
  compute: 'env-compute',
  observedMessages: 'env-db',
  knownInfo: 'env-known',
  observationScope: 'env-scope',
  attacks: 'env-attacks',
  seesMetadata: 'metadata',
};
const ENV_NOTES = {
  compute: 'どれくらい大量の計算ができるか',
  observedMessages: '集めて保存している通信の量。多いほど、たくさんの通信を比べられます',
  knownInfo: '通信以外に、攻撃者が知っていること',
  observationScope: 'どの通信を見られるか',
  attacks: '通信にどこまで手を加えられるか',
  seesMetadata: '本文ではない「誰と・何の通信か」の情報',
};
const SCOPE_LABELS = { channel: '通信路' };

const BAD_LABELS = {
  tampered: '書き換えられた本文',
  forged: '偽の本文',
  garbled: '壊れたデータ',
};

/* ---------- 状態 ---------- */

let stage = null;
let graph = { nodes: [], edges: [] };
let seq = 0;
let pending = null;          // タップでつなぐ途中の出力ポート { node, port, type }
let activeObjective = 'A';   // 攻撃者の強さをどの Objective で見るか
let pan = { x: 0, y: 0 };    // キャンバスを動かした量（ドラッグで動かせる）
let zoom = 1;                // キャンバスの拡大率（ホイール・ピンチ・ボタンで変える）
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.5;

let suppressPaletteClick = false;
let briefRestore = null;     // 結果を出す前に条件パネルが開いていたか
const bgPointers = new Map(); // 背景を触っている指・ポインタ
let pinch = null;

const dom = {};
const edgeEls = new Map();     // edgeId → { line, energy, len }
const energyState = new Map(); // edgeId → 色（電気が通った線）

const SPEED = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.15 : 1;
const sim = { running: false, skipped: false, jobs: new Set() };

const $ = (selector) => document.querySelector(selector);


/* ==========================================================
   キャンバスの操作（そのまま使う部分）
   ========================================================== */

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
// ノードの座標は「キャンバス上の位置」で持つ（拡大・移動の影響を受けない）。
// 画面上の位置との変換は、worldRect() を基準に zoom で割る。
function worldRect() {
  return dom.world.getBoundingClientRect();
}
// 画面上の座標 → キャンバス上の座標
function toWorld(clientX, clientY) {
  const r = worldRect();
  return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
}

function applyPan() {
  dom.world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  dom.board.style.backgroundPosition = `${pan.x}px ${pan.y}px`;
  dom.board.style.backgroundSize = `${24 * zoom}px ${24 * zoom}px`;
  if (dom.zoomLabel) dom.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}
// (clientX, clientY) の下にあるキャンバス上の点を動かさずに、拡大率だけ変える
function zoomAt(clientX, clientY, nextZoom) {
  const nz = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
  const b = dom.board.getBoundingClientRect();
  const wx = (clientX - b.left - pan.x) / zoom;
  const wy = (clientY - b.top - pan.y) / zoom;
  zoom = nz;
  pan.x = clientX - b.left - wx * nz;
  pan.y = clientY - b.top - wy * nz;
  applyPan();
}

function zoomByButton(factor) {
  const b = dom.board.getBoundingClientRect();
  zoomAt(b.left + b.width / 2, b.top + b.height / 2, zoom * factor);
}

function resetView() {
  pan = { x: 0, y: 0 };
  zoom = 1;
  applyPan();
}
// すべてのノードがちょうど入るように、拡大率と位置を合わせる
function fitView() {
  if (graph.nodes.length === 0) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  graph.nodes.forEach((n) => {
    const e = nodeElOf(n.id);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (e?.offsetWidth ?? 152));
    maxY = Math.max(maxY, n.y + (e?.offsetHeight ?? 130));
  });

  const W = dom.board.clientWidth;
  const H = dom.board.clientHeight;
  // 重ねて表示している部品一覧やボタンの下に隠れないよう、余白をとる
  const padLeft = W >= 900 ? dom.sideStack.offsetWidth + 24 : 24;
  const padRight = 76; // 右側の拡大・縮小ボタンの下に隠れないように
  const padTop = 70;
  const padBottom = dom.paletteBar.offsetParent ? dom.paletteBar.offsetHeight + 24 : 24;
  const availW = Math.max(100, W - padLeft - padRight);
  const availH = Math.max(100, H - padTop - padBottom);

  const bw = maxX - minX;
  const bh = maxY - minY;
  zoom = clamp(Math.min(availW / bw, availH / bh), ZOOM_MIN, 1.2);
  pan.x = padLeft + (availW - bw * zoom) / 2 - minX * zoom;
  pan.y = padTop + (availH - bh * zoom) / 2 - minY * zoom;
  applyPan();
}

function findNode(id) {
  return graph.nodes.find((n) => n.id === id);
}

function nodeElOf(id) {
  return dom.board.querySelector(`.node[data-id="${id}"]`);
}

function initialGraph() {
  const W = dom.board.clientWidth || 900;
  const H = dom.board.clientHeight || 600;

  // 通信路（背が高い）が、下の部品バーにかぶらない高さに置く
  const barH = dom.paletteBar?.offsetHeight || 120;
  const channelH = 340;
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
  const start = toWorld(e.clientX, e.clientY);
  const offX = start.x - node.x;
  const offY = start.y - node.y;
  nodeEl.classList.add('is-dragging');

  const onMove = (ev) => {
    const w = toWorld(ev.clientX, ev.clientY);
    node.x = w.x - offX;
    node.y = w.y - offY;
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

function pinchPoints() {
  const [a, b] = [...bgPointers.values()];
  return { a, b, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
}

function beginPinch() {
  const { cx, cy, dist } = pinchPoints();
  const rect = dom.board.getBoundingClientRect();
  pinch = {
    dist,
    zoom,
    wx: (cx - rect.left - pan.x) / zoom,
    wy: (cy - rect.top - pan.y) / zoom,
  };
}

function updatePinch() {
  const { cx, cy, dist } = pinchPoints();
  const rect = dom.board.getBoundingClientRect();
  zoom = clamp(pinch.zoom * (dist / pinch.dist), ZOOM_MIN, ZOOM_MAX);
  pan.x = cx - rect.left - pinch.wx * zoom;
  pan.y = cy - rect.top - pinch.wy * zoom;
  applyPan();
}

function startPan(e) {
  if (e.button !== undefined && e.button !== 0) return;
  if (e.target !== dom.board && e.target !== dom.world) return;

  bgPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (bgPointers.size === 2) {
    beginPinch();
    return;
  }
  if (bgPointers.size > 2) return;

  let panId = e.pointerId;
  let start = { x: e.clientX, y: e.clientY };
  let origin = { ...pan };
  let moved = false;

  const onMove = (ev) => {
    if (!bgPointers.has(ev.pointerId)) return;
    bgPointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pinch) {
      moved = true;
      dom.board.classList.add('is-panning');
      updatePinch();
      return;
    }
    if (ev.pointerId !== panId) return;
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 4) {
      moved = true;
      dom.board.classList.add('is-panning');
    }
    if (moved) {
      pan.x = origin.x + (ev.clientX - start.x);
      pan.y = origin.y + (ev.clientY - start.y);
      applyPan();
    }
  };

  const onUp = (ev) => {
    bgPointers.delete(ev.pointerId);
    if (pinch && bgPointers.size < 2) {
      // ピンチが終わった。残った指で、そのままキャンバスを動かし続けられるようにする
      pinch = null;
      const [restId, rest] = [...bgPointers.entries()][0] ?? [];
      if (rest) {
        panId = restId;
        start = { ...rest };
        origin = { ...pan };
      }
    }
    if (bgPointers.size === 0) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dom.board.classList.remove('is-panning');
      if (!moved) clearPending(); // ただのクリックなら、つなぎ途中の選択を解除
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
// マウスのホイール（トラックパッドのピンチも ctrl + ホイールとして届く）で拡大・縮小
function onWheel(e) {
  e.preventDefault();
  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 33; // 行単位で届く環境（Firefox など）
  const speed = e.ctrlKey ? 0.01 : 0.0015;
  zoomAt(e.clientX, e.clientY, zoom * Math.exp(-delta * speed));
}

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
      const w = toWorld(ev.clientX, ev.clientY);
      addNode(type, w.x - 76, w.y - 40);
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
// 重ねて表示している要素（条件パネルなど）の、キャンバス上の位置
function overlayRect(element) {
  if (!element || !element.offsetParent) return null;
  const r = element.getBoundingClientRect();
  const w = worldRect();
  return {
    x: (r.left - w.left) / zoom,
    y: (r.top - w.top) / zoom,
    w: r.width / zoom,
    h: r.height / zoom,
  };
}
// クリック・キーボードで置くときの位置（いま見えている範囲で、他のものと重ならない所）
function findFreePosition() {
  // いま見えている範囲（キャンバス上の座標）
  const W = dom.board.clientWidth / zoom;
  const H = dom.board.clientHeight / zoom;
  const w = 152;
  const h = 130;
  const left = -pan.x / zoom;
  const top = -pan.y / zoom;

  const blocked = graph.nodes.map((n) => {
    const e = nodeElOf(n.id);
    return { x: n.x, y: n.y, w: e?.offsetWidth ?? w, h: e?.offsetHeight ?? h };
  });
  [dom.sideStack, dom.toolbar, dom.paletteBar].forEach((overlay) => {
    const r = overlayRect(overlay);
    if (r) blocked.push(r);
  });

  for (let y = top + 70; y + h <= top + H - 10; y += 70) {
    for (let x = left + 20; x + w <= left + W - 10; x += 80) {
      const hit = blocked.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
      if (!hit) return { x, y };
    }
  }
  return {
    x: left + 40 + (graph.nodes.length % 6) * 30,
    y: top + 90 + (graph.nodes.length % 5) * 30,
  };
}
// グラフが変わったら、前の結果は古くなる
function onGraphChanged() {
  hideResult();
  clearOutcome();
}

function createPacketChip() {
  const chip = el('div', 'node-packet');
  chip.hidden = true;
  chip.append(el('span', 'packet-dot'), el('span', 'packet-text'));
  return chip;
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
  const b = worldRect();
  return {
    x: (r.left + r.width / 2 - b.left) / zoom,
    y: (r.top + r.height / 2 - b.top) / zoom,
  };
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

function drawTempEdge(from, clientX, clientY) {
  const a = portCenter(from.node, from.port, 'out');
  if (!a) return;
  const end = toWorld(clientX, clientY);
  dom.tempLayer.replaceChildren(svgEl('path', { class: 'edge-temp', d: route(a, end) }));
}

function clearTempEdge() {
  dom.tempLayer.replaceChildren();
}
// --- ステージの条件パネル ---
function attackerKeys(s) {
  const type = String(s.attacker?.type ?? '').toLowerCase();
  return type.split(/[+,&\s]+/).filter((key) => key in ATTACKERS);
}

function requirementsText(list) {
  return (list ?? [])
    .map((r) => {
      const info = REQUIREMENTS[r];
      return info ? `${info.label}（${info.desc}）` : r;
    })
    .join('、');
}

function setBriefCollapsed(collapsed) {
  dom.briefPanel.classList.toggle('is-collapsed', collapsed);
  dom.briefToggle.setAttribute('aria-expanded', String(!collapsed));
  dom.briefToggle.textContent = collapsed ? '条件を見る' : '隠す';
}
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

function skipSimulation() {
  sim.skipped = true;
  [...sim.jobs].forEach((job) => {
    sim.jobs.delete(job);
    job.finish();
  });
}

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
  dom.editor.classList.remove('has-result');
  if (briefRestore !== null) {
    setBriefCollapsed(!briefRestore);
    briefRestore = null;
  }
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

function showStatus(message, isError = false) {
  dom.status.textContent = message;
  dom.status.hidden = false;
  dom.status.classList.toggle('is-error', isError);
}

function resetBoard() {
  seq = 0;
  energyState.clear();
  resetView();
  graph = initialGraph();
  renderNodes();
  hideResult();
  clearOutcome();
}

/* ==========================================================
   部品の追加・つなぎ方
   ========================================================== */

// 鍵ペアの持ち主の初期値（すでに置いてあれば、もう一方）
function defaultOwner() {
  const preferred = stage.defaults?.owner ?? 'bob';
  const used = graph.nodes.some((n) => n.type === 'keypair' && n.params.owner === preferred);
  if (!used) return preferred;
  return preferred === 'bob' ? 'alice' : 'bob';
}

function addNode(type, x, y) {
  const def = COMPONENTS[type];
  const node = { id: nextId(type), type, x, y, params: {} };
  if (def.hasAlgorithm) node.params.algorithm = stage.algorithms[0];
  if (def.hasOwner) node.params.owner = defaultOwner();
  if (def.hasBits) node.params.bits = stage.rsaBits[0];
  graph.nodes.push(node);
  renderNodes();
  onGraphChanged();
  return node;
}

// from: { node, port, type } / toEl: 入力ポートの要素
function isCompatible(from, toEl) {
  return Boolean(
    toEl &&
      toEl.dataset.dir === 'in' &&
      toEl.dataset.node !== from.node &&
      typesCompatible(from.type, toEl.dataset.type)
  );
}

function connect(from, toEl) {
  const to = { node: toEl.dataset.node, port: toEl.dataset.port };
  const port = getPortDef(to.node, to.port, 'in');
  if (!port) return;

  if (port.multi) {
    // データの入口には、何本でもつなげる（まとめて1つの荷物になる）
    const dup = graph.edges.some(
      (e) =>
        e.from.node === from.node && e.from.port === from.port && e.to.node === to.node && e.to.port === to.port
    );
    if (dup) return;
  } else {
    // 鍵の入口につながる線は1本だけ。つなぎ直したら置き換える。
    graph.edges = graph.edges.filter((e) => !(e.to.node === to.node && e.to.port === to.port));
  }
  graph.edges.push({
    id: nextId('edge'),
    type: from.type,
    from: { node: from.node, port: from.port },
    to,
  });
  renderEdges();
  onGraphChanged();
}

/* ==========================================================
   描画: ノード
   ========================================================== */

function renderNodes() {
  clearPending();
  dom.world.querySelectorAll('.node').forEach((n) => n.remove());
  graph.nodes.forEach((node) => dom.world.append(createNodeEl(node)));
  refreshEveCaps();
  renderEdges();
}

function createSelect(node, param, options, ariaLabel) {
  const select = el('select', 'node-algo');
  select.setAttribute('aria-label', ariaLabel);
  options.forEach(([value, label]) => {
    const opt = el('option', null, label);
    opt.value = String(value);
    opt.selected = String(node.params[param]) === String(value);
    select.append(opt);
  });
  select.addEventListener('change', () => {
    node.params[param] = param === 'bits' ? Number(select.value) : select.value;
    onGraphChanged();
  });
  return select;
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
  if (nodeHelpTerm(node)) {
    const help = el('button', 'node-help', '?');
    help.type = 'button';
    help.setAttribute('aria-label', `${def.label}とは？`);
    help.title = `${def.label}とは？`;
    help.addEventListener('click', () => openTerm(nodeHelpTerm(node)));
    head.append(help);
  }
  if (def.removable !== false) {
    const remove = el('button', 'node-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `${def.label}を削除`);
    remove.addEventListener('click', () => removeNode(node.id));
    head.append(remove);
  }
  root.append(head);

  // 設定（アルゴリズム・鍵の持ち主・鍵の長さ）
  if (def.hasAlgorithm) {
    const ids = availableAlgorithms(stage, activeObjective);
    if (node.params.algorithm && !ids.includes(node.params.algorithm)) ids.push(node.params.algorithm);
    if (ids.length > 1) {
      root.append(
        createSelect(node, 'algorithm', ids.map((id) => [id, algorithmInfo(id).label]), `${def.label}のアルゴリズム`)
      );
    } else {
      root.append(el('span', 'node-algo-fixed', algorithmInfo(node.params.algorithm).label));
    }
  }
  if (def.hasOwner) {
    root.append(
      createSelect(node, 'owner', [['alice', 'Aliceの鍵'], ['bob', 'Bobの鍵']], '鍵の持ち主')
    );
  }
  if (def.hasBits) {
    if (stage.rsaBits.length > 1) {
      root.append(createSelect(node, 'bits', stage.rsaBits.map((b) => [b, `RSA ${b}ビット`]), '鍵の長さ'));
    } else {
      root.append(el('span', 'node-algo-fixed', `RSA ${node.params.bits}ビット`));
    }
  }

  if (node.type === 'channel') {
    buildChannelBody(root, node);
  } else {
    def.inputs.forEach((port) => root.append(createPortRow(node, port, 'in')));
    def.outputs.forEach((port) => root.append(createPortRow(node, port, 'out')));
    if (node.type !== 'key' && node.type !== 'keypair') root.append(createPacketChip());
  }

  // ドラッグ移動
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.port, select, .node-remove, .node-help')) return;
    startNodeDrag(e, node, root);
  });

  return root;
}

function stageChecksMetadata() {
  return objectiveKeys(stage).some((k) => (stage.objectives[k].require ?? []).includes('metadata'));
}

// 通信路: 中を流れるデータと、攻撃者の「盗む → 解析する → 攻撃する」を見せる
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
  if (keys.length === 0) return;

  root.append(el('div', 'tap-line'));

  const box = el('div', 'eve-box');
  const head = el('div', 'eve-head');
  keys.forEach((k) => head.append(el('span', `badge ${ATTACKERS[k].className}`, ATTACKERS[k].label)));
  head.append(el('span', 'eve-caps'));
  box.append(head);

  box.append(createEveRow('傍受', 'capture'), createEveRow('解析', 'analysis'));
  if (stageChecksMetadata()) box.append(createEveRow('宛先・アプリ', 'meta'));
  if (keys.includes('mallory')) {
    box.append(createEveRow('攻撃', 'attack'), createEveRow('Bob は', 'result'));
  }

  const copy = el('div', 'eve-copy');
  copy.hidden = true;
  copy.append(el('span', 'packet-dot'), el('span', 'packet-text'));
  box.append(copy);
  root.append(box);
}

/* ==========================================================
   描画: 線
   ========================================================== */

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

/* ==========================================================
   描画: 部品一覧・凡例・条件パネル
   ========================================================== */

function renderPalette() {
  dom.palette.replaceChildren();
  availableComponents(stage, activeObjective).forEach((type) => {
    const def = COMPONENTS[type];
    const btn = el('button', `palette-item palette-${type}`);
    btn.type = 'button';
    const name = el('strong', null, def.label);
    // このステージで初めて出てくる部品 / この条件でだけ使える先取りの部品 に目印をつける
    if ((stage.introduces ?? []).includes(type)) name.append(el('em', 'palette-tag tag-new', 'NEW'));
    else if (!stage.components.includes(type)) name.append(el('em', 'palette-tag tag-preview', '先取り'));
    btn.append(name, el('span', null, def.desc ?? ''));
    btn.addEventListener('pointerdown', (e) => startPaletteDrag(e, type, def.label));
    btn.addEventListener('click', () => {
      if (suppressPaletteClick) return;
      const pos = findFreePosition();
      addNode(type, pos.x, pos.y);
    });
    dom.palette.append(btn);
  });
}

// データの色の凡例（いま使える部品に合わせて変わる）
function renderLegend() {
  dom.legend.replaceChildren();
  const comps = new Set(availableComponents(stage, activeObjective));
  const items = [{ label: '元のデータ', color: COLORS.plain }];

  if (comps.has('encrypt')) {
    availableAlgorithms(stage, activeObjective).forEach((id) => {
      items.push({ label: `暗号文（${algorithmInfo(id).short}）`, color: algorithmInfo(id).color });
    });
  }
  if (comps.has('pkenc')) items.push({ label: '暗号文（RSA）', color: algorithmInfo('rsa2048').color });
  if (comps.has('tls')) items.push({ label: 'TLS通信', color: algorithmInfo('tls').color });
  if (comps.has('vpn')) items.push({ label: 'VPN通信', color: algorithmInfo('vpn').color });

  items.push({ label: '共通鍵', color: COLORS.key });
  if (comps.has('keypair')) {
    items.push({ label: '公開鍵', color: COLORS.pub }, { label: '秘密鍵', color: COLORS.priv });
  }
  if (['hash', 'mac', 'sign', 'ca'].some((t) => comps.has(t))) {
    items.push({ label: 'ハッシュ・署名・証明書', color: COLORS.auth });
  }
  if (attackerKeys(stage).includes('mallory')) items.push({ label: '改ざん・偽造データ', color: COLORS.bad });
  items.push({ label: '意味のないデータ', color: COLORS.garbled });

  items.forEach((item) => {
    const li = el('li');
    const dot = el('span', 'legend-dot');
    dot.style.setProperty('--chip', item.color);
    li.append(dot, el('span', null, item.label));
    dom.legend.append(li);
  });
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
    case 'attacks':
      return (value ?? []).map((a) => ATTACKS[a]?.label ?? a).join('・') || 'なし';
    case 'seesMetadata':
      return value === false ? '見えない' : '見える';
    default:
      return String(value);
  }
}

function describeRules(rules) {
  const lines = [];
  (rules.noPreshare ?? []).forEach((k) => {
    lines.push(
      k === 'key'
        ? '共通鍵は、事前には共有できません'
        : 'Alice の公開鍵は、事前には受け取れません（通信路で届ける）'
    );
  });
  if (rules.largeBody) lines.push('本文が大きいので、公開鍵暗号では直接暗号化できません');
  if (Array.isArray(rules.onlyComponents)) {
    lines.push(`使える部品: ${rules.onlyComponents.map((t) => COMPONENTS[t]?.label ?? t).join('・')}だけ`);
  }
  return lines;
}

function describeUnlock(unlock) {
  const names = [
    ...(unlock?.components ?? []).map((t) => COMPONENTS[t]?.label ?? t),
    ...(unlock?.algorithms ?? []).map((a) => algorithmInfo(a).label),
  ];
  return names.length ? `この条件でだけ使える新しい部品: ${names.join('・')}` : '';
}

function renderBrief() {
  const title = stage.title ?? stage.id;
  document.title = `CRYPTA | ${title}`;
  $('#stage-title').textContent = title;
  $('#stage-goal').textContent = stage.goal ?? '';

  // このステージで学ぶこと
  const lessonBox = $('#brief-lesson');
  const lessonList = $('#lesson-list');
  lessonList.replaceChildren();
  (stage.lesson ?? []).forEach((item) => {
    lessonList.append(el('dt', null, item.label), elT('dd', null, item.text));
  });
  lessonBox.hidden = !(stage.lesson ?? []).length;

  // 攻撃者
  const badges = $('#attacker-badges');
  badges.replaceChildren();
  attackerKeys(stage).forEach((key) => {
    const a = ATTACKERS[key];
    badges.append(el('span', `badge ${a.className}`, `${a.label}（${a.role}）`));
  });

  const dl = $('#attacker-caps');
  dl.replaceChildren();
  Object.entries(stage.attacker?.capabilities ?? {}).forEach(([key, value]) => {
    const dt = el('dt');
    if (ENV_TERMS[key]) dt.append(termButton(CAP_LABELS[key] ?? key, ENV_TERMS[key]));
    else dt.textContent = CAP_LABELS[key] ?? key;
    const dd = el('dd', null, capText(key, value));
    if (ENV_NOTES[key]) dd.append(el('small', null, ENV_NOTES[key]));
    dl.append(dt, dd);
  });

  // クリア条件
  const list = $('#objective-list');
  list.replaceChildren();
  objectiveKeys(stage).forEach((key) => {
    const obj = stage.objectives[key];
    const li = el('li', 'objective');
    li.append(el('span', 'objective-mark', key));
    const body = el('div');
    body.append(elT('p', 'objective-title', requirementsText(obj.require) || '（条件なし）'));

    if (obj.attackerOverride) {
      const changes = Object.entries(obj.attackerOverride)
        .map(([k, v]) => `${CAP_LABELS[k] ?? k}が「${capText(k, v)}」`)
        .join('、');
      body.append(el('p', 'objective-note', `攻撃者: ${changes}`));
    }
    describeRules(rulesFor(stage, key)).forEach((line) => body.append(el('p', 'objective-note', line)));
    const unlock = describeUnlock(obj.unlock);
    if (unlock) body.append(el('p', 'objective-note objective-unlock', unlock));

    li.append(body);
    list.append(li);
  });
}

// 「どの攻撃者の強さで見るか」の切り替え（Objective が複数あるときだけ）
function renderObjectiveToggle() {
  const keys = objectiveKeys(stage);
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
      renderPalette(); // この条件で使える部品に切り替える
      renderLegend();
      renderNodes();
    });
    box.append(btn);
  });
}

// 通信路の攻撃者欄に、いま見ている攻撃者の能力を出す
function refreshEveCaps() {
  const caps = capsFor(stage, activeObjective);
  const parts = [`計算能力: ${capText('compute', caps.compute)}`];
  if (attackerKeys(stage).includes('mallory') && (caps.attacks ?? []).length > 0) {
    parts.push(`攻撃: ${capText('attacks', caps.attacks)}`);
  }
  const text = parts.join(' / ');
  dom.board.querySelectorAll('.eve-caps').forEach((n) => { n.textContent = text; });
}


/* ==========================================================
   アニメーション
   ========================================================== */
// engine.js が求めた「流れ」を、線の上を電気が流れる様子として再生する。
//   ・元のデータはオレンジ、暗号化されたデータは方式ごとの色、鍵は紫、改ざんされたものは赤
//   ・部品は、入ってくる線がすべて着いてから動く（鍵と本文の両方が必要な暗号化など）
//   ・出力が枝分かれしていれば、並行して流れる
//   ・通信路の中では、攻撃者が「盗む → 解析する」、Mallory は「攻撃する」様子を見せる
//   ・Mallory の攻撃は、そのあと1つずつ流し直して見せる

const wait = (ms) => runTween(ms * SPEED, () => {});

// 線に沿って電気を伸ばす
function drawEdge(edge, color, factor = 1) {
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

  const duration = clamp(len / 0.3, 500, 1800) * factor * SPEED;
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
function setNodeChip(nodeId, { text, color, title }) {
  const chip = nodeElOf(nodeId)?.querySelector('.node-packet');
  if (!chip) return;
  chip.hidden = false;
  chip.style.setProperty('--chip', color ?? COLORS.garbled);
  chip.querySelector('.packet-text').textContent = text;
  if (title) chip.title = title;
  else chip.removeAttribute('title');
}

function setTube(nodeEl, bundle) {
  const slot = nodeEl.querySelector('.tube-packet');
  slot.style.setProperty('--chip', bundleColor(bundle));
  slot.querySelector('.packet-text').textContent = bundleText(bundle);
}

function setRow(nodeEl, row, text, tone) {
  const value = nodeEl.querySelector(`.eve-row[data-row="${row}"] .eve-value`);
  if (!value) return;
  value.textContent = text;
  value.className = `eve-value${tone ? ` tone-${tone}` : ''}`;
}

const algNames = (algs) => algs.map((a) => algorithmInfo(a).short).join('・');

// 通信路で盗んだものを、攻撃者がどこまで読めたか（通信が先へ進むのと並行して見せる）
async function playObserver(nodeEl, obj, bundle) {
  const tap = nodeEl.querySelector('.tap-line');
  if (!tap) return;
  const x = obj.exposure;
  const copy = nodeEl.querySelector('.eve-copy');

  setRow(nodeEl, 'capture', '傍受中…', 'work');
  setRow(nodeEl, 'analysis', '待機中', null);
  copy.hidden = true;
  await wait(450);

  // ① 盗めたか
  if (!x.captured) {
    setRow(nodeEl, 'capture', '盗めない', 'good');
    setRow(nodeEl, 'analysis', '—', null);
    setRow(nodeEl, 'meta', '見えない', 'good');
    return;
  }
  tap.style.background = bundleColor(bundle);
  setRow(nodeEl, 'capture', '盗んだ！', 'work');
  copy.hidden = false;
  copy.style.setProperty('--chip', bundleColor(bundle));
  copy.querySelector('.packet-text').textContent = bundleText(bundle);
  await wait(500);

  // 宛先・アプリ（ヘッダーは暗号化されない）
  if (x.meta) {
    setRow(
      nodeEl,
      'meta',
      x.metaReveals ? `${x.meta.dest} / ${x.meta.app} が見える` : '本当の宛先は見えない',
      x.metaReveals ? 'bad' : 'good'
    );
  }

  // ② 解析できたか
  if (x.msgRead) {
    if (x.how === 'plain') {
      setRow(nodeEl, 'analysis', 'そのまま読めた', 'bad');
    } else if (x.how === 'keyleak') {
      setRow(nodeEl, 'analysis', '流れていた鍵で開けた！', 'bad');
    } else {
      setRow(nodeEl, 'analysis', `${algNames(x.crackedAlgs)} を解読中…`, 'work');
      await wait(1000);
      setRow(nodeEl, 'analysis', '解読できた！', 'bad');
    }
    copy.style.setProperty('--chip', COLORS.plain);
    copy.querySelector('.packet-text').textContent = stageMessage(stage);
  } else if (x.blocker) {
    const name = algorithmInfo(x.blocker.t === 'enc' ? x.blocker.alg : x.blocker.t).short;
    setRow(nodeEl, 'analysis', `${name} を解読中…`, 'work');
    await wait(1000);
    setRow(nodeEl, 'analysis', '解読できない', 'good');
  } else {
    setRow(nodeEl, 'analysis', '読める本文がない', 'good');
  }
}

const ATTACK_DEEDS = {
  tamper: '通信の途中で、データを書き換えた',
  forge: '偽のメッセージを作って送った',
  keyswap: '公開鍵を、自分のものに差し替えた',
  replay: '過去の通信を、そのまま再送した',
};

// Mallory の攻撃（通信路を通るデータを書き換えて、先へ流す）
async function playMallory(nodeEl, flow, ctx, tw) {
  const name = ctx.attack.name;
  setRow(nodeEl, 'attack', ATTACKS[name].label, 'bad');
  setRow(nodeEl, 'result', '…', 'work');
  await tw(350);
  setTube(nodeEl, flow.channelOut);
  const tap = nodeEl.querySelector('.tap-line');
  if (tap) tap.style.background = COLORS.bad;
  const copy = nodeEl.querySelector('.eve-copy');
  if (copy) {
    copy.hidden = false;
    copy.style.setProperty('--chip', COLORS.bad);
    copy.querySelector('.packet-text').textContent = ATTACK_DEEDS[name];
  }
  await tw(450);
}

function setMalloryResult(nodeEl, a, graphRef) {
  const b = a.flow.bob;
  if (a.outcome === 'bad') {
    const what = b.replayed && b.msg?.v === 'orig' ? '古い通信' : BAD_LABELS[b.msg?.v] ?? 'おかしなデータ';
    setRow(nodeEl, 'result', `${what}を受け入れた…`, 'bad');
  } else if (a.outcome === 'rejected') {
    const r = a.flow.rejects[0];
    const node = graphRef.nodes.find((n) => n.id === r.node);
    setRow(nodeEl, 'result', `「${COMPONENTS[node.type].label}」で見抜いた！`, 'good');
  } else if (a.outcome === 'ok') {
    setRow(nodeEl, 'result', '影響なし', 'good');
  } else {
    setRow(nodeEl, 'result', '届かなかった', 'good');
  }
}

function mainOutput(flow, id) {
  const outs = flow.outputs?.get(id) ?? {};
  const def = COMPONENTS[findNode(id).type];
  for (const p of def.outputs) if (outs[p.id]) return outs[p.id];
  return null;
}

const hasEdges = (id) => graph.edges.some((e) => e.from.node === id || e.to.node === id);

// 1回分の流れ（本物の通信 / Mallory の攻撃ごと）を再生する
async function playFlow(flow, ctx) {
  const tw = (ms) => wait(ctx.attack ? ms * 0.5 : ms);
  const factor = ctx.attack ? 0.55 : 1;
  const nodeP = new Map();
  const edgeP = new Map();
  const side = []; // 通信と並行して進む動き（攻撃者の解析など）

  const intoNode = (id) => graph.edges.filter((e) => e.to.node === id);

  function playNode(id) {
    if (nodeP.has(id)) return nodeP.get(id);
    nodeP.set(id, Promise.resolve()); // 配線がぐるぐる回っていても止まらないように
    const p = (async () => {
      await Promise.all(intoNode(id).map(playEdge));
      await visit(id);
    })();
    nodeP.set(id, p);
    return p;
  }

  function playEdge(e) {
    if (edgeP.has(e.id)) return edgeP.get(e.id);
    const p = (async () => {
      await playNode(e.from.node);
      const v = flow.edgeValues.get(e.id);
      if (v) await drawEdge(e, valueColor(v), factor);
    })();
    edgeP.set(e.id, p);
    return p;
  }

  async function visit(id) {
    const node = findNode(id);
    const nodeEl = nodeElOf(id);
    if (!node || !nodeEl) return;
    const st = flow.info.get(id) ?? { status: 'ok', note: '' };

    switch (node.type) {
      case 'alice': {
        nodeEl.classList.add('is-active');
        const out = mainOutput(flow, id);
        if (out) setNodeChip(id, { text: bundleText(out), color: valueColor(out) });
        await tw(500);
        nodeEl.classList.remove('is-active');
        return;
      }
      case 'key':
      case 'keypair':
        return;
      case 'channel': {
        if (st.status !== 'ok') return;
        setTube(nodeEl, flow.channelIn);
        nodeEl.classList.add('is-active');
        if (ctx.honest && ctx.obj.exposure) side.push(playObserver(nodeEl, ctx.obj, flow.channelIn));
        if (ctx.attack) await playMallory(nodeEl, flow, ctx, tw);
        else await tw(500);
        nodeEl.classList.remove('is-active');
        return;
      }
      case 'bob': {
        const b = flow.bob;
        if (b.status === 'none') return;
        const bad = !b.msg || b.msg.v !== 'orig' || b.replayed;
        const text = b.msg ? `${b.msg.text}${b.replayed ? '（再送）' : ''}` : bundleText(b.bundle);
        setNodeChip(id, { text, color: bad ? COLORS.bad : COLORS.plain });
        nodeEl.classList.add(bad ? 'is-garbled' : 'is-received');
        await tw(300);
        return;
      }
      default:
        break;
    }

    // 暗号化・復号・ハッシュ・署名など
    if (st.status === 'ok' || st.status === 'reject') {
      nodeEl.classList.add('is-active');
      await tw(450);
      nodeEl.classList.remove('is-active');
      if (st.status === 'reject') {
        nodeEl.classList.add('is-blocked');
        setNodeChip(id, { text: '見抜いた！', color: COLORS.bad, title: st.note });
        await tw(300);
      } else {
        const v = mainOutput(flow, id);
        if (v) setNodeChip(id, { text: valueText(v), color: valueColor(v) });
        await tw(250);
      }
    } else if (st.status === 'blocked' && hasEdges(id)) {
      nodeEl.classList.add('is-blocked');
      setNodeChip(id, { text: '動けない', color: COLORS.bad, title: st.note });
    }
  }

  await Promise.all(graph.nodes.map((n) => playNode(n.id)));
  await Promise.all(side);
  await tw(300);
}

async function playRun(obj) {
  await playFlow(obj.honest, { honest: true, obj });
  if (obj.status !== 'done' || obj.attacks.length === 0) return;

  const channelEl = dom.board.querySelector('.node-channel');
  for (const a of obj.attacks) {
    await wait(600);
    clearFlowVisuals();
    await playFlow(a.flow, { attack: a, obj });
    if (channelEl) setMalloryResult(channelEl, a, graph);
    await wait(500);
  }
}

// 電気・ノードの状態・ノードの下のデータ表示を消す（攻撃者の欄はそのまま）
function clearFlowVisuals() {
  energyState.clear();
  dom.sparkLayer.replaceChildren();
  renderEdges();
  dom.board.querySelectorAll('.node').forEach((n) => {
    n.classList.remove('is-active', 'is-blocked', 'is-received', 'is-garbled');
  });
  dom.board.querySelectorAll('.node-packet').forEach((c) => { c.hidden = true; });
}

// 前回のシミュレーション結果の表示をすべて消す
function clearOutcome() {
  clearFlowVisuals();
  dom.board.querySelectorAll('.node').forEach((n) => n.classList.remove('is-breached', 'is-safe'));

  dom.board.querySelectorAll('.node-channel').forEach((ch) => {
    const slot = ch.querySelector('.tube-packet');
    slot.style.removeProperty('--chip');
    slot.querySelector('.packet-text').textContent = '—';
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

function markOutcome(obj) {
  const ch = dom.board.querySelector('.node-channel');
  if (!ch || obj.status !== 'done') return;
  const breached = obj.checks.some((c) => c.key !== 'delivery' && !c.met);
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

  const ranKey = activeObjective; // 実行中に切り替えられても、この結果は実行した攻撃者のもの
  const res = evaluateStage(stage, graph);
  const obj = res.objectives[ranKey];

  setSimulating(true);
  try {
    await playRun(obj);
  } finally {
    setSimulating(false);
  }

  markOutcome(obj);
  showResult(res, ranKey);
}

/* ==========================================================
   解説
   ========================================================== */

const GUIDE_SEEN_PREFIX = 'crypta:guide:';

function guideSeen(id) {
  try {
    return localStorage.getItem(`${GUIDE_SEEN_PREFIX}${id}`) === '1';
  } catch {
    return false;
  }
}

function markGuideSeen(id) {
  try {
    localStorage.setItem(`${GUIDE_SEEN_PREFIX}${id}`, '1');
  } catch {
    /* 保存できなくても、解説は見られる */
  }
}

/* ----------------------------------------------------------
   用語集・用語の説明
   ---------------------------------------------------------- */

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALIASES = GLOSSARY.flatMap((t) => (t.aliases ?? []).map((a) => [a, t.id])).sort(
  (a, b) => b[0].length - a[0].length
);
const ALIAS_MAP = new Map(ALIASES);
const ALIAS_RE = new RegExp(ALIASES.map(([a]) => escapeRe(a)).join('|'), 'g');

function termButton(label, id) {
  const b = el('button', 'term', label);
  b.type = 'button';
  b.dataset.term = id;
  b.title = `${GLOSSARY_BY_ID.get(id)?.term ?? label} とは？`;
  return b;
}

// 文章の中の用語を、説明を開けるリンクにする（同じ用語は、その文章の中で最初の1回だけ）
function linkify(text, exclude) {
  const frag = document.createDocumentFragment();
  const used = new Set(exclude ? [exclude] : []);
  let last = 0;
  for (const m of text.matchAll(ALIAS_RE)) {
    const id = ALIAS_MAP.get(m[0]);
    if (!id || used.has(id)) continue;
    used.add(id);
    if (m.index > last) frag.append(text.slice(last, m.index));
    frag.append(termButton(m[0], id));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

function elT(tag, className, text, exclude) {
  const node = el(tag, className);
  node.append(linkify(text, exclude));
  return node;
}

// 部品の「?」ボタンで開く用語
function nodeHelpTerm(node) {
  switch (node.type) {
    case 'alice':
    case 'bob':
      return 'alice-bob';
    case 'channel':
      return 'channel';
    case 'encrypt':
    case 'decrypt':
      return { caesar: 'caesar', substitution: 'substitution', enigma: 'enigma', aes: 'aes' }[node.params.algorithm] ?? 'encryption';
    case 'key':
      return 'sharedkey';
    case 'keypair':
      return 'publickey';
    case 'pkenc':
    case 'pkdec':
      return 'rsa';
    case 'hash':
    case 'hashcheck':
      return 'hash';
    case 'mac':
    case 'maccheck':
      return 'mac';
    case 'sign':
    case 'verify':
      return 'signature';
    case 'ca':
    case 'certcheck':
      return 'certificate';
    case 'tls':
    case 'tlsopen':
      return 'tls';
    case 'vpn':
    case 'vpnopen':
      return 'vpn';
    default:
      return null;
  }
}

// 解説の1項目（見出し・本文・手順や計算例の枠）を作る
function createSection(sec, exclude) {
  const box = el('section', 'guide-section');
  box.append(el('h3', null, sec.h));
  if (sec.p) box.append(elT('p', null, sec.p, exclude));
  if (sec.code) box.append(el('pre', 'guide-code', sec.code));
  return box;
}

let termReturnFocus = null;

function openTerm(id) {
  const t = GLOSSARY_BY_ID.get(id);
  if (!t) return;
  if (dom.term.hidden) termReturnFocus = document.activeElement;

  dom.termCat.textContent = t.cat;
  dom.termTitle.textContent = t.term;
  const body = dom.termBody;
  body.replaceChildren();
  body.append(elT('p', 'guide-lead', t.short, t.id));
  t.sections.forEach((sec) => body.append(createSection(sec, t.id)));
  const see = (t.see ?? []).filter((x) => GLOSSARY_BY_ID.has(x));
  if (see.length) {
    const box = el('section', 'term-see');
    box.append(el('h3', null, 'あわせて読む'));
    const chips = el('div', 'term-chips');
    see.forEach((x) => {
      const chip = termButton(GLOSSARY_BY_ID.get(x).term, x);
      chip.className = 'term-chip';
      chips.append(chip);
    });
    box.append(chips);
    body.append(box);
  }
  dom.term.hidden = false;
  body.scrollTop = 0;
  $('#term-close').focus();
}

function closeTerm() {
  if (dom.term.hidden) return;
  dom.term.hidden = true;
  termReturnFocus?.focus?.();
}

function buildGlossary() {
  const list = $('#glossary-list');
  list.replaceChildren();
  GLOSSARY_CATEGORIES.forEach((cat) => {
    const items = GLOSSARY.filter((t) => t.cat === cat);
    if (items.length === 0) return;
    const group = el('section', 'glossary-group');
    group.append(el('h3', null, cat));
    const ul = el('ul', 'glossary-items');
    items.forEach((t) => {
      const li = el('li');
      li.dataset.search = `${t.term} ${t.short} ${(t.aliases ?? []).join(' ')}`.toLowerCase();
      const b = el('button', 'glossary-item');
      b.type = 'button';
      b.dataset.term = t.id;
      b.append(el('strong', null, t.term), el('span', null, t.short));
      li.append(b);
      ul.append(li);
    });
    group.append(ul);
    list.append(group);
  });
}

function filterGlossary(query) {
  const q = query.trim().toLowerCase();
  dom.glossary.querySelectorAll('.glossary-group').forEach((group) => {
    let any = false;
    group.querySelectorAll('li').forEach((li) => {
      const hit = !q || li.dataset.search.includes(q);
      li.hidden = !hit;
      if (hit) any = true;
    });
    group.hidden = !any;
  });
}

let glossaryReturnFocus = null;

function openGlossary() {
  glossaryReturnFocus = document.activeElement;
  dom.glossary.hidden = false;
  $('#glossary-search').value = '';
  filterGlossary('');
  dom.glossary.querySelector('.guide-body').scrollTop = 0;
  $('#glossary-search').focus();
}

function closeGlossary() {
  if (dom.glossary.hidden) return;
  dom.glossary.hidden = true;
  glossaryReturnFocus?.focus?.();
}

function createPartCard(type) {
  const def = COMPONENTS[type];
  const card = el('div', 'guide-part');
  card.append(el('strong', null, def.label), el('span', null, def.desc ?? ''));
  if (def.howto) card.append(elT('p', null, def.howto));
  return card;
}

function buildGuide() {
  const g = stage.guide;
  const body = dom.guideBody;
  body.replaceChildren();
  $('#guide-title').textContent = stage.title ?? stage.id;

  // まず「こんな場面」から。このゲームのテーマの問いかけを、具体的な場面に置き換えて見せる。
  if (g.scene) {
    const scene = el('blockquote', 'guide-scene');
    scene.append(el('strong', null, '今送ったその情報、本当に大丈夫？'), elT('p', null, g.scene));
    body.append(scene);
  }
  if (g.summary) body.append(elT('p', 'guide-lead', g.summary));
  (g.sections ?? []).forEach((sec) => body.append(createSection(sec)));

  // 部品の使い方: このステージで新しく出てくるもの → Objective B で先に試せるもの → ほか
  const introduces = (stage.introduces ?? []).filter((t) => COMPONENTS[t]);
  const preview = [];
  objectiveKeys(stage).forEach((key) => {
    (stage.objectives[key].unlock?.components ?? []).forEach((t) => {
      if (COMPONENTS[t] && !preview.includes(t)) preview.push(t);
    });
  });
  const others = stage.components.filter((t) => COMPONENTS[t] && !introduces.includes(t));

  if (introduces.length) {
    const box = el('section', 'guide-parts');
    box.append(el('h3', null, 'このステージで新しく使う部品'));
    introduces.forEach((t) => box.append(createPartCard(t)));
    body.append(box);
  }
  if (preview.length) {
    const box = el('section', 'guide-parts');
    box.append(el('h3', null, 'Objective B で先に試せる部品'));
    preview.forEach((t) => box.append(createPartCard(t)));
    body.append(box);
  }
  if (others.length) {
    const more = el('details', 'guide-more');
    more.append(el('summary', null, 'ほかの部品の使い方'));
    others.forEach((t) => more.append(createPartCard(t)));
    body.append(more);
  }
}

function openGuide() {
  if (!stage.guide) return;
  buildGuide();
  dom.guide.hidden = false;
  dom.guideBody.scrollTop = 0;
  $('#guide-close').focus();
}

function closeGuide() {
  if (dom.guide.hidden) return;
  dom.guide.hidden = true;
  markGuideSeen(stage.id);
  dom.guideOpen.focus();
}

// 結果の下に出す、解説（クリアしたとき）またはヒント（まだのとき）
function createExplain(obj, key) {
  const g = stage.guide;
  if (!g) return null;
  const box = el('div', 'explain');
  if (obj.met) {
    const after = g.after?.[key];
    if (!after) return null;
    box.append(el('h4', null, '解説'));
    if (typeof after === 'string') {
      box.append(elT('p', null, after));
      return box;
    }
    if (after.learned) {
      const p = el('p', 'explain-learned');
      p.append(el('strong', null, '分かったこと'), linkify(after.learned));
      box.append(p);
    }
    if (after.question) {
      const q = el('p', 'explain-question');
      q.append(el('strong', null, '次に考えたいこと'), linkify(after.question));
      box.append(q);
    }
    return box;
  }
  const hints = g.hints ?? [];
  if (hints.length === 0) return null;
  box.classList.add('is-hint');
  box.append(el('h4', null, 'ヒント'));
  const ul = el('ul');
  hints.forEach((h) => ul.append(elT('li', null, h)));
  box.append(ul);
  return box;
}

/* ==========================================================
   結果表示
   ========================================================== */

function showResult(res, key = activeObjective) {
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

  const obj = res.objectives[key];

  if (obj.status === 'incomplete') {
    box.classList.add('is-incomplete');
    const head = el('div', 'result-head');
    head.append(el('h2', 'result-title', '通信に問題があります'), close);
    box.append(head);

    const ul = el('ul', 'result-problems');
    obj.problems.forEach((p) => ul.append(el('li', null, p)));
    box.append(ul);
    const hint = createExplain(obj, key);
    if (hint) box.append(hint);
    box.append(createActions(false));
    revealResult();
    return;
  }

  // 試した攻撃者（Objective）の結果だけを出す。A で試しているときに B は出さない。
  const keys = objectiveKeys(stage);
  const isFinal = key === keys[keys.length - 1]; // いちばん強い攻撃者で試しているか
  const allMet = Object.values(res.objectives).every((o) => o.met);
  // 守りの要件（機密性など）が破られたか、それとも Bob に届かなかっただけか
  const breached = obj.checks.some((c) => c.key !== 'delivery' && !c.met);
  box.classList.add(obj.met ? 'is-safe' : 'is-broken');

  let title = `Objective ${key} クリア！`;
  if (!obj.met) title = breached ? '💥 突破された！' : 'メッセージがうまく届いていません';
  else if (isFinal && allMet) title = '守り切った！';

  const head = el('div', 'result-head');
  head.append(el('h2', 'result-title', title));
  // 評価は、すべての Objective を試し終える最後の攻撃者のときだけ出す
  if (isFinal) {
    const chip = el('span', `rating rating-${res.rating}`, res.rating);
    chip.setAttribute('aria-label', `評価 ${res.rating}`);
    head.append(chip);
  }
  head.append(close);
  box.append(head);

  // 組んだ通信の流れ
  if (res.flow.length) box.append(el('p', 'result-flow', res.flow.join('  →  ')));

  // 試した Objective の結果
  const grid = el('div', 'result-objectives');
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
  box.append(grid);

  // Mallory の攻撃のようす（評価の対象でないものも含めて、参考として見せる）
  if (obj.attacks.length > 0) {
    const info = el('div', 'attack-info');
    info.append(el('h4', null, 'Mallory の攻撃のようす'));
    const ul = el('ul', 'attack-list');
    obj.attacks.forEach((a) => {
      ul.append(el('li', `attack-item ${a.outcome === 'bad' ? 'is-bad' : 'is-good'}`, a.text));
    });
    info.append(ul);
    box.append(info);
  }

  // 解説（クリアしたとき）／ヒント（まだのとき）
  const explain = createExplain(obj, key);
  if (explain) box.append(explain);

  if (obj.met && !isFinal) {
    // 次の（もっと強い）攻撃者がいることだけ伝える。結果は見せない。
    const nextKey = keys[keys.indexOf(key) + 1];
    box.append(
      el('p', 'result-note', `右上の「攻撃者」を ${nextKey} に切り替えて、もっと強い条件に挑戦しよう。`)
    );
  } else if (obj.met && isFinal && allMet) {
    // 無駄の指摘
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

  // 進捗: 最後の攻撃者まで試したら評価を保存。途中（A だけ）なら「A クリア」として B 評価を保存する。
  if (res.cleared) saveProgress(stage.id, isFinal ? res.rating : 'B');
  revealResult();
}

/* ==========================================================
   起動
   ========================================================== */

function normalizeStage(raw) {
  return {
    ...raw,
    components: Array.isArray(raw.components) ? raw.components : [],
    algorithms:
      Array.isArray(raw.algorithms) && raw.algorithms.length > 0 ? raw.algorithms : ['caesar'],
    rsaBits: Array.isArray(raw.rsaBits) && raw.rsaBits.length > 0 ? raw.rsaBits : [2048],
    defaults: raw.defaults ?? {},
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
  dom.world = $('#world');
  dom.zoomLabel = $('#zoom-label');
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
  dom.guide = $('#guide');
  dom.glossary = $('#glossary');
  dom.term = $('#term-dialog');
  dom.termBody = $('#term-body');
  dom.termCat = $('#term-cat');
  dom.termTitle = $('#term-title');
  dom.guideBody = $('#guide-body');
  dom.guideOpen = $('#guide-open');

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

  activeObjective = objectiveKeys(stage)[0];

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

  // 何もないところをドラッグするとキャンバスが動く（クリックだけなら、つなぎ途中の選択を解除）
  dom.board.addEventListener('pointerdown', startPan);
  dom.board.addEventListener('wheel', onWheel, { passive: false });
  $('#zoom-in').addEventListener('click', () => zoomByButton(1.25));
  $('#zoom-out').addEventListener('click', () => zoomByButton(1 / 1.25));
  $('#zoom-label').addEventListener('click', resetView);
  $('#zoom-fit').addEventListener('click', fitView);

  // 解説: 「解説」ボタンで開く。最初にそのステージを開いたときは、自動で開く。
  dom.guideOpen.hidden = !stage.guide;
  dom.guideOpen.addEventListener('click', openGuide);
  $('#guide-close').addEventListener('click', closeGuide);
  $('#guide-start').addEventListener('click', closeGuide);
  dom.guide.addEventListener('click', (e) => {
    if (e.target === dom.guide) closeGuide();
  });

  // 用語集・用語の説明
  buildGlossary();
  $('#glossary-open').addEventListener('click', openGlossary);
  $('#glossary-close').addEventListener('click', closeGlossary);
  $('#glossary-search').addEventListener('input', (e) => filterGlossary(e.target.value));
  dom.glossary.addEventListener('click', (e) => {
    if (e.target === dom.glossary) closeGlossary();
  });
  $('#term-close').addEventListener('click', closeTerm);
  $('#term-done').addEventListener('click', closeTerm);
  $('#term-glossary').addEventListener('click', () => {
    closeTerm();
    openGlossary();
  });
  dom.term.addEventListener('click', (e) => {
    if (e.target === dom.term) closeTerm();
  });
  // 下線つきの言葉・「?」・用語集の項目は、どこにあっても、その用語の説明を開く
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-term]');
    if (!t) return;
    e.preventDefault();
    openTerm(t.dataset.term);
  });

  // Esc は、いちばん手前に開いているものから閉じる
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!dom.term.hidden) closeTerm();
    else if (!dom.glossary.hidden) closeGlossary();
    else if (!dom.guide.hidden) closeGuide();
    else clearPending();
  });

  if (stage.guide && !guideSeen(stage.id)) openGuide();

  window.addEventListener('resize', renderEdges);
  if (document.fonts?.ready) document.fonts.ready.then(renderEdges);
}

init();
