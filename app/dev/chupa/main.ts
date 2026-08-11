/**
 * Phase 3 dev page — the chupa itself.
 *
 * This is the product in miniature: a fixed garment shape on a static figure,
 * where the only things a user touches are colour and cloth. The bodice, straps
 * and honju sleeves are pinned geometry; the skirt and the pangden are live
 * cloth sharing one solver step.
 */

import { bakeSdf, buildForm, buildFormMesh, createSdfCollider } from '@chupa/body';
import {
  FABRICS,
  FABRIC_KEYS,
  buildGridIndices,
  computeGridNormals,
  createSolver,
  resetGridCloth,
  setFabric,
  stepFrame,
} from '@chupa/cloth';
import type { Fabric, Solver } from '@chupa/cloth';
import {
  PANGDEN_PALETTE,
  buildChupa,
  composeColliders,
  createSkirtCollider,
  expandStripeProgram,
} from '@chupa/garment';
import type { Piece } from '@chupa/garment';

// ---------------------------------------------------------------------------
// Figure, garment, solvers
// ---------------------------------------------------------------------------

const form = buildForm();
const grid = bakeSdf(form.sdf, form.bounds, { cell: 0.5 });
const collider = createSdfCollider(grid, { margin: grid.cell * 0.5, friction: 0.6 });
const formMesh = buildFormMesh(form, { segments: 48, subdivisions: 5 });

const chupa = buildChupa(form);

// The pangden rides the skirt: without cloth-vs-cloth collision it would hang
// inside the skirt and never be seen. It is tied on last, so it rides outermost.
const pangdenCollider = composeColliders(collider, createSkirtCollider(chupa, { margin: 1.6 }));

interface Renderable {
  piece: Piece;
  solver: Solver | null;
  positions: Float32Array;
  normals: Float32Array;
  stripeRows: string[] | null;
  posBuf: WebGLBuffer;
  norBuf: WebGLBuffer;
  vBuf: WebGLBuffer;
  uBuf: WebGLBuffer;
  idxBuf: WebGLBuffer;
  indexCount: number;
}

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
attribute float aV;
attribute float aU;
uniform float uF, uCamZ, uCX, uCY, uW, uH, uYOff;
varying vec3 vN;
varying float vV;
varying float vU;
void main() {
  vec3 p = vec3(aPos.x, aPos.y - uYOff, aPos.z);
  vec3 n = aNor;
  float zc = uCamZ + p.z;
  gl_Position = vec4(
    (uCX + p.x * uF / zc) / uW * 2.0 - 1.0,
    1.0 - (uCY - p.y * uF / zc) / uH * 2.0,
    (zc - 20.0) / 100.0, 1.0);
  vN = n;
  vV = aV;
  vU = aU;
}`;

const FSH = `
precision mediump float;
uniform vec3 uColor;
uniform float uSheen, uSat, uUseStripe;
uniform sampler2D uStripe;
varying vec3 vN;
varying float vV;
varying float vU;
void main() {
  vec3 L = normalize(vec3(-0.35, 0.42, 0.84));
  vec3 n = normalize(vN);
  if (n.z < 0.0) n = -n;
  float diff = max(0.12, dot(n, L));
  float spec = pow(diff, 22.0) * uSheen;
  float rim = pow(1.0 - abs(n.z), 3.0) * 0.22;
  vec3 col = mix(uColor, texture2D(uStripe, vec2(vU, vV)).rgb, uUseStripe);
  float grey = (col.r + col.g + col.b) / 3.0;
  col = mix(vec3(grey), col, uSat);
  gl_FragColor = vec4(col * (0.30 + diff * 0.82) + vec3(spec) + vec3(0.15, 0.16, 0.21) * rim, 1.0);
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
for (const n of ['uF','uCamZ','uCX','uCY','uW','uH','uYOff','uColor','uSheen','uSat','uUseStripe','uStripe']) {
  U[n] = gl.getUniformLocation(prog, n);
}
const A = {
  pos: gl.getAttribLocation(prog, 'aPos'),
  nor: gl.getAttribLocation(prog, 'aNor'),
  v: gl.getAttribLocation(prog, 'aV'),
  u: gl.getAttribLocation(prog, 'aU'),
};

function buffer(data: Float32Array, usage: number): WebGLBuffer {
  const b = gl!.createBuffer()!;
  gl!.bindBuffer(gl!.ARRAY_BUFFER, b);
  gl!.bufferData(gl!.ARRAY_BUFFER, data, usage);
  return b;
}
function indexBuffer(data: Uint16Array): WebGLBuffer {
  const b = gl!.createBuffer()!;
  gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, b);
  gl!.bufferData(gl!.ELEMENT_ARRAY_BUFFER, data, gl!.STATIC_DRAW);
  return b;
}

// The pangden's stripe texture: one column per woven strip, one row per particle
// row. Real pangdens are woven as separate narrow strips and seamed, so each
// strip runs its own stripe program and the bands never line up across a seam.
const pangdenPiece = chupa.pieces.find((p) => p.name === 'pangden');
const stripeRows = pangdenPiece ? pangdenPiece.cloth.rows : 1;
const stripeStrips = chupa.spec.pangden.strips;
(function makeStripeTexture() {
  const data = new Uint8Array(stripeStrips * stripeRows * 4);
  for (let strip = 0; strip < stripeStrips; strip++) {
    // Offset each strip's program so the seams read as separate weaving.
    const letters = expandStripeProgram(
      chupa.spec.pangden.stripeProgram, stripeRows, strip * 7 + 3,
    );
    for (let r = 0; r < stripeRows; r++) {
      const col = PANGDEN_PALETTE[letters[r]] ?? PANGDEN_PALETTE.K;
      const o = (r * stripeStrips + strip) * 4;
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
    }
  }
  const tex = gl!.createTexture();
  gl!.bindTexture(gl!.TEXTURE_2D, tex);
  gl!.texImage2D(
    gl!.TEXTURE_2D, 0, gl!.RGBA, stripeStrips, stripeRows, 0,
    gl!.RGBA, gl!.UNSIGNED_BYTE, data,
  );
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
  gl!.activeTexture(gl!.TEXTURE0);
  gl!.uniform1i(U.uStripe, 0);
})();

const renderables: Renderable[] = chupa.pieces.map((piece) => {
  const { cloth } = piece;
  const count = cloth.particles.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const vArr = new Float32Array(count);
  const uArr = new Float32Array(count);
  for (let r = 0; r < cloth.rows; r++) {
    for (let c = 0; c < cloth.cols; c++) {
      const i = r * cloth.cols + c;
      vArr[i] = (r + 0.5) / cloth.rows;
      const strip = piece.stripOfColumn ? piece.stripOfColumn[c] : 0;
      uArr[i] = (strip + 0.5) / Math.max(1, chupa.spec.pangden.strips);
    }
  }
  const indices = buildGridIndices(cloth);
  return {
    piece,
    solver: piece.live
      ? createSolver({
          cloth,
          fabric: FABRICS.silk,
          collider: piece.name === 'pangden' ? pangdenCollider : collider,
          breeze: 0.25,
        })
      : null,
    positions,
    normals,
    stripeRows: piece.garment === 'pangden' ? [] : null,
    posBuf: buffer(positions, gl!.DYNAMIC_DRAW),
    norBuf: buffer(normals, gl!.DYNAMIC_DRAW),
    vBuf: buffer(vArr, gl!.STATIC_DRAW),
    uBuf: buffer(uArr, gl!.STATIC_DRAW),
    idxBuf: indexBuffer(indices),
    indexCount: indices.length,
  };
});

const formPosBuf = buffer(formMesh.positions, gl.STATIC_DRAW);
const formNorBuf = buffer(formMesh.normals, gl.STATIC_DRAW);
const formVBuf = buffer(new Float32Array(formMesh.positions.length / 3), gl.STATIC_DRAW);
const formIdxBuf = indexBuffer(formMesh.indices);

const yCentre = (form.bounds.min[1] + form.bounds.max[1]) / 2;

function resize() {
  const stage = document.getElementById('stage') as HTMLElement;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = stage.clientWidth; H = stage.clientHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  gl!.viewport(0, 0, cv.width, cv.height);
  FOCAL = (H * 0.94) * CAMZ / (form.bounds.max[1] - form.bounds.min[1]);
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

// ---------------------------------------------------------------------------
// Wardrobe state
// ---------------------------------------------------------------------------

const CHUPA_COLOURS: [string, [number, number, number]][] = [
  ['madder', [0.62, 0.13, 0.15]],
  ['indigo', [0.16, 0.25, 0.48]],
  ['saffron', [0.83, 0.58, 0.12]],
  ['pine', [0.18, 0.36, 0.22]],
  ['plum', [0.44, 0.16, 0.31]],
  ['ink', [0.12, 0.12, 0.14]],
  ['bone', [0.85, 0.82, 0.74]],
];
const HONJU_COLOURS: [string, [number, number, number]][] = [
  ['bone', [0.91, 0.88, 0.80]],
  ['gold', [0.86, 0.70, 0.32]],
  ['rose', [0.85, 0.60, 0.62]],
  ['jade', [0.45, 0.68, 0.58]],
  ['sky', [0.55, 0.70, 0.86]],
];

let chupaColour = CHUPA_COLOURS[0][1];
let honjuColour = HONJU_COLOURS[0][1];
let chupaFabric: Fabric = FABRICS.silk;
let showFigure = false;
// Off. The pangden is a separate garment on top of this one, and its stripe
// palette is placeholder — it buries the chupa we are actually judging.
let showPangden = false;
// Still by default. While the cut is being corrected, the thing to look at is
// the authored shape — you cannot judge a silhouette that is swaying.
let motion = false;

function applyFabric(f: Fabric) {
  chupaFabric = f;
  for (const r of renderables) {
    if (r.solver && r.piece.garment !== 'pangden') setFabric(r.solver, f);
  }
}
applyFabric(FABRICS.silk);

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------


function drawBuffers(
  posBuf: WebGLBuffer, norBuf: WebGLBuffer, vBuf: WebGLBuffer, uBuf: WebGLBuffer,
  idxBuf: WebGLBuffer, count: number,
  colour: readonly [number, number, number], sheen: number, sat: number, stripe: number,
) {
  gl!.uniform3f(U.uColor, colour[0], colour[1], colour[2]);
  gl!.uniform1f(U.uSheen, sheen);
  gl!.uniform1f(U.uSat, sat);
  gl!.uniform1f(U.uUseStripe, stripe);
  for (const [buf, attr, size] of [
    [posBuf, A.pos, 3], [norBuf, A.nor, 3], [vBuf, A.v, 1], [uBuf, A.u, 1],
  ] as const) {
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
    gl!.enableVertexAttribArray(attr);
    gl!.vertexAttribPointer(attr, size, gl!.FLOAT, false, 0, 0);
  }
  gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl!.drawElements(gl!.TRIANGLES, count, gl!.UNSIGNED_SHORT, 0);
}

function render() {
  gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

  if (showFigure) {
    drawBuffers(
      formPosBuf, formNorBuf, formVBuf, formVBuf, formIdxBuf, formMesh.indices.length,
      [0.55, 0.52, 0.50], 0.08, 1, 0,
    );
  }

  for (const r of renderables) {
    if (r.piece.name === 'pangden' && !showPangden) continue;
    const { cloth } = r.piece;
    const P = cloth.particles;
    for (let i = 0; i < P.count; i++) {
      r.positions[i * 3] = P.px[i];
      r.positions[i * 3 + 1] = P.py[i];
      r.positions[i * 3 + 2] = P.pz[i];
    }
    computeGridNormals(cloth, r.normals);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, r.posBuf);
    gl!.bufferData(gl!.ARRAY_BUFFER, r.positions, gl!.DYNAMIC_DRAW);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, r.norBuf);
    gl!.bufferData(gl!.ARRAY_BUFFER, r.normals, gl!.DYNAMIC_DRAW);

    const isPangden = r.piece.garment === 'pangden';
    const colour = r.piece.garment === 'honju' ? honjuColour : chupaColour;
    drawBuffers(
      r.posBuf, r.norBuf, r.vBuf, r.uBuf, r.idxBuf, r.indexCount,
      colour, chupaFabric.sheen, chupaFabric.sat, isPangden ? 1 : 0,
    );
  }
}

// The figure never turns. Product decision: only the front is ever shown, so
// there is no turntable, no inertia, and no back geometry to get right.

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function swatchRow(host: HTMLElement, colours: [string, [number, number, number]][], onPick: (c: [number, number, number]) => void) {
  colours.forEach(([name, rgb], i) => {
    const b = document.createElement('button');
    b.className = `sw${i === 0 ? ' on' : ''}`;
    b.title = name;
    b.style.background = `rgb(${rgb.map((v) => Math.round(v * 255)).join(',')})`;
    b.onclick = () => {
      onPick(rgb);
      for (const el of Array.from(host.children)) el.classList.remove('on');
      b.classList.add('on');
    };
    host.appendChild(b);
  });
}

swatchRow(document.getElementById('chupaColours') as HTMLElement, CHUPA_COLOURS, (c) => { chupaColour = c; });
swatchRow(document.getElementById('honjuColours') as HTMLElement, HONJU_COLOURS, (c) => { honjuColour = c; });

const fabricHost = document.getElementById('chupaFabrics') as HTMLElement;
for (const key of FABRIC_KEYS) {
  const f = FABRICS[key];
  const b = document.createElement('button');
  b.className = `chip${f === chupaFabric ? ' on' : ''}`;
  b.textContent = f.label;
  b.onclick = () => {
    applyFabric(f);
    for (const el of Array.from(fabricHost.children)) el.classList.remove('on');
    b.classList.add('on');
  };
  fabricHost.appendChild(b);
}

const wind = document.getElementById('wind') as HTMLInputElement;
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) wind.value = '0';
function syncWind() {
  const v = Number(wind.value) / 100;
  for (const r of renderables) if (r.solver) r.solver.breeze = v;
}
wind.addEventListener('input', syncWind);
syncWind();

const pangdenBtn = document.getElementById('pangdenBtn') as HTMLButtonElement;
pangdenBtn.onclick = () => {
  showPangden = !showPangden;
  pangdenBtn.classList.toggle('on', showPangden);
};
const motionBtn = document.getElementById('motionBtn') as HTMLButtonElement;
motionBtn.classList.toggle('on', motion);
motionBtn.onclick = () => {
  motion = !motion;
  motionBtn.classList.toggle('on', motion);
  // Coming back to still snaps to the cut rather than leaving it mid-swing.
  if (!motion) for (const r of renderables) if (r.solver) resetGridCloth(r.piece.cloth);
};
const bodyBtn = document.getElementById('bodyBtn') as HTMLButtonElement;
bodyBtn.onclick = () => {
  showFigure = !showFigure;
  bodyBtn.classList.toggle('on', showFigure);
};
(document.getElementById('resetBtn') as HTMLButtonElement).onclick = () => {
  for (const r of renderables) if (r.solver) resetGridCloth(r.piece.cloth);
};

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const readout = document.getElementById('readout') as HTMLElement;
let frames = 0;
let simMs = 0;
let last = performance.now();

function frame() {
  const t0 = performance.now();
  if (motion) for (const r of renderables) if (r.solver) stepFrame(r.solver);
  simMs += performance.now() - t0;
  render();

  if (++frames >= 30) {
    const now = performance.now();
    readout.innerHTML =
      `<b>${(frames * 1000 / (now - last)).toFixed(0)}</b> fps · sim <b>${(simMs / frames).toFixed(2)}</b> ms` +
      `${motion ? '' : ' · <b>still</b>'}<br>` +
      `<b>${chupa.liveParticles}</b> live particles of 15k budget<br>` +
      `${chupa.pieces.filter((p) => p.live).length} live pieces · ` +
      `${chupa.pieces.filter((p) => !p.live).length} pinned`;
    frames = 0; simMs = 0; last = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
