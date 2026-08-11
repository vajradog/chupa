/**
 * Phase 2 dev page — the parametric mannequin, with a cloth square you can drop
 * on her shoulders.
 *
 * This is the acceptance criterion made visible: if the cloth catches on the
 * shoulders, wraps front to back, and stays there while you turn her, the SDF
 * collision works. Rendering is throwaway dev code (Phase 5 owns the real one).
 */

import {
  MEASUREMENTS,
  bakeSdf,
  buildForm,
  buildFormMesh,
  createSdfCollider,
  gridBytes,
  maxPenetration,
} from '@chupa/body';
import {
  FABRICS,
  FABRIC_KEYS,
  buildGridIndices,
  computeGridNormals,
  createGridCloth,
  createSolver,
  resetGridCloth,
  setFabric,
  stepFrame,
} from '@chupa/cloth';
import type { Fabric, GridCloth } from '@chupa/cloth';

// ---------------------------------------------------------------------------
// Figure + collision field
// ---------------------------------------------------------------------------

const form = buildForm();
const bakeStart = performance.now();
const grid = bakeSdf(form.sdf, form.bounds, { cell: 0.5 });
const bakeMs = performance.now() - bakeStart;
const MARGIN = grid.cell * 0.5;
const collider = createSdfCollider(grid, { margin: MARGIN, friction: 0.6 });

const formMesh = buildFormMesh(form, { segments: 56, subdivisions: 6 });

// A 60cm square of cloth, held flat above the shoulders until you drop it.
const CLOTH_COLS = 24;
const CLOTH_ROWS = 24;
// Held clear above the crown of the head. Pinned particles skip collision, so a
// hold position that intersected the neck would start the drop with cloth already
// buried inside her — which the collider cannot recover from cleanly, because a
// particle at the centre of a limb has no "out" direction.
const clothOrigin: [number, number, number] = [0, form.bounds.max[1] + 2, 0];
const cloth: GridCloth = createGridCloth({
  cols: CLOTH_COLS,
  rows: CLOTH_ROWS,
  spacing: 1,
  orientation: 'flat',
  origin: clothOrigin,
  pinTopRow: false,
  seedWave: 0,
});
const solver = createSolver({ cloth, fabric: FABRICS.cotton, collider });
const P = solver.particles;

let dropped = false;
function holdCloth() {
  // Before the drop, every particle is pinned — she wears nothing yet.
  for (let i = 0; i < P.count; i++) P.pinned[i] = 1;
}
function releaseCloth() {
  for (let i = 0; i < P.count; i++) P.pinned[i] = 0;
  dropped = true;
}
holdCloth();

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const cv = document.getElementById('c') as HTMLCanvasElement;
const gl = cv.getContext('webgl', { antialias: true });
if (!gl) throw new Error('WebGL unavailable');

const CAMZ = 60;
let W = 0, H = 0, DPR = 1, FOCAL = 0, CX = 0, CY = 0;

const VSH = `
attribute vec3 aPos;
attribute vec3 aNor;
uniform float uF, uCamZ, uCX, uCY, uW, uH, uRotY, uYOff;
varying vec3 vN;
void main() {
  float s = sin(uRotY), c = cos(uRotY);
  vec3 p = vec3(aPos.x * c + aPos.z * s, aPos.y - uYOff, -aPos.x * s + aPos.z * c);
  vec3 n = vec3(aNor.x * c + aNor.z * s, aNor.y, -aNor.x * s + aNor.z * c);
  float zc = uCamZ + p.z;
  float xs = uCX + p.x * uF / zc;
  float ys = uCY - p.y * uF / zc;
  gl_Position = vec4(xs / uW * 2.0 - 1.0, 1.0 - ys / uH * 2.0, (zc - 20.0) / 100.0, 1.0);
  vN = n;
}`;

const FSH = `
precision mediump float;
uniform vec3 uColor;
uniform float uSheen;
varying vec3 vN;
void main() {
  vec3 L = normalize(vec3(-0.35, 0.42, 0.84));
  vec3 n = normalize(vN);
  if (n.z < 0.0) n = -n;
  float diff = max(0.12, dot(n, L));
  float spec = pow(diff, 24.0) * uSheen;
  // A cool rim off the back keeps the form readable against a dark stage.
  float rim = pow(1.0 - abs(n.z), 3.0) * 0.25;
  gl_FragColor = vec4(uColor * (0.28 + diff * 0.85) + vec3(spec) + vec3(0.16, 0.17, 0.22) * rim, 1.0);
}`;

function shader(type: number, src: string): WebGLShader {
  const s = gl!.createShader(type)!;
  gl!.shaderSource(s, src);
  gl!.compileShader(s);
  if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl!.getShaderInfoLog(s)}`);
  }
  return s;
}

const prog = gl.createProgram()!;
gl.attachShader(prog, shader(gl.VERTEX_SHADER, VSH));
gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FSH));
gl.linkProgram(prog);
gl.useProgram(prog);

const U: Record<string, WebGLUniformLocation | null> = {};
for (const n of ['uF', 'uCamZ', 'uCX', 'uCY', 'uW', 'uH', 'uRotY', 'uYOff', 'uColor', 'uSheen']) {
  U[n] = gl.getUniformLocation(prog, n);
}
const A = {
  pos: gl.getAttribLocation(prog, 'aPos'),
  nor: gl.getAttribLocation(prog, 'aNor'),
};

function staticBuffer(data: Float32Array): WebGLBuffer {
  const b = gl!.createBuffer()!;
  gl!.bindBuffer(gl!.ARRAY_BUFFER, b);
  gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
  return b;
}
function indexBuffer(data: Uint16Array): WebGLBuffer {
  const b = gl!.createBuffer()!;
  gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, b);
  gl!.bufferData(gl!.ELEMENT_ARRAY_BUFFER, data, gl!.STATIC_DRAW);
  return b;
}

const formPos = staticBuffer(formMesh.positions);
const formNor = staticBuffer(formMesh.normals);
const formIdx = indexBuffer(formMesh.indices);

const clothIndices = buildGridIndices(cloth);
const clothIdx = indexBuffer(clothIndices);
const clothPosArr = new Float32Array(P.count * 3);
const clothNorArr = new Float32Array(P.count * 3);
const clothPos = gl.createBuffer()!;
const clothNor = gl.createBuffer()!;

// Ring outlines, so the measured levels are visible while the numbers are guesses.
const ringLines = (() => {
  const segs = 64;
  const verts: number[] = [];
  for (const r of form.rings) {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const b = ((i + 1) / segs) * Math.PI * 2;
      verts.push(Math.cos(a) * r.rx, r.y, Math.sin(a) * r.rz);
      verts.push(Math.cos(b) * r.rx, r.y, Math.sin(b) * r.rz);
    }
  }
  const arr = new Float32Array(verts);
  return { buffer: staticBuffer(arr), count: arr.length / 3, normals: staticBuffer(new Float32Array(arr.length)) };
})();

const yCentre = (form.bounds.min[1] + form.bounds.max[1]) / 2;

function resize() {
  const stage = document.getElementById('stage') as HTMLElement;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = stage.clientWidth; H = stage.clientHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  gl!.viewport(0, 0, cv.width, cv.height);
  const worldH = form.bounds.max[1] - form.bounds.min[1];
  FOCAL = (H * 0.92) * CAMZ / worldH;
  CX = W / 2; CY = H / 2;
  gl!.uniform1f(U.uF, FOCAL); gl!.uniform1f(U.uCamZ, CAMZ);
  gl!.uniform1f(U.uCX, CX); gl!.uniform1f(U.uCY, CY);
  gl!.uniform1f(U.uW, W); gl!.uniform1f(U.uH, H);
  gl!.uniform1f(U.uYOff, yCentre);
}
window.addEventListener('resize', resize);
resize();

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.086, 0.082, 0.102, 1.0);

let rotY = 0;
let spin = 0;
let showRings = false;

function draw(
  posBuf: WebGLBuffer,
  norBuf: WebGLBuffer,
  idxBuf: WebGLBuffer | null,
  count: number,
  colour: [number, number, number],
  sheen: number,
  mode: number,
) {
  gl!.uniform3f(U.uColor, colour[0], colour[1], colour[2]);
  gl!.uniform1f(U.uSheen, sheen);
  gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuf);
  gl!.enableVertexAttribArray(A.pos);
  gl!.vertexAttribPointer(A.pos, 3, gl!.FLOAT, false, 0, 0);
  gl!.bindBuffer(gl!.ARRAY_BUFFER, norBuf);
  gl!.enableVertexAttribArray(A.nor);
  gl!.vertexAttribPointer(A.nor, 3, gl!.FLOAT, false, 0, 0);
  if (idxBuf) {
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl!.drawElements(mode, count, gl!.UNSIGNED_SHORT, 0);
  } else {
    gl!.drawArrays(mode, 0, count);
  }
}

function render() {
  gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
  gl!.uniform1f(U.uRotY, rotY);

  draw(formPos, formNor, formIdx, formMesh.indices.length, [0.55, 0.52, 0.50], 0.10, gl!.TRIANGLES);

  if (showRings) {
    draw(ringLines.buffer, ringLines.normals, null, ringLines.count, [0.70, 0.16, 0.18], 0, gl!.LINES);
  }

  for (let i = 0; i < P.count; i++) {
    clothPosArr[i * 3] = P.px[i];
    clothPosArr[i * 3 + 1] = P.py[i];
    clothPosArr[i * 3 + 2] = P.pz[i];
  }
  computeGridNormals(cloth, clothNorArr);
  gl!.bindBuffer(gl!.ARRAY_BUFFER, clothPos);
  gl!.bufferData(gl!.ARRAY_BUFFER, clothPosArr, gl!.DYNAMIC_DRAW);
  gl!.bindBuffer(gl!.ARRAY_BUFFER, clothNor);
  gl!.bufferData(gl!.ARRAY_BUFFER, clothNorArr, gl!.DYNAMIC_DRAW);
  draw(
    clothPos, clothNor, clothIdx, clothIndices.length,
    [0.70, 0.16, 0.18], solver.fabric.sheen, gl!.TRIANGLES,
  );
}

// ---------------------------------------------------------------------------
// Turntable
// ---------------------------------------------------------------------------

let dragging = false;
let lastX = 0;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  dragging = true;
  lastX = e.offsetX;
  spin = 0;
  cv.classList.add('grabbing');
});
cv.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.offsetX - lastX;
  lastX = e.offsetX;
  rotY += dx * 0.01;
  // Clamp before it becomes inertia: one big pointer jump would otherwise seed a
  // spin that decays over hundreds of frames and sends her whirling.
  spin = Math.max(-0.08, Math.min(0.08, dx * 0.01));
});
function endDrag() {
  dragging = false;
  cv.classList.remove('grabbing');
}
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);

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
    setFabric(solver, f);
    for (const el of Array.from(fabWrap.children)) el.classList.remove('on');
    b.classList.add('on');
  };
  fabWrap.appendChild(b);
}

const dropBtn = document.getElementById('dropBtn') as HTMLButtonElement;
dropBtn.onclick = () => {
  if (dropped) return;
  releaseCloth();
  dropBtn.textContent = 'falling…';
};

const wireBtn = document.getElementById('wireBtn') as HTMLButtonElement;
wireBtn.onclick = () => {
  showRings = !showRings;
  wireBtn.classList.toggle('on', showRings);
};

(document.getElementById('resetBtn') as HTMLButtonElement).onclick = () => {
  resetGridCloth(cloth);
  holdCloth();
  dropped = false;
  dropBtn.textContent = 'drop cloth';
};

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const readout = document.getElementById('readout') as HTMLElement;
let frames = 0;
let simMs = 0;
let last = performance.now();

function frame() {
  if (!dragging) {
    rotY += spin;
    spin *= 0.94; // turntable inertia
  }
  const t0 = performance.now();
  stepFrame(solver);
  simMs += performance.now() - t0;
  render();

  if (++frames >= 30) {
    const now = performance.now();
    readout.innerHTML =
      `<b>${(frames * 1000 / (now - last)).toFixed(0)}</b> fps · sim <b>${(simMs / frames).toFixed(2)}</b> ms<br>` +
      `sdf <b>${grid.dims.join('×')}</b> · ${(gridBytes(grid) / 1024 / 1024).toFixed(2)} MB · baked in ${bakeMs.toFixed(0)} ms<br>` +
      `figure <b>${MEASUREMENTS.height}</b> cm at <b>${MEASUREMENTS.worldScale}</b> cm/unit<br>` +
      `penetration <b>${maxPenetration(P, grid, MARGIN).toFixed(3)}</b> of ${grid.cell.toFixed(2)} voxel`;
    frames = 0; simMs = 0; last = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
