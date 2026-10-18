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
import { GLOSSARY_BY_ID } from './glossary.js';
import {
  COMPONENTS, ATTACKS, REQUIREMENTS, COLORS,
  typesCompatible, availableComponents, availableAlgorithms,
  algorithmInfo, computeInfo, capsFor, rulesFor, objectiveKeys, stageMessage,
  bundleText, bundleColor, valueColor, valueText, valueLabel, evaluateStage,
  DEFAULT_ZONE, isPublicEdge,
} from './engine.js';
import {
  isStageUnlocked, clearedObjectives, recordObjective, stageIndex,
} from './progress.js';
import { linkifyText, termUnlocked } from './terms.js';

const STAGE_IDS = stagesModule.STAGE_IDS ?? [];

const ATTACKERS = {
  eve: { label: 'Eve', role: '盗聴', className: 'badge-eve' },
  mallory: { label: 'Mallory', role: '改ざん・なりすまし', className: 'badge-mallory' },
};

const CAP_LABELS = {
  compute: '計算能力',
  looksFor: '探すもの',
  attacks: 'できる攻撃',
  seesMetadata: '宛先・アプリ',
};
const CAP_ORDER = ['compute', 'looksFor', 'attacks', 'seesMetadata'];

// 攻撃者の環境の項目 → 用語集の説明（くわしい説明は、用語集にまとめてある）
const ENV_TERMS = {
  compute: 'env-compute',
  looksFor: 'env-seek',
  attacks: 'env-attacks',
  seesMetadata: 'metadata',
};

// ゾーン: 画面は、Alice のゾーン・公開ゾーン・Bob のゾーンの3つ。
// 部品は、置いたゾーンに属する。ゾーンをまたぐ線と、公開ゾーンの中の線は、攻撃者に見られる。
const ZONE_RANGE = { alice: [0, 720], public: [720, 1420], bob: [1420, 2140] };
const WORLD_W = 2140;
const ZONE_TAGS = {
  alice: '🔒 Alice のゾーン（自分だけが見える）',
  public: '👁 公開ゾーン（誰でも見られる）',
  bob: '🔒 Bob のゾーン（自分だけが見える）',
};

const BAD_LABELS = {
  tampered: '書き換えられた本文',
  forged: '偽の本文',
  garbled: '壊れたデータ',
};

// 部品一覧のタブ（部品が増えても、種類ごとに切り替えて探せるように）
const PALETTE_GROUPS = [
  { id: 'key', label: '鍵', types: ['key', 'keypair'] },
  { id: 'crypt', label: '暗号', types: ['encrypt', 'decrypt', 'pkenc', 'pkdec'] },
  { id: 'proof', label: '確認', types: ['hash', 'hashcheck', 'mac', 'maccheck', 'sign', 'verify', 'ca', 'certcheck'] },
  { id: 'wrap', label: '通信ごと', types: ['tls', 'tlsopen', 'vpn', 'vpnopen'] },
];

/* ---------- 状態 ---------- */

let stage = null;
let graph = { nodes: [], edges: [] };
let seq = 0;
let pending = null;          // タップでつなぐ途中の出力ポート { node, port, type }
let activeObjective = 'A';   // いま挑戦している目標（A をクリアすると、次の目標が出る）
let clearedKeys = [];        // このステージで、クリア済みの目標
let paletteTab = null;       // 部品一覧で開いているタブ
let pan = { x: 0, y: 0 };    // キャンバスを動かした量（ドラッグで動かせる）
let zoom = 1;                // キャンバスの拡大率（ホイール・ピンチ・ボタンで変える）
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;

let suppressPaletteClick = false;
let briefRestore = null;     // 結果を出す前に条件パネルが開いていたか
const bgPointers = new Map(); // 背景を触っている指・ポインタ
let pinch = null;

// チュートリアル（stage.tutorial があるステージだけ）
const tutorial = { active: false, steps: [], moved: false, ran: false, finished: false, start: null };

const dom = {};
const edgeEls = new Map();     // edgeId → { line, energy, len }
const energyState = new Map(); // edgeId → { color, label, partial? }（電気が通った線）

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
  if (dom.zones) {
    ['alice', 'public', 'bob'].forEach((z) => {
      const [x0, x1] = ZONE_RANGE[z];
      dom.zones[z].style.left = `${pan.x + x0 * zoom}px`;
      dom.zones[z].style.width = `${(x1 - x0) * zoom}px`;
    });
    [ZONE_RANGE.alice[1], ZONE_RANGE.public[1]].forEach((b, i) => {
      dom.handles[i].style.left = `${pan.x + b * zoom}px`;
    });
    dom.zoneLog.style.left = `${ZONE_RANGE.public[0] + 14}px`;
  }
  if (dom.zoneTags) {
    dom.zoneTags.querySelectorAll('.zone-tag').forEach((t) => {
      const [x0, x1] = ZONE_RANGE[t.dataset.zone];
      t.style.left = `${pan.x + ((x0 + x1) / 2) * zoom}px`;
      t.style.maxWidth = `${Math.max(60, (x1 - x0) * zoom - 12)}px`;
    });
  }
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
  fitZones();
}

// 3つのゾーンが、ちょうど横に収まるようにする
function fitZones() {
  const W = dom.board.clientWidth || 1200;
  const padLeft = 12;
  const padRight = W >= 900 ? 70 : 12;
  // 狭い画面では、読める大きさを優先する（全体は、指で動かして見る）
  const floor = W < 640 ? 0.4 : ZOOM_MIN;
  zoom = clamp((W - padLeft - padRight) / WORLD_W, floor, 1);
  pan = { x: padLeft, y: 60 - 80 * zoom };
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

const zoneFromCenter = (cx) => (cx < ZONE_RANGE.alice[1] ? 'alice' : cx < ZONE_RANGE.public[1] ? 'public' : 'bob');

function nodeWidth(node) {
  return nodeElOf(node.id)?.offsetWidth ?? 152;
}

// ゾーンの外へはみ出さないように（Alice は自分のゾーン、Bob は自分のゾーンの中だけ動かせる）
function clampNodeX(node, x) {
  const w = nodeWidth(node);
  let min = 0;
  let max = WORLD_W - w;
  if (node.type === 'alice') max = ZONE_RANGE.alice[1] - w - 8;
  if (node.type === 'bob') min = ZONE_RANGE.bob[0] + 8;
  return clamp(x, min, max);
}

// 部品のゾーンは、いまの位置で決まる
function syncZone(node) {
  if (node.type === 'alice') node.zone = 'alice';
  else if (node.type === 'bob') node.zone = 'bob';
  else node.zone = zoneFromCenter(node.x + nodeWidth(node) / 2);
  const nodeEl = nodeElOf(node.id);
  if (nodeEl) nodeEl.dataset.zone = node.zone;
}

function syncZones() {
  graph.nodes.forEach(syncZone);
}

// 部品の置き場所の注意（持ち主と、置いたゾーンが、合っているか）
const ZONE_NAMES = { alice: 'Alice のゾーン', public: '公開ゾーン', bob: 'Bob のゾーン' };
function zoneWarnings() {
  const warns = new Map();
  graph.nodes.forEach((n) => {
    if (n.type === 'keypair') {
      const owner = n.params.owner;
      const home = owner === 'alice' ? 'alice' : 'bob';
      if (n.zone !== home) {
        warns.set(
          n.id,
          `${owner === 'alice' ? 'Alice' : 'Bob'} の鍵ペアが、${ZONE_NAMES[n.zone]}にあります。秘密鍵は、持ち主のゾーンから出さないものです。ほかのゾーンから線を引くと、公開ゾーンを通って、盗まれる危険があります。`
        );
      }
    }
    if ((n.type === 'key' || n.type === 'keypair') && n.zone === 'public' && !warns.has(n.id)) {
      warns.set(n.id, '鍵が、公開ゾーンに置いてあります。誰でも拾えます。');
    }
  });
  return warns;
}

function refreshWarnings() {
  const warns = zoneWarnings();
  graph.nodes.forEach((n) => {
    const nodeEl = nodeElOf(n.id);
    if (!nodeEl) return;
    const w = warns.get(n.id);
    nodeEl.classList.toggle('is-warn', Boolean(w));
    const badge = nodeEl.querySelector('.node-warn');
    if (badge) {
      badge.hidden = !w;
      badge.title = w ?? '';
    }
  });
  return warns;
}

function initialGraph() {
  return {
    nodes: [
      { id: 'alice', type: 'alice', zone: 'alice', x: 60, y: 640, params: {} },
      { id: 'bob', type: 'bob', zone: 'bob', x: ZONE_RANGE.bob[1] - 60 - 150, y: 640, params: {} },
    ],
    edges: [],
  };
}
function removeNode(id) {
  if (sim.running) return;
  graph.nodes = graph.nodes.filter((n) => n.id !== id);
  graph.edges = graph.edges.filter((e) => e.from.node !== id && e.to.node !== id);
  renderNodes();
  onGraphChanged();
}

function removeEdge(id) {
  if (sim.running) return;
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
  const startZone = node.zone;
  nodeEl.classList.add('is-dragging');

  const onMove = (ev) => {
    const w = toWorld(ev.clientX, ev.clientY);
    node.x = clampNodeX(node, w.x - offX);
    node.y = Math.max(20, w.y - offY);
    syncZone(node);
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    renderEdges();
  };

  const onUp = () => {
    nodeEl.classList.remove('is-dragging');
    tutorialNodeMoved(node);
    // ほかのゾーンに動かしたら、通信の安全さが変わるので、前の結果は古くなる
    if (node.zone !== startZone) onGraphChanged();
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
// クリック・キーボードで置くときの位置。部品の役目に合うゾーン
// （かける部品は Alice のゾーン、外す部品は Bob のゾーン）の、空いている所に置く。
function findFreePosition(type) {
  const zone = DEFAULT_ZONE[type] ?? 'alice';
  const [x0, x1] = ZONE_RANGE[zone];
  const w = 152;
  const h = 130;
  const top = Math.max(60, -pan.y / zoom + 70);
  const bottom = top + dom.board.clientHeight / zoom - 150;

  const blocked = graph.nodes.map((n) => {
    const e = nodeElOf(n.id);
    return { x: n.x, y: n.y, w: e?.offsetWidth ?? w, h: e?.offsetHeight ?? h };
  });
  [dom.sideStack, dom.toolbar, dom.paletteBar].forEach((overlay) => {
    const r = overlayRect(overlay);
    if (r) blocked.push(r);
  });

  for (let y = top; y + h <= bottom; y += 70) {
    for (let x = x0 + 24; x + w <= x1 - 12; x += 60) {
      const hit = blocked.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
      if (!hit) return { x, y };
    }
  }
  return { x: x0 + 40 + (graph.nodes.length % 4) * 30, y: top + (graph.nodes.length % 5) * 30 };
}
function onGraphChanged() {
  hideResult();
  clearOutcome();
  if (toastSticky) {
    toastSticky = false;
    dom.toast.hidden = true;
  }
  refreshWarnings();
  tutorialRender();
}

function createPacketChip() {
  const chip = el('div', 'node-packet');
  chip.hidden = true;
  chip.append(el('span', 'packet-dot'), el('span', 'packet-text'));
  return chip;
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
  const names = (list ?? []).map((r) => REQUIREMENTS[r]?.label ?? r);
  return names.length ? names.join('・') : 'Alice のメッセージを、Bob に届ける';
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
function hideResult() {
  dom.result.hidden = true;
  dom.result.replaceChildren();
  dom.editor.classList.remove('has-result');
  if (briefRestore !== null) {
    setBriefCollapsed(!briefRestore);
    briefRestore = null;
  }
}
function createActions(obj, key, isFinal) {
  const actions = el('div', 'result-actions');
  const keys = objectiveKeys(stage);

  // 目標 A をクリアしたら、新しい条件（目標 B）に挑戦できる
  if (obj.met && !isFinal) {
    const nextKey = keys[keys.indexOf(key) + 1];
    const adv = el('button', 'button button-primary', `つぎの条件へ（目標 ${nextKey}）`);
    adv.type = 'button';
    adv.addEventListener('click', advanceObjective);
    actions.append(adv);
  }

  const idx = STAGE_IDS.indexOf(stage.id);
  const nextId = idx >= 0 ? STAGE_IDS[idx + 1] : null;
  if (obj.met && nextId) {
    const next = el(
      'a',
      `button ${isFinal ? 'button-primary' : 'button-secondary'}`,
      stage.tutorial ? 'ステージ1へ' : '次のステージへ'
    );
    next.href = `simulator.html?stage=${encodeURIComponent(nextId)}`;
    actions.append(next);
  }

  const retry = el('button', 'button button-secondary', 'もう一度つくる');
  retry.type = 'button';
  retry.addEventListener('click', hideResult);
  actions.append(retry);

  // 突破された・つながっていないときは、想定解を見られる
  if (!obj.met && stage.solutions?.[key] && !stage.tutorial) {
    const sol = el('button', 'button button-secondary', '想定解を見る');
    sol.type = 'button';
    sol.addEventListener('click', applySolution);
    actions.append(sol);
  }

  const back = el('a', 'button button-secondary', 'ステージ一覧へ');
  back.href = 'index.html#stage-section';
  actions.append(back);

  return actions;
}

// 目標 A をクリアしたあと、新しい条件（目標 B）を出す
function advanceObjective() {
  const keys = objectiveKeys(stage);
  const idx = keys.indexOf(activeObjective);
  if (idx < 0 || idx >= keys.length - 1) return;
  activeObjective = keys[idx + 1];
  clearedKeys = clearedObjectives(stage.id);
  paletteTab = null;
  renderNodes();
  hideResult();
  clearOutcome();
  renderBrief();
  renderPalette();
  renderLegend();
  updateSolutionButton();
  setBriefCollapsed(false);
  showToast(`新しい条件が出ました！（目標 ${activeObjective}）左上の条件を見てみよう`);
}

let toastTimer = null;
let toastSticky = false; // 想定解の説明など、配置を変えるまで残すお知らせ
function showToast(text, { sticky = false } = {}) {
  dom.toast.textContent = text;
  dom.toast.hidden = false;
  dom.toast.classList.toggle('is-note', sticky);
  toastSticky = sticky;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 5000);
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
  const alice = findNode('alice');
  tutorial.start = { x: alice.x, y: alice.y };
  tutorial.moved = false;
  tutorial.ran = false;
  tutorial.finished = false;
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
  if (sim.running) return null;
  const def = COMPONENTS[type];
  const node = { id: nextId(type), type, x: 0, y: Math.max(20, y), params: {} };
  node.x = clampNodeX(node, x);
  node.zone = zoneFromCenter(node.x + 76);
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
  renderEdges();
  refreshWarnings();
  tutorialRender();
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
  root.dataset.zone = node.zone ?? DEFAULT_ZONE[node.type] ?? 'alice';
  root.style.left = `${node.x}px`;
  root.style.top = `${node.y}px`;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', def.label);

  // ヘッダー
  const head = el('div', 'node-head');
  if (node.type === 'alice' || node.type === 'bob') {
    const fig = makeFigure({ width: 26, height: 34, className: 'node-figure' });
    fig.style.setProperty('--who', node.type === 'alice' ? '#4c6fff' : '#2bb673');
    head.append(fig);
  } else if (def.avatar) head.append(el('span', 'node-avatar', def.avatar));
  const warn = el('span', 'node-warn', '⚠');
  warn.hidden = true;
  head.append(el('span', 'node-title', def.label), warn);
  if (nodeHelpTerm(node) && termUnlocked(nodeHelpTerm(node))) {
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

  def.inputs.forEach((port) => root.append(createPortRow(node, port, 'in')));
  def.outputs.forEach((port) => root.append(createPortRow(node, port, 'out')));
  if (node.type !== 'key' && node.type !== 'keypair') root.append(createPacketChip());

  // ドラッグ移動
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.port, select, .node-remove, .node-help')) return;
    startNodeDrag(e, node, root);
  });

  return root;
}
/* ==========================================================
   描画: 線
   ========================================================== */
function renderEdges() {
  if (!dom.edgeLayer) return;
  dom.edgeLayer.replaceChildren();
  dom.labelLayer.replaceChildren();
  edgeEls.clear();

  graph.edges.forEach((edge) => {
    const a = portCenter(edge.from.node, edge.from.port, 'out');
    const b = portCenter(edge.to.node, edge.to.port, 'in');
    if (!a || !b) return;
    const d = route(a, b);

    const pub = isPublicEdge(graph, edge);
    const g = svgEl('g', { class: `edge edge-${edge.type}${pub ? ' is-public' : ''}` });
    const title = svgEl('title');
    title.textContent = pub ? '公開されている線（誰でも見られる）。クリックで線を消す' : 'クリックで線を消す';
    const line = svgEl('path', { class: 'edge-line', d });
    const energy = svgEl('path', { class: 'edge-energy', d });
    const hit = svgEl('path', { class: 'edge-hit', d });
    g.append(title, line, energy, hit);
    g.addEventListener('click', () => removeEdge(edge.id));
    dom.edgeLayer.append(g);

    const len = line.getTotalLength();
    edgeEls.set(edge.id, { line, energy, len });

    // すでに電気が通った線は、そのまま色と文字をつけて残す
    const st = energyState.get(edge.id);
    if (st) {
      energy.setAttribute('stroke', st.color);
      energy.style.filter = `drop-shadow(0 0 3px ${st.color})`;
      if (st.partial) {
        energy.style.strokeDasharray = `${len}`;
        energy.style.strokeDashoffset = `${len * (1 - st.partial)}`;
      }
      if (st.label) placeEdgeLabel(edge.id, st.label, st.color, st.partial ?? 0.5);
    } else {
      energy.style.display = 'none';
    }
  });
}

// 線の上に、いまの状態を表す文字（「平文」「暗号文（AES）」「✕ 事前共有できない」など）を出す
function placeEdgeLabel(edgeId, text, color, at = 0.5) {
  const info = edgeEls.get(edgeId);
  if (!info) return null;
  const pt = info.line.getPointAtLength(info.len * at);
  const g = svgEl('g', { class: 'edge-label', transform: `translate(${pt.x} ${pt.y})` });
  const t = svgEl('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  t.textContent = text;
  const rect = svgEl('rect', { rx: 10, ry: 10, stroke: color });
  g.append(rect, t);
  dom.labelLayer.append(g);
  const bb = t.getBBox();
  rect.setAttribute('x', bb.x - 7);
  rect.setAttribute('y', bb.y - 3);
  rect.setAttribute('width', bb.width + 14);
  rect.setAttribute('height', bb.height + 6);
  return g;
}

/* ==========================================================
   描画: 部品一覧・凡例・条件パネル
   ========================================================== */
function renderPalette() {
  const types = availableComponents(stage, activeObjective);
  const groups = PALETTE_GROUPS.map((g) => ({ ...g, items: types.filter((t) => g.types.includes(t)) })).filter(
    (g) => g.items.length > 0
  );
  dom.paletteTabs.replaceChildren();
  dom.palette.replaceChildren();
  dom.paletteTabs.hidden = groups.length < 2;
  dom.palette.hidden = groups.length === 0;
  if (groups.length === 0) return;

  const isNew = (t) => (stage.introduces ?? []).includes(t) || !stage.components.includes(t);
  if (!paletteTab || !groups.some((g) => g.id === paletteTab)) {
    paletteTab = (groups.find((g) => g.items.some(isNew)) ?? groups[0]).id;
  }

  groups.forEach((g) => {
    const tab = el('button', 'palette-tab');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(g.id === paletteTab));
    tab.append(el('span', null, g.label), el('small', null, String(g.items.length)));
    if (g.items.some(isNew)) tab.append(el('i', 'tab-dot'));
    tab.addEventListener('click', () => {
      paletteTab = g.id;
      renderPalette();
    });
    dom.paletteTabs.append(tab);
  });

  groups.find((g) => g.id === paletteTab).items.forEach((type) => {
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
      const pos = findFreePosition(type);
      addNode(type, pos.x, pos.y);
    });
    dom.palette.append(btn);
  });
}

// データの色の凡例。色は6種類だけにして、線の上の文字でも状態を表示する
function renderLegend() {
  dom.legend.replaceChildren();
  const comps = new Set(availableComponents(stage, activeObjective));
  const has = (...ts) => ts.some((t) => comps.has(t));
  const mallory = attackerKeys(stage).includes('mallory');

  const items = [{ label: '平文', color: COLORS.plain }];
  if (has('encrypt', 'pkenc', 'tls', 'vpn')) items.push({ label: '暗号文', color: COLORS.cipher });
  if (has('key', 'keypair')) items.push({ label: '鍵', color: COLORS.key });
  if (has('hash', 'mac', 'sign', 'ca')) items.push({ label: '確認用の印', color: COLORS.proof });
  if (mallory) items.push({ label: '改ざん・偽物', color: COLORS.bad });
  if (has('decrypt', 'pkdec') || mallory) items.push({ label: '壊れたデータ', color: COLORS.garbled });

  items.forEach((item) => {
    const li = el('li');
    const dot = el('span', 'legend-dot');
    dot.style.setProperty('--chip', item.color);
    li.append(dot, el('span', null, item.label));
    dom.legend.append(li);
  });
  dom.legend.append(el('li', 'legend-note', '線の上の文字でも、状態が分かります'));
}

function capText(key, value) {
  switch (key) {
    case 'compute':
      return computeInfo(value).label;
    case 'looksFor':
      return (value ?? []).map((v) => (v === 'keys' ? '鍵' : 'メッセージ')).join('・') || 'メッセージ';
    case 'attacks':
      return (value ?? []).map((a) => ATTACKS[a]?.label ?? a).join('・') || 'なし';
    case 'seesMetadata':
      return value === false ? '見えない' : '見える';
    default:
      return String(value);
  }
}
// 条件の短い目印（くわしい説明は、用語集にある）
function ruleChips(rules) {
  const chips = [];
  (rules.noPreshare ?? []).forEach((k) => {
    chips.push(k === 'key' ? '共通鍵は事前に共有できない' : 'Alice の公開鍵は事前に届かない');
  });
  if (rules.largeBody) chips.push('本文が大きい');
  if (Array.isArray(rules.onlyComponents)) {
    chips.push(`使える部品: ${rules.onlyComponents.map((t) => COMPONENTS[t]?.label ?? t).join('・')}`);
  }
  return chips;
}

function unlockChip(unlock) {
  const names = [
    ...(unlock?.components ?? []).map((t) => COMPONENTS[t]?.label ?? t),
    ...(unlock?.algorithms ?? []).map((a) => algorithmInfo(a).label),
  ];
  if (names.length === 0) return '';
  return `新しい部品: ${names.slice(0, 3).join('・')}${names.length > 3 ? ' など' : ''}`;
}

function renderBrief() {
  const title = stage.title ?? stage.id;
  document.title = `CRYPTA | ${title}`;
  $('#stage-title').textContent = title;
  $('#stage-goal').textContent = stage.goal ?? '';

  // 攻撃者（いない・チュートリアルでは出さない）
  const keys = attackerKeys(stage);
  dom.attackerGroup.hidden = keys.length === 0;
  const badges = $('#attacker-badges');
  badges.replaceChildren();
  keys.forEach((key) => {
    const a = ATTACKERS[key];
    badges.append(el('span', `badge ${a.className}`, `${a.label}（${a.role}）`));
  });

  const okeys = objectiveKeys(stage);
  const idx = okeys.indexOf(activeObjective);
  const caps = capsFor(stage, activeObjective);
  const prev = idx > 0 ? capsFor(stage, okeys[idx - 1]) : null;
  const dl = $('#attacker-caps');
  dl.replaceChildren();
  CAP_ORDER.filter((k) => k in caps).forEach((key) => {
    const dt = el('dt');
    if (ENV_TERMS[key] && termUnlocked(ENV_TERMS[key])) dt.append(termButton(CAP_LABELS[key], ENV_TERMS[key]));
    else dt.textContent = CAP_LABELS[key];
    const dd = el('dd', null, capText(key, caps[key]));
    if (prev && JSON.stringify(prev[key]) !== JSON.stringify(caps[key])) dd.append(el('em', 'cap-new', '変化'));
    dl.append(dt, dd);
  });

  // 目標（クリア済みは1行、いま挑戦中の目標だけくわしく。まだ先の目標は、出さない）
  const list = $('#objective-list');
  list.replaceChildren();
  okeys.forEach((key) => {
    const obj = stage.objectives[key];
    if (clearedKeys.includes(key) && key !== activeObjective) {
      const li = el('li', 'objective is-done');
      li.append(el('span', 'objective-mark', '✓'), el('p', 'objective-title', `目標 ${key}  クリア`));
      list.append(li);
      return;
    }
    if (key !== activeObjective) return;

    const li = el('li', 'objective');
    li.append(el('span', 'objective-mark', key));
    const body = el('div');
    body.append(elT('p', 'objective-title', requirementsText(obj.require)));
    const chips = [...ruleChips(rulesFor(stage, key)), unlockChip(obj.unlock)].filter(Boolean);
    if (chips.length) {
      const ul = el('ul', 'chips');
      chips.forEach((c) => ul.append(el('li', 'chip', c)));
      body.append(ul);
    }
    li.append(body);
    list.append(li);
  });
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

// 線に沿って電気を伸ばす（色は種類をしぼり、文字でも状態を表示する）
function drawEdge(edge, color, label, factor = 1) {
  const info = edgeEls.get(edge.id);
  if (!info) return Promise.resolve();

  energyState.set(edge.id, { color, label });
  const { line, energy, len } = info;
  energy.setAttribute('stroke', color);
  energy.style.display = '';
  energy.style.filter = `drop-shadow(0 0 3px ${color})`;
  energy.style.strokeDasharray = `${len}`;
  energy.style.strokeDashoffset = `${len}`;
  if (label) placeEdgeLabel(edge.id, label, color);

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

// ルールで通せない線: 途中まで電気が進んで、赤い「✕ 理由」で止まる
function drawBlockedEdge(edge, info, factor = 1) {
  const ei = edgeEls.get(edge.id);
  if (!ei) return Promise.resolve();
  const partial = 0.42;
  const color = COLORS.bad;
  const label = `✕ ${info.short}`;

  energyState.set(edge.id, { color, label, partial, blocked: true });
  const { line, energy, len } = ei;
  energy.setAttribute('stroke', color);
  energy.style.display = '';
  energy.style.filter = `drop-shadow(0 0 3px ${color})`;
  energy.style.strokeDasharray = `${len}`;
  energy.style.strokeDashoffset = `${len}`;

  const spark = svgEl('circle', { r: 7, fill: color });
  dom.sparkLayer.append(spark);
  const duration = clamp(len / 0.3, 500, 1800) * partial * factor * SPEED;
  return runTween(duration, (p) => {
    energy.style.strokeDashoffset = `${len * (1 - partial * p)}`;
    const pt = line.getPointAtLength(len * partial * p);
    spark.setAttribute('cx', pt.x);
    spark.setAttribute('cy', pt.y);
    if (p >= 1) {
      spark.remove();
      placeEdgeLabel(edge.id, label, color, partial);
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

const ATTACK_DEEDS = {
  tamper: '通信の途中で、データを書き換えた',
  forge: '偽のメッセージを作って送った',
  keyswap: '公開鍵を、自分のものに差し替えた',
  replay: '過去の通信を、そのまま再送した',
};

// Mallory の攻撃は、通信全体を何度も流し直さない。
// 本物の通信を1回流したあと、通信路の中で「攻撃 → Bob の結果」を1行ずつ記録する。
// （結果は engine.js がすでに計算済み。ここでは、見せるだけ）
function outcomeText(a) {
  const b = a.flow.bob;
  if (a.outcome === 'bad') {
    const what = b.replayed && b.msg?.v === 'orig' ? '古い通信' : BAD_LABELS[b.msg?.v] ?? 'おかしなデータ';
    return { text: `${what}を受け入れてしまった`, tone: 'bad' };
  }
  if (a.outcome === 'rejected') {
    const r = a.flow.rejects[0];
    const node = graph.nodes.find((n) => n.id === r.node);
    return { text: `「${COMPONENTS[node.type].label}」で見抜いた`, tone: 'good' };
  }
  if (a.outcome === 'ok') return { text: '影響なし', tone: 'good' };
  return { text: 'Bob に届かなかった', tone: 'good' };
}
function mainOutput(flow, id) {
  const outs = flow.outputs?.get(id) ?? {};
  const def = COMPONENTS[findNode(id).type];
  for (const p of def.outputs) if (outs[p.id]) return outs[p.id];
  return null;
}

const hasEdges = (id) => graph.edges.some((e) => e.from.node === id || e.to.node === id);

// 本物の通信の流れを、1回分再生する
async function playFlow(flow, ctx) {
  const tw = (ms) => wait(ms);
  const factor = 1;
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
      const blocked = flow.edgeBlocked?.get(e.id);
      if (blocked) {
        await drawBlockedEdge(e, blocked, factor);
        return;
      }
      const v = flow.edgeValues.get(e.id);
      if (v) await drawEdge(e, valueColor(v), valueLabel(v), factor);
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
      case 'bob': {
        const b = flow.bob;
        if (b.status === 'none') {
          // 何も届かなかった（途中で止まった）ことを、はっきり出す
          nodeEl.classList.add('is-blocked');
          setNodeChip(id, { text: '届かない…', color: COLORS.garbled });
          return;
        }
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
    } else if (st.status === 'starved' && hasEdges(id)) {
      setNodeChip(id, { text: '届かない…', color: COLORS.garbled });
    }
  }

  await Promise.all(graph.nodes.map((n) => playNode(n.id)));
  await Promise.all(side);
  await tw(300);
}
async function playRun(obj) {
  // ① 回路を、今までどおり流す（つながっていなければ、ここで終わり）
  await playFlow(obj.honest, { honest: true, obj });
  if (obj.status !== 'done' || !stage.attacker) return;
  // ② 攻撃者が、公開ゾーンを歩き回って、調べたり、書き換えたりする
  await playAttackers(obj);
}

/* ==========================================================
   攻撃者（公開ゾーンを歩き回って、調べたり、書き換えたりする）
   ========================================================== */
// 行動する前に、「何をしようとしているか」を、吹き出しで先に見せる（考えている）。
// そのあとで、実際にやってみて、結果を見せる。やったことは、公開ゾーンの記録にも残る。

const AVATARS = {
  eve: { name: 'Eve', color: '#14a39b' },
  mallory: { name: 'Mallory', color: '#ee5f78' },
};

// 人の形の絵。Alice・Bob・攻撃者で、同じ形を使う（攻撃者は帽子つき）
function makeFigure({ hat = false, width = 60, height = 80, className = 'attacker-figure' } = {}) {
  const fig = svgEl('svg', { class: className, viewBox: '0 0 60 80', width, height });
  fig.append(
    svgEl('circle', { cx: 30, cy: 18, r: 13, class: 'fig-head' }),
    svgEl('path', { d: 'M8 78 C8 48 18 36 30 36 C42 36 52 48 52 78 Z', class: 'fig-body' })
  );
  if (hat) fig.append(svgEl('path', { d: 'M12 12 C14 2 46 2 48 12 L52 14 L8 14 Z', class: 'fig-hat' }));
  return fig;
}
function buildZones() {
  dom.zones = {};
  ['alice', 'public', 'bob'].forEach((z) => {
    const d = el('div', `zone zone-${z}`);
    dom.board.insertBefore(d, dom.world);
    dom.zones[z] = d;
  });

  // ゾーンの境界（ドラッグすると、ゾーンの広さの比率を変えられる）
  dom.handles = [0, 1].map((i) => {
    const h = el('div', 'zone-handle', '⇔');
    h.title = 'ドラッグして、ゾーンの広さを変える';
    h.addEventListener('pointerdown', (e) => startZoneResize(e, i));
    dom.board.append(h);
    return h;
  });

  // 見出しは、画面の上に固定して、拡大・移動に合わせて、横の位置だけ動かす
  dom.zoneTags = el('div', 'zone-tags');
  ['alice', 'public', 'bob'].forEach((z) => {
    const t = el('span', `zone-tag zone-tag-${z}`, ZONE_TAGS[z]);
    t.dataset.zone = z;
    dom.zoneTags.append(t);
  });
  dom.board.append(dom.zoneTags);

  // 攻撃者（人の形）
  const att = el('div', 'attacker');
  att.hidden = true;
  const bubble = el('div', 'attacker-bubble');
  bubble.hidden = true;
  const body = el('div', 'bubble-body');
  body.append(el('span', 'bubble-text'), el('span', 'bubble-detail'));
  bubble.append(el('span', 'bubble-icon'), body);
  att.append(bubble, makeFigure({ hat: true }), el('span', 'attacker-name'));
  dom.attacker = att;
  dom.world.append(att);

  dom.zoneLog = el('ul', 'zone-log');
  dom.zoneLog.hidden = true;
  dom.world.append(dom.zoneLog);
  dom.transients = [];
  applyPan();
}

// 境界を動かして、Alice・公開・Bob のゾーンの広さの比率を変える
function startZoneResize(e, index) {
  e.preventDefault();
  e.stopPropagation();
  if (sim.running) return;
  const before = new Map(graph.nodes.map((n) => [n.id, n.zone]));
  const rect = dom.board.getBoundingClientRect();
  const MIN = 420;

  const onMove = (ev) => {
    const wx = (ev.clientX - rect.left - pan.x) / zoom;
    if (index === 0) {
      const b = clamp(wx, MIN, ZONE_RANGE.public[1] - MIN);
      ZONE_RANGE.alice[1] = b;
      ZONE_RANGE.public[0] = b;
    } else {
      const b = clamp(wx, ZONE_RANGE.alice[1] + MIN, WORLD_W - MIN);
      ZONE_RANGE.public[1] = b;
      ZONE_RANGE.bob[0] = b;
    }
    // Alice と Bob は、自分のゾーンの中に収める
    ['alice', 'bob'].forEach((id) => {
      const n = findNode(id);
      n.x = clampNodeX(n, n.x);
      const nodeEl = nodeElOf(id);
      if (nodeEl) nodeEl.style.left = `${n.x}px`;
    });
    syncZones();
    applyPan();
    renderEdges();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (graph.nodes.some((n) => n.zone !== before.get(n.id))) onGraphChanged();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function showAttacker(who) {
  const a = AVATARS[who];
  dom.attacker.hidden = false;
  dom.attacker.dataset.who = who;
  dom.attacker.style.setProperty('--who', a.color);
  dom.attacker.querySelector('.attacker-name').textContent = a.name;
}
function attackerBubble(mode, icon, text, tone, detail) {
  const b = dom.attacker.querySelector('.attacker-bubble');
  b.hidden = false;
  b.className = `attacker-bubble is-${mode}${tone ? ` tone-${tone}` : ''}`;
  b.querySelector('.bubble-icon').textContent = icon;
  b.querySelector('.bubble-text').textContent = text;
  const d = b.querySelector('.bubble-detail');
  d.textContent = detail ?? '';
  d.hidden = !detail;
}

function attackerPlace(x, y, animate) {
  dom.attacker.style.transitionDuration = animate && !sim.skipped ? `${0.8 * SPEED}s` : '0s';
  dom.attacker.style.left = `${clamp(x, ZONE_RANGE.public[0] + 70, ZONE_RANGE.public[1] - 70)}px`;
  dom.attacker.style.top = `${Math.max(190, y)}px`;
}

async function attackerWalk(target) {
  attackerPlace(target.x, target.y, true);
  await wait(700);
}

function edgePoint(edgeId) {
  const info = edgeEls.get(edgeId);
  if (!info) return null;
  const pt = info.line.getPointAtLength(info.len * 0.5);
  return { x: pt.x, y: pt.y + 70 };
}

function nodePoint(nodeId) {
  const n = findNode(nodeId);
  const w = nodeWidth(n);
  const h = nodeElOf(nodeId)?.offsetHeight ?? 130;
  return { x: n.x + w / 2, y: n.y + h + 80 };
}

function markEdge(edgeId, on) {
  edgeEls.get(edgeId)?.line.parentNode.classList.toggle('is-targeted', on);
}

function logStep(icon, text, tone) {
  dom.zoneLog.hidden = false;
  if (!dom.zoneLog.childElementCount) dom.zoneLog.append(el('li', 'zone-log-head', '👁 公開ゾーンで、攻撃者がしたこと'));
  const li = el('li', `tone-${tone ?? 'plain'}`);
  li.append(el('span', 'log-icon', icon), el('span', null, text));
  dom.zoneLog.append(li);
}

// 部品の下のデータ表示を、ちょっとだけ書き換える（あとで元に戻す）
function flashNode(nodeId, text, color) {
  const nodeEl = nodeElOf(nodeId);
  const chip = nodeEl?.querySelector('.node-packet');
  if (!chip) return () => {};
  const prev = {
    hidden: chip.hidden,
    text: chip.querySelector('.packet-text').textContent,
    color: chip.style.getPropertyValue('--chip'),
    title: chip.title,
  };
  setNodeChip(nodeId, { text, color });
  nodeEl.classList.add('is-flash');
  return () => {
    nodeEl.classList.remove('is-flash');
    chip.hidden = prev.hidden;
    chip.querySelector('.packet-text').textContent = prev.text;
    chip.style.setProperty('--chip', prev.color);
    if (prev.title) chip.title = prev.title;
  };
}

function showTransientLabel(edgeId, text) {
  const g = placeEdgeLabel(edgeId, text, COLORS.bad);
  if (g) dom.transients.push(g);
  return () => g?.remove();
}

// 攻撃者が、方式を破るときに、実際にやっていること
const BREAK_METHODS = {
  1: '鍵（ずらし幅）の候補は25通りだけ。1つずつ全部試して、意味のある文章になるものを探す。',
  2: '文字の出現回数を数える。英語なら E や T が多いので、いちばん多い文字を E と仮定して、少しずつ当てはめていく。',
  3: '「同じ文字には変換されない」という、構造の弱点を使う。決まり文句を手がかりに、解読機（ボム）で、設定の候補をしぼり込む。',
  4: '公開鍵の元になる数を、素因数分解する。スーパーコンピュータを何日も回して、秘密鍵を計算で求める。',
};

// 公開ゾーンで調べたことの、1つ1つの行動（何を見て、何を考えているのかも、書く）
function viewSpec(step, obj) {
  const msg = obj.honest.messageText || stageMessage(stage);
  const onEdge = (id) => ({ target: edgePoint(id), highlight: (on) => markEdge(id, on) });

  switch (step.kind) {
    case 'capture':
      return {
        ...onEdge(step.edgeId),
        think: ['🔍', 'この線を流れているものを、見てみよう', '公開されている線は、誰でも中身を見られる。流れているものを、そっくりコピーしても、Alice と Bob には、盗まれたことが分からない。'],
        acts: [{ icon: '📋', text: `コピーした → ${valueLabel(step.bundle)}`, tone: 'work', detail: `手に入れたデータ: ${bundleText(step.bundle)}` }],
      };
    case 'key-line':
      return {
        ...onEdge(step.edgeId),
        think: ['🔑', 'この線に、鍵が流れていないかな？', '共通鍵や秘密鍵が流れていれば、暗号文を開けられる。公開鍵は、もともと公開してよい鍵。'],
        acts: [
          step.secret
            ? { icon: '🔑', text: `鍵を見つけた！（${valueLabel(step.key)}）`, tone: 'bad', detail: '暗号は、鍵が秘密であることが前提。鍵が見えてしまえば、どんなに強い暗号でも、意味がなくなる。' }
            : { icon: '👀', text: '公開鍵だった（盗んでも、使えない）', tone: 'good', detail: '公開鍵は、暗号文を「作る」ための鍵。これでは、暗号文を「開ける」ことはできない。' },
        ],
      };
    case 'key-node':
      return {
        target: nodePoint(step.nodeId),
        think: ['🔑', 'ここに置いてある鍵を、探してみよう', '公開ゾーンに置かれた部品は、誰でも触れる。中に、鍵が入っているかもしれない。'],
        acts: [
          step.found
            ? { icon: '🔑', text: '置いてあった鍵を、手に入れた！', tone: 'bad', detail: '鍵を、誰でも拾える場所に置いてしまっていた。' }
            : { icon: '🤷', text: '使える鍵は、なかった', tone: 'good', detail: '公開鍵しか入っていなかった。' },
        ],
      };
    case 'key-none':
      return {
        think: ['🔑', 'ほかに、鍵は落ちていないかな？', '見つけた線と、置いてある部品を、ひととおり調べたけれど…'],
        acts: [{ icon: '🤷', text: '鍵は、見つからなかった', tone: 'good', detail: '公開ゾーンに、秘密の鍵は出ていなかった。' }],
      };
    case 'open': {
      const info = algorithmInfo(step.alg);
      return {
        ...onEdge(step.edgeId),
        think:
          step.method === 'brute'
            ? ['🔓', `「${info.short}」を、解読できないかな？`, BREAK_METHODS[info.breakLevel] ?? '計算で、破ろうとしている。']
            : ['🔑', '手に入れた鍵で、開けられないかな？', '盗んだ鍵を、そのまま差し込んで、暗号文を開けてみる。'],
        acts: [
          {
            icon: '🔓',
            text: `開いた！（${info.short}）`,
            tone: 'bad',
            detail: step.method === 'brute' ? info.weakness : '正しい鍵だったので、あっさり開いた。',
          },
        ],
      };
    }
    case 'open-fail': {
      const info = algorithmInfo(step.alg);
      return {
        ...onEdge(step.edgeId),
        think: ['🔓', `「${info.short}」を、開けられるかな？`, 'いまの計算能力で、破れる方法がないか、試してみる。手に入れた鍵で、開けられるかも、確かめる。'],
        acts: [{ icon: '🔒', text: `開けられない…（${info.short}）`, tone: 'good', detail: '破るには、現実的でない時間がかかる。鍵も、見つかっていない。' }],
      };
    }
    default: // read
      return {
        think: ['📖', 'メッセージを、読めるかな？', '手に入れたものを、全部開けてみて、読める文章が残っているかを、確かめる。'],
        acts: [
          step.ok
            ? { icon: '📖', text: `読めた！「${msg}」`, tone: 'bad', detail: '中身を読まれたら、アウト。' }
            : { icon: '🙁', text: '読めなかった', tone: 'good', detail: '暗号文は手に入れたが、中身は分からないままだった。' },
        ],
      };
  }
}


const ATTACK_PLANS = {
  tamper: ['✏️', 'データを書き換えて、Bob をだませないかな？', 'Bob は、書き換えに気づく仕組み（ハッシュ・MAC・署名・TLS）を持っているかな？ 持っていなければ、書き換えられたデータを、そのまま信じてしまう。'],
  forge: ['🎭', 'Alice のふりをして、偽のメッセージを送ってみよう', '鍵を知らない Mallory に、MAC や署名は作れない。でも、ハッシュ（誰でも作れる指紋）だけなら、本文に合わせて作り直せる。'],
  keyswap: ['🔁', '公開鍵を、自分のものにすり替えてみよう', 'Bob は、受け取った公開鍵を、Alice のものだと信じて使う。自分の鍵に変えれば、Mallory の署名が、Alice のものとして通ってしまう。'],
  replay: ['📼', '前の通信を、そのまま送り直してみよう', '過去の本物の通信は、印もすべて正しい。「いまのもの」だと確かめる仕組み（TLS など）がなければ、もう一度受け付けられてしまう。'],
};

function snapshotChip(nodeId) {
  const nodeEl = nodeElOf(nodeId);
  const chip = nodeEl?.querySelector('.node-packet');
  if (!chip) return null;
  return {
    nodeEl,
    chip,
    hidden: chip.hidden,
    text: chip.querySelector('.packet-text').textContent,
    color: chip.style.getPropertyValue('--chip'),
    title: chip.getAttribute('title'),
    classes: ['is-blocked', 'is-garbled', 'is-received'].filter((c) => nodeEl.classList.contains(c)),
  };
}

function restoreChip(sn) {
  const { nodeEl, chip } = sn;
  ['is-blocked', 'is-garbled', 'is-received'].forEach((c) => nodeEl.classList.toggle(c, sn.classes.includes(c)));
  chip.hidden = sn.hidden;
  chip.querySelector('.packet-text').textContent = sn.text;
  chip.style.setProperty('--chip', sn.color);
  if (sn.title) chip.setAttribute('title', sn.title);
  else chip.removeAttribute('title');
}

// 書き換えられたデータが、そのあとの回路に流れていくようすを、見せる（あとで、本物の通信の状態に戻す）
function showAttackedCircuit(a) {
  const prevState = new Map(energyState);
  const snaps = graph.nodes.map((n) => snapshotChip(n.id)).filter(Boolean);

  energyState.clear();
  graph.edges.forEach((e) => {
    const v = a.flow.edgeValues.get(e.id);
    if (v) energyState.set(e.id, { color: valueColor(v), label: valueLabel(v) });
  });
  renderEdges();

  graph.nodes.forEach((n) => {
    if (n.type === 'key' || n.type === 'keypair') return;
    const nodeEl = nodeElOf(n.id);
    ['is-blocked', 'is-garbled', 'is-received'].forEach((c) => nodeEl.classList.remove(c));
    const st = a.flow.info.get(n.id) ?? { status: 'ok' };

    if (n.type === 'bob') {
      const b = a.flow.bob;
      if (b.status === 'none') {
        nodeEl.classList.add('is-blocked');
        setNodeChip(n.id, { text: '届かない…', color: COLORS.garbled });
      } else {
        const bad = !b.msg || b.msg.v !== 'orig' || b.replayed;
        setNodeChip(n.id, { text: b.msg ? `${b.msg.text}${b.replayed ? '（再送）' : ''}` : bundleText(b.bundle), color: bad ? COLORS.bad : COLORS.plain });
        nodeEl.classList.add(bad ? 'is-garbled' : 'is-received');
      }
    } else if (st.status === 'reject') {
      nodeEl.classList.add('is-blocked');
      setNodeChip(n.id, { text: '見抜いた！', color: COLORS.bad, title: st.note });
    } else if (st.status === 'ok') {
      const v = mainOutput(a.flow, n.id);
      if (v) setNodeChip(n.id, { text: n.type === 'alice' ? bundleText(v) : valueText(v), color: valueColor(v) });
    } else if (hasEdges(n.id)) {
      setNodeChip(n.id, { text: '届かない…', color: COLORS.garbled });
    }
  });

  return () => {
    energyState.clear();
    prevState.forEach((v, k) => energyState.set(k, v));
    renderEdges();
    snaps.forEach(restoreChip);
  };
}

// Mallory の1つの攻撃（公開されている線を書き換えて、Bob がどうするかを見る）
function attackSpec(a, obj) {
  const sig = (v) => (v ? `${valueLabel(v)}|${valueText(v)}` : '');
  const changed = a.flow.publicEdges.filter((id) => sig(a.flow.edgeValues.get(id)) !== sig(obj.honest.edgeValues.get(id)));
  const eid = changed[0] ?? a.flow.publicEdges[0];
  const { text, tone } = outcomeText(a);
  const label = ATTACKS[a.name].label;

  const addLabels = () => {
    const undos = changed.map((id) => showTransientLabel(id, valueLabel(a.flow.edgeValues.get(id))));
    markEdge(eid, true);
    return () => { undos.forEach((u) => u()); markEdge(eid, false); };
  };
  const detailByOutcome = {
    rejected: 'Bob の側の確認が、おかしいと気づいて、受け取りを拒否した。そのあとの回路は、ここで止まる。',
    bad: 'Bob は、何も疑わずに、書き換えられたものを受け取ってしまった。',
    lost: '書き換えのせいで、Bob は、読めるものを受け取れなかった（でも、だまされてはいない）。',
    ok: '何も変わらなかった。',
  };

  return {
    target: eid ? edgePoint(eid) : null,
    think: ATTACK_PLANS[a.name],
    acts: [
      {
        icon: '😈',
        text: `${label}した → ${changed.length ? valueLabel(a.flow.edgeValues.get(eid)) : '何も変わらなかった'}`,
        tone: 'bad',
        detail: '書き換えたデータは、そのまま、Bob のほうへ流れていく。',
        effect: addLabels,
      },
      {
        icon: tone === 'good' ? '🛡' : '💥',
        text: `Bob の側: ${text}`,
        tone,
        detail: detailByOutcome[a.outcome],
        effect: () => {
          const undoCircuit = showAttackedCircuit(a);
          const undoLabels = addLabels();
          return () => { undoLabels(); undoCircuit(); };
        },
      },
    ],
    logText: `${label} → ${text}`,
  };
}
async function performStep(spec) {
  if (spec.target) await attackerWalk(spec.target);
  attackerBubble('think', spec.think[0], spec.think[1], undefined, spec.think[2]);
  spec.highlight?.(true);
  await wait(spec.think[2] ? 1700 : 900); // 詳しい説明があるときは、読む時間を長めに

  const undos = [];
  for (const act of spec.acts) {
    attackerBubble('act', act.icon, act.text, act.tone, act.detail);
    const undo = act.effect?.();
    if (undo) undos.push(undo);
    await wait(act.detail ? 1500 : 800);
  }
  const last = spec.acts[spec.acts.length - 1];
  logStep(last.icon, spec.logText ?? last.text, last.tone);
  undos.forEach((u) => u());
  spec.highlight?.(false);
  await wait(250);
}

async function playAttackers(obj) {
  const types = attackerKeys(stage);
  const reader = types.includes('eve') ? 'eve' : 'mallory';

  attackerPlace(ZONE_RANGE.public[1] - 100, 190, false);
  showAttacker(reader);
  await wait(300);
  for (const step of obj.exposure.steps) await performStep(viewSpec(step, obj));

  if (obj.attacks.length > 0) {
    if (reader !== 'mallory') {
      showAttacker('mallory');
      attackerBubble('think', '😈', 'Mallory も、やってきた…');
      await wait(900);
    }
    for (const a of obj.attacks) await performStep(attackSpec(a, obj));
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
  dom.board.querySelectorAll('.node').forEach((n) => n.classList.remove('is-breached', 'is-safe', 'is-flash'));
  Object.values(dom.zones ?? {}).forEach((z) => z.classList.remove('is-breached', 'is-safe'));
  (dom.transients ?? []).forEach((g) => g.remove());
  dom.transients = [];
  if (dom.attacker) dom.attacker.hidden = true;
  if (dom.zoneLog) {
    dom.zoneLog.replaceChildren();
    dom.zoneLog.hidden = true;
  }
}

// 公開ゾーンの色で、守れたか・破られたかを見せる
function markOutcome(obj) {
  if (obj.status !== 'done' || !stage.attacker) return;
  const breached = obj.checks.some((c) => c.key !== 'delivery' && !c.met);
  dom.zones.public.classList.add(breached ? 'is-breached' : 'is-safe');
}
function setSimulating(on) {
  sim.running = on;
  dom.editor.classList.toggle('is-simulating', on);
  dom.runButton.textContent = on ? 'スキップ' : 'シミュレーション開始';
  dom.resetButton.disabled = on;
  dom.solutionButton.disabled = on;
}

async function runSimulation() {
  clearPending();
  hideResult();
  clearOutcome();
  sim.skipped = false;
  if (toastSticky) {
    toastSticky = false;
    dom.toast.hidden = true;
  }
  syncZones(); // 部品のいるゾーンを、いまの位置で決める

  const ranKey = activeObjective; // 実行中に切り替えられても、この結果は実行した攻撃者のもの
  const res = evaluateStage(stage, graph);
  const obj = res.objectives[ranKey];
  if (stage.tutorial && obj.status === 'done') tutorial.ran = true; // つながっていれば、「見守るステップ」へ
  tutorialRender();

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
   想定解（模範の組み立て方）
   ========================================================== */
// stage.solutions[目標] = { note, nodes: { 名前: [部品, 設定] }, edges: ["a.out>b.data", ...] }
// 「想定解」ボタンで、いまの目標の想定解を、キャンバスに置く。

function updateSolutionButton() {
  dom.solutionButton.hidden = !stage.solutions?.[activeObjective] || Boolean(stage.tutorial);
}

// 想定解の部品を、ゾーンごとに、左から右へ、読みやすく並べる
function layoutGraph(g) {
  const dataEdges = g.edges.filter((e) => e.type === 'data');
  const depth = new Map([['alice', 0]]);

  // Alice から、データの線をたどった深さ（いちばん遠い道のり）
  for (let i = 0; i < g.nodes.length * 3; i += 1) {
    let changed = false;
    dataEdges.forEach((e) => {
      if (!depth.has(e.from.node)) return;
      const nd = depth.get(e.from.node) + 1;
      if (nd < 30 && (!depth.has(e.to.node) || depth.get(e.to.node) < nd)) {
        depth.set(e.to.node, nd);
        changed = true;
      }
    });
    if (!changed) break;
  }
  const onPath = new Set(depth.keys());

  // 鍵や証明書などの「脇の部品」は、使う部品の1つ手前の列に置く
  const helpers = g.nodes.filter((n) => !onPath.has(n.id));
  helpers.forEach((n) => depth.set(n.id, 0));
  for (let i = 0; i < 12; i += 1) {
    helpers.forEach((n) => {
      const outs = g.edges.filter((e) => e.from.node === n.id && depth.has(e.to.node));
      if (outs.length) depth.set(n.id, Math.min(...outs.map((e) => depth.get(e.to.node))) - 1);
    });
  }

  const maxHelp = Math.max(
    0,
    ...['alice', 'public', 'bob'].map((z) => {
      const cols = new Map();
      g.nodes.filter((n) => n.zone === z && !onPath.has(n.id)).forEach((n) => {
        cols.set(depth.get(n.id), (cols.get(depth.get(n.id)) ?? 0) + 1);
      });
      return Math.max(0, ...cols.values());
    })
  );
  const topY = 110;
  const baseY = topY + maxHelp * 215 + (maxHelp ? 30 : 0);

  ['alice', 'public', 'bob'].forEach((z) => {
    const inZone = g.nodes.filter((n) => n.zone === z);
    const ds = [...new Set(inZone.map((n) => depth.get(n.id)))].sort((a, b) => a - b);
    ds.forEach((d, col) => {
      const x = ZONE_RANGE[z][0] + 30 + col * 175;
      const colNodes = inZone.filter((n) => depth.get(n.id) === d);
      colNodes.filter((n) => !onPath.has(n.id)).forEach((n, k) => { n.x = x; n.y = topY + k * 215; });
      colNodes.filter((n) => onPath.has(n.id)).forEach((n, k) => { n.x = x; n.y = baseY + k * 230; });
    });
  });
}
function applySolution() {
  if (sim.running) return; // 実行中は、回路を書き換えない
  const sol = stage.solutions?.[activeObjective];
  if (!sol) return;
  if (graph.edges.length > 0 || graph.nodes.length > 2) {
    if (!window.confirm('いまの配置を、想定解に置き換えます。よろしいですか？')) return;
  }

  seq = 0;
  const idMap = { alice: 'alice', bob: 'bob' };
  const nodes = ['alice', 'bob'].map((id) => ({ id, type: id, zone: id, x: 0, y: 0, params: {} }));
  Object.entries(sol.nodes).forEach(([name, [type, params, zone]]) => {
    const id = nextId(type);
    idMap[name] = id;
    nodes.push({ id, type, zone: zone ?? DEFAULT_ZONE[type] ?? 'alice', x: 0, y: 0, params: { ...(params ?? {}) } });
  });

  const edges = sol.edges.map((str) => {
    const [a, b] = str.split('>');
    const [an, ap] = a.split('.');
    const [bn, bp] = b.split('.');
    const from = nodes.find((n) => n.id === idMap[an]);
    const port = COMPONENTS[from.type].outputs.find((o) => o.id === ap);
    return {
      id: nextId('edge'),
      type: port.type,
      from: { node: idMap[an], port: ap },
      to: { node: idMap[bn], port: bp },
    };
  });

  graph = { nodes, edges };
  layoutGraph(graph);
  paletteTab = null;
  renderNodes();
  onGraphChanged();
  fitZones();
  showToast(`想定解: ${sol.note}　（「シミュレーション開始」で、確かめられます）`, { sticky: true });
}

/* ==========================================================
   チュートリアル（stage.tutorial があるステージ）
   ========================================================== */
// 次にやることを1つずつ案内する。やるべきことの場所に、光る枠をつける。

function tutorialTarget(spec) {
  const [kind, a, b, c] = spec.split(':');
  if (kind === 'node') return nodeElOf(a)?.querySelector('.node-head') ?? null;
  if (kind === 'port') {
    return dom.board.querySelector(`.port[data-node="${a}"][data-port="${b}"][data-dir="${c}"]`);
  }
  if (kind === 'button' && a === 'run') return dom.runButton;
  return null;
}

// 各ステップが「できた」かどうか
const TUTORIAL_DONE = {
  move: () => tutorial.moved,
  link: () => graph.edges.some((e) => e.from.node === 'alice' && e.to.node === 'bob'),
  run: () => tutorial.ran,
  watch: () => tutorial.finished,
};

function tutorialRender() {
  document.querySelectorAll('.tutorial-target').forEach((n) => n.classList.remove('tutorial-target'));
  if (!tutorial.active || !dom.coach) return;

  const i = tutorial.steps.findIndex((st) => !(TUTORIAL_DONE[st.id]?.() ?? false));
  if (i === -1 || tutorial.finished) {
    dom.coach.hidden = true;
    return;
  }
  const st = tutorial.steps[i];
  dom.coach.hidden = false;
  $('#coach-step').textContent = `ステップ ${i + 1} / ${tutorial.steps.length}`;
  $('#coach-text').textContent = st.text;
  (st.targets ?? []).forEach((spec) => tutorialTarget(spec)?.classList.add('tutorial-target'));
}

function tutorialNodeMoved(node) {
  if (!tutorial.active || node.id !== 'alice' || !tutorial.start) return;
  if (Math.hypot(node.x - tutorial.start.x, node.y - tutorial.start.y) > 24) {
    tutorial.moved = true;
    tutorialRender();
  }
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
function termButton(label, id) {
  const b = el('button', 'term', label);
  b.type = 'button';
  b.dataset.term = id;
  const t = GLOSSARY_BY_ID.get(id);
  b.title = t && termUnlocked(id) ? `${t.term}: ${t.short}（クリックでくわしく）` : `${t?.term ?? label} とは？`;
  return b;
}
// 文章の中の用語を、説明を開けるリンクにする（解放済みの用語だけ。同じ用語は最初の1回だけ）
function linkify(text, exclude) {
  return linkifyText(text, { exclude, makeLink: termButton });
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

  const locked = !termUnlocked(id);
  dom.termCat.textContent = t.cat;
  dom.termTitle.textContent = locked ? '？？？' : t.term;
  const body = dom.termBody;
  body.replaceChildren();

  if (locked) {
    body.append(el('p', 'guide-lead', `この用語は、ステージ ${t.stage} に進むと読めるようになります。`));
  } else {
    body.append(elT('p', 'guide-lead', t.short, t.id));
    t.sections.forEach((sec) => body.append(createSection(sec, t.id)));
    const see = (t.see ?? []).filter((x) => GLOSSARY_BY_ID.has(x) && termUnlocked(x));
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
  }
  // ほかの用語を読みたいときは、別のタブの用語集へ
  $('#term-glossary').href = locked ? 'glossary.html' : `glossary.html#${encodeURIComponent(id)}`;
  dom.term.hidden = false;
  body.scrollTop = 0;
  $('#term-close').focus();
}

function closeTerm() {
  if (dom.term.hidden) return;
  dom.term.hidden = true;
  termReturnFocus?.focus?.();
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

  // 資料の文章（このステージの要点）は、ここにまとめる
  if ((stage.lesson ?? []).length) {
    const more = el('details', 'guide-more');
    more.append(el('summary', null, '資料より: このステージの要点'));
    const dl = el('dl', 'lesson-list');
    stage.lesson.forEach((item) => dl.append(el('dt', null, item.label), elT('dd', null, item.text)));
    more.append(dl);
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
  if (!g) {
    if (stage.tutorial?.finish && obj.met) {
      const box = el('div', 'explain');
      box.append(el('h4', null, '解説'), elT('p', null, stage.tutorial.finish));
      return box;
    }
    return null;
  }
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
// 満たせなかった要件のうち、最初のものから、タイトルを決める
function failTitle(obj) {
  const un = obj.checks.find((c) => !c.met);
  switch (un?.key) {
    case 'delivery': return 'Bob に、読めるメッセージが届いていません';
    case 'confidentiality': return '💥 読まれてしまった！';
    case 'integrity':
    case 'authenticity':
    case 'freshness': return '💥 だまされてしまった！';
    case 'nonrepudiation': return '😶 Alice が、言い逃れできてしまう';
    case 'metadata': return '😶 通信相手が、見えてしまう';
    default: return '条件を満たせていません';
  }
}

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
  const keys = objectiveKeys(stage);
  const isFinal = key === keys[keys.length - 1]; // 最後の目標か
  const isTutorial = Boolean(stage.tutorial);

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
    box.append(createActions(obj, key, isFinal));
    revealResult();
    return;
  }

  const allMet = Object.values(res.objectives).every((o) => o.met);
  // 守りの要件（機密性など）が破られたか、それとも Bob に届かなかっただけか
  const breached = obj.checks.some((c) => c.key !== 'delivery' && !c.met);
  box.classList.add(obj.met ? 'is-safe' : 'is-broken');

  let title = isTutorial ? 'つながった！' : `目標 ${key} クリア！`;
  if (!obj.met) title = failTitle(obj);
  else if (isFinal && allMet && !isTutorial) title = '守り切った！';

  const head = el('div', 'result-head');
  head.append(el('h2', 'result-title', title));
  // 評価は、最後の目標まで試し終えたときだけ出す（チュートリアルでは出さない）
  if (isFinal && !isTutorial) {
    const chip = el('span', `rating rating-${res.rating}`, res.rating);
    chip.setAttribute('aria-label', `評価 ${res.rating}`);
    head.append(chip);
  }
  head.append(close);
  box.append(head);

  // 組んだ通信の流れ
  if (res.flow.length) box.append(el('p', 'result-flow', res.flow.join('  →  ')));

  // 本物の通信と、攻撃された通信は、別の場面。分けて見せる
  if (obj.attacks.length > 0) {
    const sc = el('div', 'result-scenes');
    const delivered = obj.checks.find((c) => c.key === 'delivery')?.met;
    sc.append(
      el(
        'p',
        delivered ? 'is-ok' : 'is-ng',
        delivered
          ? `✅ 本物の通信: Bob に「${obj.honest.messageText}」が、ちゃんと届きました。`
          : '❌ 本物の通信: Bob に、読める形で届いていません。'
      )
    );
    const count = (o) => obj.attacks.filter((x) => x.outcome === o).length;
    const parts = [];
    if (count('rejected')) parts.push(`${count('rejected')}回は、Bob が見抜いて拒否`);
    if (count('lost')) parts.push(`${count('lost')}回は、壊れて届かず（だまされてはいない）`);
    if (count('ok')) parts.push(`${count('ok')}回は、影響なし`);
    if (count('bad')) parts.push(`${count('bad')}回は、だまされた`);
    sc.append(
      el('p', count('bad') ? 'is-ng' : 'is-ok', `${count('bad') ? '💥' : '🛡'} 攻撃された通信（${obj.attacks.length}回）: ${parts.join(' ・ ')}`)
    );
    box.append(sc);
  }

  // 置き場所の注意（鍵ペアの持ち主と、ゾーンが合っていない など）
  const warns = refreshWarnings();
  if (warns.size > 0) {
    const w = el('ul', 'result-warn');
    warns.forEach((text) => w.append(el('li', null, `⚠ ${text}`)));
    box.append(w);
  }

  // いま挑戦している目標の結果
  const grid = el('div', 'result-objectives');
  const card = el('div', `result-objective ${obj.met ? 'is-met' : 'is-unmet'}`);
  const h3 = el('h3');
  h3.append(el('span', null, `目標 ${key}`), el('span', null, obj.met ? '達成' : '未達成'));
  card.append(h3);
  const list = el('div', 'check-list');
  [...obj.checks].sort((x, y) => Number(x.met) - Number(y.met)).forEach((c) => {
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
    const nextKey = keys[keys.indexOf(key) + 1];
    box.append(
      el('p', 'result-note', `目標 ${key} をクリアしました。次のステージへ進めます。さらに、新しい条件（目標 ${nextKey}）に挑戦することもできます。`)
    );
  } else if (obj.met && isFinal && allMet && !isTutorial) {
    // 評価の理由。実行したときの、ペアとパーツの数を、想定解と並べて見せる
    const i = res.ratingInfo;
    const counts =
      i.baseParts != null
        ? `ペア ${i.pairs}（想定解 ${i.basePairs}）・パーツ ${i.parts}（想定解 ${i.baseParts}）`
        : `ペア ${i.pairs}・パーツ ${i.parts}`;
    const note = el('div', `result-note rating-note${i.fewer ? ' is-nice' : ''}`);
    note.append(el('strong', null, i.reason), el('small', null, counts));
    box.append(note);
  }

  box.append(createActions(obj, key, isFinal));

  // 進捗: 目標 A をクリアしたら、ステージクリア（次のステージが遊べる）。評価は最後の目標のときに決まる。
  if (obj.met) {
    recordObjective(stage.id, key, isFinal ? res.rating : 'B', key === keys[0]);
    clearedKeys = clearedObjectives(stage.id);
    if (isTutorial) tutorial.finished = true;
    tutorialRender();
  }
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

// simulator.html に必要な要素（HTML が古いと、ここが足りなくなる）
const REQUIRED_IDS = [
  'sim-status', 'sim-root', 'editor', 'board', 'world', 'edges',
  'stage-title', 'stage-goal', 'attacker-group', 'attacker-badges', 'attacker-caps', 'objective-list',
  'side-stack', 'brief-panel', 'brief-toggle', 'guide-open', 'glossary-link',
  'toolbar', 'solution-button', 'reset-button', 'run-button',
  'zoom-in', 'zoom-out', 'zoom-label', 'zoom-fit',
  'palette-bar', 'legend', 'palette-tabs', 'palette', 'result', 'toast', 'coach', 'coach-step', 'coach-text',
  'guide', 'guide-title', 'guide-body', 'guide-close', 'guide-start',
  'term-dialog', 'term-cat', 'term-title', 'term-body', 'term-close', 'term-done', 'term-glossary',
];

// 足りない要素があれば、エラーで止まる前に、原因を画面に出す
function checkPage() {
  const missing = REQUIRED_IDS.filter((id) => !document.getElementById(id));
  if (missing.length === 0) return true;

  const msg =
    `simulator.html が、js/simulator.js より古いようです（見つからない要素: ${missing.map((i) => `#${i}`).join('、')}）。` +
    '最新の simulator.html（と css/simulator.css）に差し替えて、ブラウザを強制再読み込み（Ctrl+Shift+R）してください。';
  console.error(msg);
  let box = document.getElementById('sim-status');
  if (!box) {
    box = document.createElement('p');
    document.body.prepend(box);
  }
  box.hidden = false;
  box.classList.add('is-error');
  box.textContent = msg;
  return false;
}
async function init() {
  if (!checkPage()) return;
  dom.status = $('#sim-status');
  dom.root = $('#sim-root');
  dom.editor = $('#editor');
  dom.board = $('#board');
  dom.world = $('#world');
  dom.zoomLabel = $('#zoom-label');
  dom.result = $('#result');
  dom.palette = $('#palette');
  dom.paletteTabs = $('#palette-tabs');
  dom.paletteBar = $('#palette-bar');
  dom.legend = $('#legend');
  dom.sideStack = $('#side-stack');
  dom.briefPanel = $('#brief-panel');
  dom.briefToggle = $('#brief-toggle');
  dom.attackerGroup = $('#attacker-group');
  dom.toolbar = $('#toolbar');
  dom.runButton = $('#run-button');
  dom.resetButton = $('#reset-button');
  dom.solutionButton = $('#solution-button');
  dom.toast = $('#toast');
  dom.coach = $('#coach');
  dom.guide = $('#guide');
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

  // 前のステージをクリアするまで、遊べない
  if (!isStageUnlocked(id)) {
    dom.status.hidden = false;
    dom.status.classList.add('is-error');
    dom.status.replaceChildren('このステージは、前のステージをクリアすると遊べます。 ');
    const back = el('a', 'status-link', 'ステージ一覧へ戻る');
    back.href = 'index.html#stage-section';
    dom.status.append(back);
    return;
  }

  // クリア済みの目標は飛ばして、まだの目標から始める（A をクリア済みなら、新しい条件の B から）
  clearedKeys = clearedObjectives(id);
  const okeys = objectiveKeys(stage);
  activeObjective = okeys.find((k) => !clearedKeys.includes(k)) ?? okeys[okeys.length - 1];

  // 線を描く SVG のレイヤー（確定した線 / つなぎ途中の線 / 電気の先頭の光 / 状態の文字）
  const svg = $('#edges');
  dom.edgeLayer = svgEl('g');
  dom.tempLayer = svgEl('g');
  dom.sparkLayer = svgEl('g');
  dom.labelLayer = svgEl('g');
  svg.append(dom.edgeLayer, dom.tempLayer, dom.sparkLayer, dom.labelLayer);
  buildZones();

  dom.status.hidden = true;
  dom.root.hidden = false;

  if (stage.tutorial) {
    tutorial.active = true;
    tutorial.steps = stage.tutorial.steps ?? [];
  }

  renderBrief();
  renderLegend();
  renderPalette();
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
  dom.solutionButton.addEventListener('click', applySolution);
  updateSolutionButton();

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

  // 用語の説明（いまの画面に重ねて出す）。ほかの用語を読むときは、別タブの用語集へ。
  $('#term-close').addEventListener('click', closeTerm);
  $('#term-done').addEventListener('click', closeTerm);
  dom.term.addEventListener('click', (e) => {
    if (e.target === dom.term) closeTerm();
  });
  // 下線つきの言葉・「?」は、どこにあっても、その用語の説明を開く
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
    else if (!dom.guide.hidden) closeGuide();
    else clearPending();
  });

  if (stage.guide && !guideSeen(stage.id) && !stage.tutorial) openGuide();
  if (activeObjective !== okeys[0] && clearedKeys.length > 0) {
    showToast(`目標 ${clearedKeys[0]} はクリア済みです。新しい条件（目標 ${activeObjective}）に挑戦しよう`);
  }

  window.addEventListener('resize', renderEdges);
  if (document.fonts?.ready) document.fonts.ready.then(renderEdges);
}

init();
