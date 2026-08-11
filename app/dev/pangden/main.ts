/**
 * Phase 1 dev page — the approved pangden physics proof, with the solver coming
 * from @chupa/cloth instead of being inlined.
 *
 * Everything below the solver import is throwaway dev rendering: a raw WebGL
 * port of the reference demo's renderer, kept here rather than in a package
 * because the real renderer is Phase 5. Physics, normals, and the index buffer
 * all come from the package — if this page looks and feels like
 * reference/pangden-physics-proof.html, Phase 1 landed.
 */

import {
  FABRICS,
  FABRIC_KEYS,
  REFERENCE_GRID,
  buildGridIndices,
  computeGridNormals,
  createGridCloth,
  createSolver,
  energy,
  maxOverstretch,
  resetSolver,
  setFabric,
  stepFrame,
} from '@chupa/cloth';
import type { Fabric } from '@chupa/cloth';

// ---------------------------------------------------------------------------
// Simulation — all of it from the package.
// ---------------------------------------------------------------------------

const COLS = REFERENCE_GRID.cols;
const ROWS = REFERENCE_GRID.rows;
const SPACING = REFERENCE_GRID.spacing;

const cloth = createGridCloth({ cols: COLS, rows: ROWS, spacing: SPACING });
const solver = createSolver({ cloth, fabric: FABRICS.silk, breeze: 0.45 });
const P = solver.particles;
const N = P.count;

const idx = (c: number, r: number) => r * COLS + c;

// ---------------------------------------------------------------------------
// Pangden stripe program — one texel per particle row, NEAREST filtered.
// ---------------------------------------------------------------------------

const PALETTE: Record<string, [number, number, number]> = {
  R: [179, 40, 45], O: [217, 108, 43], Y: [224, 165, 38],
  G: [62, 122, 69], T: [46, 127, 135], B: [44, 78, 138],
  M: [166, 58, 110], W: [232, 226, 212], K: [38, 36, 40],
};
const BANDS = 'R3 K1 Y2 G3 K1 W1 B3 M2 K1 O2 T3 K1 R2 Y1 G2 B2 K1 M3 W1 O3'
  .split(' ')
  .map((s) => ({ c: s[0], w: +s.slice(1) }));

// ---------------------------------------------------------------------------
// Raw WebGL renderer (dev-only; Phase 5 replaces this).
// camera model: screen = C + p * FOCAL / (CAMZ + z)
// ---------------------------------------------------------------------------

const cv = document.getElementById('c') as HTMLCanvasElement;
const gl = cv.getContext('webgl', { antialias: true });
if (!gl) throw new Error('WebGL unavailable');

let W = 0, H = 0, DPR = 1, FOCAL = 0, CX = 0, CY = 0;
const CAMZ = 60;

const VSH = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute float aV;
uniform float uF, uCamZ, uCX, uCY, uW, uH;
varying vec3 vN;
varying float vV;
void main() {
  float zc = uCamZ + aPos.z;
  float xs = uCX + aPos.x * uF / zc;
  float ys = uCY - aPos.y * uF / zc;
  float xn = xs / uW * 2.0 - 1.0;
  float yn = 1.0 - ys / uH * 2.0;
  float zn = (zc - 20.0) / 100.0;
  gl_Position = vec4(xn, yn, zn, 1.0);
  vN = aNor;
  vV = aV;
}`;

const FSH = `
precision mediump float;
uniform sampler2D uStripe;
uniform float uSheen, uSat;
varying vec3 vN;
varying float vV;
void main() {
  vec3 L = normalize(vec3(-0.35, 0.42, 0.84));
  vec3 n = normalize(vN);
  if (n.z < 0.0) n = -n;
  float diff = max(0.12, dot(n, L));
  float spec = pow(diff, 24.0) * uSheen;
  vec3 col = texture2D(uStripe, vec2(0.5, vV)).rgb;
  float grey = (col.r + col.g + col.b) / 3.0;
  col = mix(vec3(grey), col, uSat);
  vec3 outc = col * (0.30 + diff * 0.80) + vec3(spec);
  gl_FragColor = vec4(outc, 1.0);
}`;

function makeShader(type: number, src: string): WebGLShader {
  const s = gl!.createShader(type)!;
  gl!.shaderSource(s, src);
  gl!.compileShader(s);
  if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl!.getShaderInfoLog(s)}`);
  }
  return s;
}

const prog = gl.createProgram()!;
gl.attachShader(prog, makeShader(gl.VERTEX_SHADER, VSH));
gl.attachShader(prog, makeShader(gl.FRAGMENT_SHADER, FSH));
gl.linkProgram(prog);
gl.useProgram(prog);

const U: Record<string, WebGLUniformLocation | null> = {};
for (const n of ['uF', 'uCamZ', 'uCX', 'uCY', 'uW', 'uH', 'uStripe', 'uSheen', 'uSat']) {
  U[n] = gl.getUniformLocation(prog, n);
}
const A = {
  pos: gl.getAttribLocation(prog, 'aPos'),
  nor: gl.getAttribLocation(prog, 'aNor'),
  v: gl.getAttribLocation(prog, 'aV'),
};

(function makeStripeTex() {
  const data = new Uint8Array(ROWS * 4);
  let bi = 0;
  let left = BANDS[0].w;
  for (let r = 0; r < ROWS; r++) {
    const col = PALETTE[BANDS[bi].c];
    data[r * 4] = col[0]; data[r * 4 + 1] = col[1]; data[r * 4 + 2] = col[2]; data[r * 4 + 3] = 255;
    if (--left === 0) { bi = (bi + 1) % BANDS.length; left = BANDS[bi].w; }
  }
  const tex = gl!.createTexture();
  gl!.bindTexture(gl!.TEXTURE_2D, tex);
  gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, 1, ROWS, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, data);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
  gl!.activeTexture(gl!.TEXTURE0);
  gl!.uniform1i(U.uStripe, 0);
})();

const vArr = new Float32Array(N);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) vArr[idx(c, r)] = (r + 0.5) / ROWS;
}
const vBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vBuf);
gl.bufferData(gl.ARRAY_BUFFER, vArr, gl.STATIC_DRAW);

const indices = buildGridIndices(cloth);
const iBuf = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

const posArr = new Float32Array(N * 3);
const norArr = new Float32Array(N * 3);
const posBuf = gl.createBuffer();
const norBuf = gl.createBuffer();

function resize() {
  const s = document.getElementById('stage') as HTMLElement;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = s.clientWidth; H = s.clientHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  gl!.viewport(0, 0, cv.width, cv.height);
  const worldH = ROWS * SPACING;
  FOCAL = (H * 0.82) * CAMZ / worldH;
  CX = W / 2; CY = H * 0.10;
  gl!.uniform1f(U.uF, FOCAL); gl!.uniform1f(U.uCamZ, CAMZ);
  gl!.uniform1f(U.uCX, CX); gl!.uniform1f(U.uCY, CY);
  gl!.uniform1f(U.uW, W); gl!.uniform1f(U.uH, H);

  const halfW = ((COLS - 1) / 2 * SPACING + 1.2) * FOCAL / CAMZ;
  const rod = document.getElementById('rod') as HTMLElement;
  rod.style.left = `${CX - halfW}px`;
  rod.style.width = `${halfW * 2}px`;
  rod.style.top = `${CY - 6}px`;
}
window.addEventListener('resize', resize);
resize();

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.086, 0.082, 0.102, 1.0);

function render() {
  for (let i = 0; i < N; i++) {
    posArr[i * 3] = P.px[i]; posArr[i * 3 + 1] = P.py[i]; posArr[i * 3 + 2] = P.pz[i];
  }
  computeGridNormals(cloth, norArr);

  gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
  gl!.uniform1f(U.uSheen, solver.fabric.sheen);
  gl!.uniform1f(U.uSat, solver.fabric.sat);

  gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuf);
  gl!.bufferData(gl!.ARRAY_BUFFER, posArr, gl!.DYNAMIC_DRAW);
  gl!.enableVertexAttribArray(A.pos);
  gl!.vertexAttribPointer(A.pos, 3, gl!.FLOAT, false, 0, 0);

  gl!.bindBuffer(gl!.ARRAY_BUFFER, norBuf);
  gl!.bufferData(gl!.ARRAY_BUFFER, norArr, gl!.DYNAMIC_DRAW);
  gl!.enableVertexAttribArray(A.nor);
  gl!.vertexAttribPointer(A.nor, 3, gl!.FLOAT, false, 0, 0);

  gl!.bindBuffer(gl!.ARRAY_BUFFER, vBuf);
  gl!.enableVertexAttribArray(A.v);
  gl!.vertexAttribPointer(A.v, 1, gl!.FLOAT, false, 0, 0);

  gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, iBuf);
  gl!.drawElements(gl!.TRIANGLES, indices.length, gl!.UNSIGNED_SHORT, 0);
}

// ---------------------------------------------------------------------------
// Interaction — pick the nearest projected particle, drag it, let go to flick.
// ---------------------------------------------------------------------------

const tmpX = new Float32Array(N);
const tmpY = new Float32Array(N);

function pickParticle(mx: number, my: number): number {
  for (let i = 0; i < N; i++) {
    const zc = CAMZ + P.pz[i];
    tmpX[i] = CX + P.px[i] * FOCAL / zc;
    tmpY[i] = CY - P.py[i] * FOCAL / zc;
  }
  let best = -1;
  let bestD = 30 * 30;
  for (let i = 0; i < N; i++) {
    const dx = tmpX[i] - mx;
    const dy = tmpY[i] - my;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return best;
}

function screenToWorld(mx: number, my: number, zc: number): [number, number] {
  return [(mx - CX) * zc / FOCAL, -(my - CY) * zc / FOCAL];
}

let hintFaded = false;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  const i = pickParticle(e.offsetX, e.offsetY);
  if (i >= 0 && !P.pinned[i]) {
    solver.grabbed = i;
    const [wx, wy] = screenToWorld(e.offsetX, e.offsetY, CAMZ + P.pz[i]);
    solver.grabX = wx; solver.grabY = wy;
    cv.classList.add('grabbing');
    if (!hintFaded) {
      (document.getElementById('hint') as HTMLElement).style.opacity = '0';
      hintFaded = true;
    }
  }
});
cv.addEventListener('pointermove', (e) => {
  if (solver.grabbed < 0) return;
  const [wx, wy] = screenToWorld(e.offsetX, e.offsetY, CAMZ + P.pz[solver.grabbed]);
  solver.grabX = wx; solver.grabY = wy;
});
function release() {
  // Releasing keeps the Verlet velocity the drag built up — that is the flick.
  solver.grabbed = -1;
  cv.classList.remove('grabbing');
}
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const fabWrap = document.getElementById('fabrics') as HTMLElement;
for (const key of FABRIC_KEYS) {
  const f: Fabric = FABRICS[key];
  const b = document.createElement('button');
  b.className = `chip${f === solver.fabric ? ' on' : ''}`;
  b.innerHTML = `${f.label}<small>${f.note}</small>`;
  b.onclick = () => {
    // Live physics event, not a texture swap: positions carry over, response changes.
    setFabric(solver, f);
    for (const el of Array.from(fabWrap.children)) el.classList.remove('on');
    b.classList.add('on');
    showParams();
  };
  fabWrap.appendChild(b);
}

function showParams() {
  const f = solver.fabric;
  (document.getElementById('params') as HTMLElement).innerHTML =
    `bend <b>${f.bend.toFixed(2)}</b>&nbsp;&nbsp;density <b>${f.density.toFixed(2)}</b>` +
    `<br>damping <b>${f.damping.toFixed(3)}</b>&nbsp;&nbsp;sheen <b>${f.sheen.toFixed(2)}</b>`;
}
showParams();

const windSlider = document.getElementById('wind') as HTMLInputElement;
const windOut = document.getElementById('windOut') as HTMLOutputElement;
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) windSlider.value = '0';
function syncWind() {
  solver.breeze = Number(windSlider.value) / 100;
  windOut.textContent = windSlider.value;
}
windSlider.addEventListener('input', syncWind);
syncWind();

const strainBtn = document.getElementById('strainBtn') as HTMLButtonElement;
strainBtn.onclick = () => {
  // Off by default; on, the cloth goes near-inextensible and the feel changes.
  solver.strainLimit = solver.strainLimit === null ? 0.01 : null;
  solver.strainLimitPasses = 32;
  strainBtn.classList.toggle('on', solver.strainLimit !== null);
};

(document.getElementById('resetBtn') as HTMLButtonElement).onclick = () => resetSolver(solver);

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const readout = document.getElementById('readout') as HTMLElement;
let frames = 0;
let lastReadout = performance.now();
let simMs = 0;

function frame() {
  const t0 = performance.now();
  stepFrame(solver);
  simMs += performance.now() - t0;
  render();

  if (++frames >= 30) {
    const now = performance.now();
    const fps = frames * 1000 / (now - lastReadout);
    readout.innerHTML =
      `<b>${fps.toFixed(0)}</b> fps · sim <b>${(simMs / frames).toFixed(2)}</b> ms/frame<br>` +
      `${N} particles · energy <b>${energy(solver).toFixed(3)}</b><br>` +
      `max stretch <b>${(maxOverstretch(P, solver.constraints.structural) * 100).toFixed(1)}%</b>` +
      (solver.strainLimit !== null ? ` · limited (${solver.lastStrainPasses}p)` : '');
    frames = 0; simMs = 0; lastReadout = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
