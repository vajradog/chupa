/**
 * The cut — a to-scale front elevation you draw the chupa on.
 *
 * Why this exists: the silhouette is fixed and front-facing, which makes the
 * front outline *the* description of the garment. Up to now that outline was
 * being reconstructed from a dozen scalars guessed off reference photographs,
 * and every guess cost a code-change-and-squint round trip. Here the outline is
 * drawn directly over the real mannequin at true scale, and the drawing is the
 * source of truth: it saves into `pattern/panels.json` as `$traced`.
 *
 * Everything is in centimetres from the floor, x = 0 at the centreline. Strokes
 * are folded to |x| as they are drawn, so it does not matter which side you use
 * and the result is symmetric by construction.
 */

import { buildForm } from '@chupa/body';
import { buildChupa } from '@chupa/garment';
import type { Piece } from '@chupa/garment';

const form = buildForm();
const chupa = buildChupa(form);
const CM = form.scale;              // cm -> world units
const toCm = (world: number) => world / CM;
const HEIGHT_CM = form.measurements.height;

// ---------------------------------------------------------------------------
// Layers — each one is a curve the garment builder will read
// ---------------------------------------------------------------------------

type LayerId = 'silhouette' | 'topEdge' | 'collar' | 'sleeve';

interface Layer {
  id: LayerId;
  label: string;
  colour: string;
  hint: string;
}

const LAYERS: Layer[] = [
  {
    id: 'silhouette',
    label: 'silhouette',
    colour: '#e9633f',
    hint: 'The chupa\'s outer edge — from the shoulder down the side to the hem, ' +
      'then in along the hem to the centre. This is the whole A-line.',
  },
  {
    id: 'topEdge',
    label: 'top edge',
    colour: '#4fb0c6',
    hint: 'The chupa\'s top edge across the front: centre of the V, up over the ' +
      'shoulder, down into the armhole at the side.',
  },
  {
    id: 'collar',
    label: 'honju collar',
    colour: '#d8c169',
    hint: 'The outer edge of the honju\'s shawl collar where it folds out over ' +
      'the chupa — the band, not the chupa\'s V under it.',
  },
  {
    id: 'sleeve',
    label: 'honju sleeve',
    colour: '#9fd48a',
    hint: 'The sleeve\'s outer edge, shoulder to cuff, and across the cuff.',
  },
];

/** Traced points, in cm, per layer. */
const traces: Record<LayerId, [number, number][]> = {
  silhouette: [], topEdge: [], collar: [], sleeve: [],
};

let active: LayerId = 'silhouette';
let showFigure = true;
let showCurrent = true;
let showGrid = true;

// ---------------------------------------------------------------------------
// What the code builds today — drawn faintly underneath, so the trace is a
// correction of something rather than a blank page.
// ---------------------------------------------------------------------------

/**
 * Outline of a set of pieces: widest |x| at each height band, in cm.
 *
 * Bands are 3 cm — comfortably more than the ~2.5 cm between particle rows. Any
 * finer and a band catches the flap's rows but not the skirt's, so the outline
 * oscillates between the two instead of tracing the widest thing at that height.
 */
function outlineOf(pieces: Piece[]): [number, number][] {
  const lo = toCm(form.bounds.min[1]);
  const hi = toCm(form.bounds.max[1]);
  const BANDS = Math.round((hi - lo) / 3);
  const widest = new Float64Array(BANDS).fill(-1);
  for (const piece of pieces) {
    const p = piece.cloth.particles;
    for (let i = 0; i < p.count; i++) {
      const yCm = toCm(p.py[i]);
      const b = Math.floor(((yCm - lo) / (hi - lo)) * (BANDS - 1));
      if (b < 0 || b >= BANDS) continue;
      widest[b] = Math.max(widest[b], Math.abs(toCm(p.px[i])));
    }
  }
  const out: [number, number][] = [];
  for (let b = 0; b < BANDS; b++) {
    if (widest[b] < 0) continue;
    out.push([widest[b], lo + ((hi - lo) * b) / (BANDS - 1)]);
  }
  return out;
}

const named = (...names: string[]) =>
  chupa.pieces.filter((p) => names.includes(p.name));

const currentCurves: { colour: string; pts: [number, number][] }[] = [
  {
    colour: '#e9633f',
    pts: outlineOf(named('bodice', 'wrap', 'shoulderLeft', 'shoulderRight', 'sash', 'skirt')),
  },
  { colour: '#9fd48a', pts: outlineOf(named('sleeveLeft', 'sleeveRight')) },
  { colour: '#d8c169', pts: outlineOf(named('collarLeft', 'collarRight')) },
];

/** The bodice's own top row on the front half — the V and armhole as built. */
const currentTopEdge: [number, number][] = (() => {
  const bodice = chupa.pieces.find((p) => p.name === 'bodice');
  if (!bodice) return [];
  const p = bodice.cloth.particles;
  const pts: [number, number][] = [];
  for (let c = 0; c < bodice.cloth.cols; c++) {
    const i = c; // row 0
    if (p.pz[i] > 0) continue; // front half only; the camera never sees the back
    pts.push([Math.abs(toCm(p.px[i])), toCm(p.py[i])]);
  }
  return pts.sort((a, b) => a[0] - b[0]);
})();

/** The figure's own silhouette, scanned straight off the SDF at z = 0. */
const figureOutline: [number, number][] = (() => {
  const pts: [number, number][] = [];
  const lo = form.bounds.min[1];
  const hi = form.bounds.max[1];
  const maxX = form.bounds.max[0] + 2;
  for (let s = 0; s <= 220; s++) {
    const y = lo + ((hi - lo) * s) / 220;
    if (form.sdf(0, y, 0) > 0) continue; // above the shoulders, nothing to hit
    let inside = 0;
    let out = maxX;
    for (let it = 0; it < 22; it++) {
      const mid = (inside + out) / 2;
      if (form.sdf(mid, y, 0) <= 0) inside = mid; else out = mid;
    }
    pts.push([toCm(inside), toCm(y)]);
  }
  return pts;
})();

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

const cv = document.getElementById('c') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
let W = 0, H = 0, DPR = 1;
let pxPerCm = 1, originX = 0, floorY = 0;

function resize() {
  const stage = document.getElementById('stage') as HTMLElement;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = stage.clientWidth; H = stage.clientHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  pxPerCm = (H * 0.90) / HEIGHT_CM;
  originX = W / 2;
  floorY = H - (H - HEIGHT_CM * pxPerCm) / 2;
  draw();
}
window.addEventListener('resize', resize);

const sx = (cm: number) => originX + cm * pxPerCm;
const sy = (cm: number) => floorY - cm * pxPerCm;
const cmX = (px: number) => (px - originX) / pxPerCm;
const cmY = (px: number) => (floorY - px) / pxPerCm;

function strokePath(pts: [number, number][], mirror: boolean, close = false) {
  if (pts.length === 0) return;
  ctx.beginPath();
  const side = mirror ? -1 : 1;
  ctx.moveTo(sx(pts[0][0] * side), sy(pts[0][1]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i][0] * side), sy(pts[i][1]));
  if (close) ctx.closePath();
  ctx.stroke();
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  if (showGrid) {
    ctx.lineWidth = 1;
    for (let cm = 0; cm <= HEIGHT_CM; cm += 5) {
      const major = cm % 10 === 0;
      ctx.strokeStyle = major ? 'rgba(233,227,213,0.10)' : 'rgba(233,227,213,0.04)';
      ctx.beginPath();
      ctx.moveTo(0, sy(cm)); ctx.lineTo(W, sy(cm)); ctx.stroke();
      if (major && cm % 20 === 0) {
        ctx.fillStyle = 'rgba(155,149,138,0.55)';
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.fillText(`${cm}`, 8, sy(cm) - 3);
      }
    }
    for (let cm = -80; cm <= 80; cm += 10) {
      ctx.strokeStyle = cm === 0 ? 'rgba(233,227,213,0.16)' : 'rgba(233,227,213,0.05)';
      ctx.beginPath();
      ctx.moveTo(sx(cm), 0); ctx.lineTo(sx(cm), H); ctx.stroke();
    }
  }

  if (showFigure) {
    ctx.fillStyle = 'rgba(233,227,213,0.055)';
    ctx.beginPath();
    for (let i = 0; i < figureOutline.length; i++) {
      const [x, y] = figureOutline[i];
      if (i === 0) ctx.moveTo(sx(x), sy(y)); else ctx.lineTo(sx(x), sy(y));
    }
    for (let i = figureOutline.length - 1; i >= 0; i--) {
      const [x, y] = figureOutline[i];
      ctx.lineTo(sx(-x), sy(y));
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(233,227,213,0.22)';
    ctx.lineWidth = 1;
    strokePath(figureOutline, false);
    strokePath(figureOutline, true);
  }

  if (showCurrent) {
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.25;
    for (const c of currentCurves) {
      ctx.strokeStyle = c.colour + '55';
      strokePath(c.pts, false);
      strokePath(c.pts, true);
    }
    ctx.strokeStyle = '#4fb0c655';
    strokePath(currentTopEdge, false);
    strokePath(currentTopEdge, true);
    ctx.setLineDash([]);
  }

  for (const layer of LAYERS) {
    const pts = traces[layer.id];
    if (pts.length === 0) continue;
    ctx.strokeStyle = layer.colour;
    ctx.lineWidth = layer.id === active ? 2.5 : 1.75;
    ctx.globalAlpha = layer.id === active ? 1 : 0.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    strokePath(pts, false);
    strokePath(pts, true);
    ctx.globalAlpha = 1;
  }

  readout();
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

let drawing = false;

function addPoint(ev: PointerEvent) {
  const r = cv.getBoundingClientRect();
  // Folded to |x|: draw on whichever side you like, the cut is symmetric.
  const x = Math.abs(cmX(ev.clientX - r.left));
  const y = cmY(ev.clientY - r.top);
  const pts = traces[active];
  const last = pts[pts.length - 1];
  if (last && Math.hypot(last[0] - x, last[1] - y) < 0.6) return;
  pts.push([x, y]);
  draw();
}

cv.addEventListener('pointerdown', (ev) => {
  drawing = true;
  cv.setPointerCapture(ev.pointerId);
  traces[active] = [];        // one stroke per layer: redrawing is correcting
  addPoint(ev);
});
cv.addEventListener('pointermove', (ev) => { if (drawing) addPoint(ev); });
cv.addEventListener('pointerup', () => { drawing = false; draw(); });
cv.addEventListener('pointercancel', () => { drawing = false; });

// ---------------------------------------------------------------------------
// Derived measurements — what the trace actually says, in numbers
// ---------------------------------------------------------------------------

/** Widest half-width of a trace within a height band, cm. */
function widthNear(pts: [number, number][], yCm: number, band = 3): number | null {
  let best: number | null = null;
  for (const [x, y] of pts) {
    if (Math.abs(y - yCm) > band) continue;
    if (best === null || x > best) best = x;
  }
  return best;
}

const readoutEl = document.getElementById('readout') as HTMLElement;

function readout() {
  const sil = traces.silhouette;
  const top = traces.topEdge;
  const waistCm = toCm(form.levelOf('waist'));
  const shoulderCm = toCm(form.levelOf('shoulder'));
  const rows: string[] = [];

  if (sil.length > 1) {
    let hemY = Infinity;
    let hemX = 0;
    for (const [x, y] of sil) if (y < hemY) { hemY = y; hemX = x; }
    for (const [x, y] of sil) if (Math.abs(y - hemY) < 2 && x > hemX) hemX = x;
    const atWaist = widthNear(sil, waistCm);
    rows.push(`hem <b>${(hemX * 2).toFixed(0)}</b> cm wide · <b>${hemY.toFixed(0)}</b> cm up`);
    if (atWaist) {
      rows.push(`waist <b>${(atWaist * 2).toFixed(0)}</b> cm`);
      rows.push(`flare <b>${(hemX / atWaist).toFixed(2)}</b>×`);
    }
  }
  if (top.length > 1) {
    let vY = Infinity;
    for (const [x, y] of top) if (x < 4 && y < vY) vY = y;
    if (vY < Infinity) rows.push(`V drop <b>${(shoulderCm - vY).toFixed(0)}</b> cm`);
    let armY = Infinity;
    let widest = 0;
    for (const [x] of top) widest = Math.max(widest, x);
    for (const [x, y] of top) if (x > widest - 3 && y < armY) armY = y;
    if (armY < Infinity) {
      rows.push(`armhole <b>${(shoulderCm - armY).toFixed(0)}</b> cm`);
      rows.push(`half span <b>${widest.toFixed(0)}</b> cm`);
    }
  }
  const drawn = LAYERS.filter((l) => traces[l.id].length > 1).length;
  rows.push(`<span style="opacity:.6">${drawn} of ${LAYERS.length} layers traced</span>`);
  readoutEl.innerHTML = rows.join('<br>');
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const hintEl = document.getElementById('hint') as HTMLElement;
const layerHost = document.getElementById('layers') as HTMLElement;

function syncLayerButtons() {
  for (const el of Array.from(layerHost.children)) {
    const on = (el as HTMLElement).dataset.id === active;
    el.classList.toggle('on', on);
    const n = el.querySelector('.n');
    if (n) {
      const id = (el as HTMLElement).dataset.id as LayerId;
      n.textContent = traces[id].length > 1 ? '✓' : '';
    }
  }
  const layer = LAYERS.find((l) => l.id === active)!;
  hintEl.innerHTML = `<b>${layer.label}</b> — ${layer.hint}`;
}

for (const layer of LAYERS) {
  const b = document.createElement('button');
  b.className = 'tbtn';
  b.dataset.id = layer.id;
  b.innerHTML =
    `<span class="dot" style="background:${layer.colour}"></span>${layer.label}<span class="n"></span>`;
  b.onclick = () => { active = layer.id; syncLayerButtons(); draw(); };
  layerHost.appendChild(b);
}
syncLayerButtons();

const toggle = (id: string, get: () => boolean, set: (v: boolean) => void) => {
  const b = document.getElementById(id) as HTMLButtonElement;
  b.onclick = () => { set(!get()); b.classList.toggle('on', get()); draw(); };
};
toggle('figureBtn', () => showFigure, (v) => { showFigure = v; });
toggle('currentBtn', () => showCurrent, (v) => { showCurrent = v; });
toggle('gridBtn', () => showGrid, (v) => { showGrid = v; });

(document.getElementById('clearBtn') as HTMLButtonElement).onclick = () => {
  traces[active] = []; syncLayerButtons(); draw();
};
(document.getElementById('clearAllBtn') as HTMLButtonElement).onclick = () => {
  for (const l of LAYERS) traces[l.id] = [];
  syncLayerButtons(); draw();
};

const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
saveBtn.onclick = async () => {
  const round = (pts: [number, number][]) =>
    pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  const payload = {
    $note:
      'Traced on the /dev/cut/ front elevation. Points are [halfWidthCm, heightAboveFloorCm], ' +
      'folded to the right half — the cut is symmetric. This is the source of truth for the ' +
      'silhouette; the scalars above are derived from it or overridden by it.',
    $againstHeightCm: HEIGHT_CM,
    silhouette: round(traces.silhouette),
    topEdge: round(traces.topEdge),
    collar: round(traces.collar),
    sleeve: round(traces.sleeve),
  };
  saveBtn.textContent = 'saving…';
  try {
    const res = await fetch('/__cut', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    saveBtn.textContent = 'saved ✓';
  } catch (err) {
    saveBtn.textContent = 'save failed';
    console.error(err);
  }
  setTimeout(() => { saveBtn.textContent = 'save to panels.json'; }, 2200);
};

resize();
