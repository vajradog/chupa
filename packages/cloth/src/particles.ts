/**
 * Particle storage — structure-of-arrays, typed arrays only.
 *
 * Verlet integration keeps two position sets: current (p*) and previous (o*).
 * Velocity is implicit: v = p - o. `pinned` is a hard kinematic flag; pinned
 * particles are never integrated and are treated as infinite mass by the
 * constraint projector.
 *
 * Layout matches the phase-one reference demo exactly so this ports line-for-line
 * to Rust/WASM or a WebGPU compute buffer later.
 */

export interface Particles {
  /** Number of particles. */
  readonly count: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  /** Previous positions (Verlet). */
  readonly ox: Float32Array;
  readonly oy: Float32Array;
  readonly oz: Float32Array;
  /** 1 = kinematic (never moves, infinite mass). */
  readonly pinned: Uint8Array;
}

export function createParticles(count: number): Particles {
  return {
    count,
    px: new Float32Array(count),
    py: new Float32Array(count),
    pz: new Float32Array(count),
    ox: new Float32Array(count),
    oy: new Float32Array(count),
    oz: new Float32Array(count),
    pinned: new Uint8Array(count),
  };
}

/** Place a particle and zero its implicit velocity. */
export function setParticle(p: Particles, i: number, x: number, y: number, z: number): void {
  p.px[i] = x;
  p.py[i] = y;
  p.pz[i] = z;
  p.ox[i] = x;
  p.oy[i] = y;
  p.oz[i] = z;
}

/** Zero the implicit velocity of every particle, leaving positions untouched. */
export function freeze(p: Particles): void {
  p.ox.set(p.px);
  p.oy.set(p.py);
  p.oz.set(p.pz);
}

/**
 * Total squared implicit velocity — a cheap proxy for kinetic energy (all
 * particles share unit mass; fabric density scales forces, not inertia, exactly
 * as in the reference solver). Used by tests and by settle detection.
 */
export function kineticEnergy(p: Particles): number {
  let sum = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.pinned[i]) continue;
    const vx = p.px[i] - p.ox[i];
    const vy = p.py[i] - p.oy[i];
    const vz = p.pz[i] - p.oz[i];
    sum += vx * vx + vy * vy + vz * vz;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Grid cloth — a rectangular lattice of particles. Sim mesh = render mesh.
// ---------------------------------------------------------------------------

export interface GridClothOptions {
  cols: number;
  rows: number;
  /** Rest distance between orthogonal neighbours (world units). */
  spacing?: number;
  /**
   * 'hanging' (default) lays the sheet in the XY plane running downward from the
   * origin — a panel on a rail. 'flat' lays it in the XZ plane at y = 0, which is
   * what you want to drop onto something.
   */
  orientation?: 'hanging' | 'flat';
  /** Translate the whole sheet after layout. */
  origin?: readonly [number, number, number];
  /**
   * Wrap the last column round to the first, making the sheet a tube. The skirt
   * of a chupa is a closed loop of cloth; without this it would have an invisible
   * split seam that flaps open.
   */
  closed?: boolean;
  /** Pin the whole top row (r === 0). Default true. */
  pinTopRow?: boolean;
  /**
   * Amplitude of the seed z-ripple across columns. Breaks the perfectly flat
   * initial state so the sheet buckles instead of hanging like a plank.
   * Reference value: 0.08.
   */
  seedWave?: number;
}

export interface GridCloth {
  readonly cols: number;
  readonly rows: number;
  readonly spacing: number;
  readonly particles: Particles;
  readonly options: Required<GridClothOptions>;
  /**
   * The authored rest shape: xyz per particle, or null for a plain uniform grid.
   * See `captureRestShape` — this is what makes a cut garment possible.
   */
  rest: Float32Array | null;
  /** Rest-length multiplier applied on top of the rest shape. See `captureRestShape`. */
  restSlack: number;
}

/** Particle index for a grid coordinate. */
export function gridIndex(cloth: GridCloth, c: number, r: number): number {
  return r * cloth.cols + c;
}

export function createGridCloth(options: GridClothOptions): GridCloth {
  const resolved: Required<GridClothOptions> = {
    cols: options.cols,
    rows: options.rows,
    spacing: options.spacing ?? 1,
    orientation: options.orientation ?? 'hanging',
    origin: options.origin ?? [0, 0, 0],
    closed: options.closed ?? false,
    pinTopRow: options.pinTopRow ?? true,
    seedWave: options.seedWave ?? 0.08,
  };
  const cloth: GridCloth = {
    cols: resolved.cols,
    rows: resolved.rows,
    spacing: resolved.spacing,
    particles: createParticles(resolved.cols * resolved.rows),
    options: resolved,
    rest: null,
    restSlack: 1,
  };
  resetGridCloth(cloth);
  return cloth;
}

/**
 * Freeze the cloth's current positions as its rest shape — the pose it carries
 * no energy in, and the pose `resetGridCloth` returns it to.
 *
 * Without this a cloth's rest lengths all come from the uniform `spacing`, so
 * the only shape it can hold for free is a flat sheet or a straight cylinder.
 * A garment is *cut*: the chupa's skirt is a cone, wider at the hem than at the
 * waist, and it holds that flare with no fabric surplus at all. Authoring the
 * cone and calling this makes the cone the zero-energy state, which is exactly
 * what a pattern piece is.
 *
 * `slack` multiplies every rest length on top of that. 1 is a smooth garment
 * cut to fit; above 1 the cloth carries surplus over the shape it is tied to,
 * and gravity pleats it. That is the gather, and it is a separate knob from the
 * cut — a chupa can be flared and smooth, or straight and gathered, or both.
 */
export function captureRestShape(cloth: GridCloth, slack = 1): void {
  const p = cloth.particles;
  const rest = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    rest[i * 3] = p.px[i];
    rest[i * 3 + 1] = p.py[i];
    rest[i * 3 + 2] = p.pz[i];
  }
  cloth.rest = rest;
  cloth.restSlack = slack;
}

/**
 * Return the cloth to its start state: the captured rest shape if it has one,
 * otherwise the flat hanging grid it was created as. Deterministic either way.
 */
export function resetGridCloth(cloth: GridCloth): void {
  const { cols, rows, spacing } = cloth;
  if (cloth.rest) {
    const p = cloth.particles;
    for (let i = 0; i < p.count; i++) {
      setParticle(p, i, cloth.rest[i * 3], cloth.rest[i * 3 + 1], cloth.rest[i * 3 + 2]);
    }
    return;
  }
  const { pinTopRow, seedWave, orientation, origin } = cloth.options;
  const p = cloth.particles;
  const flat = orientation === 'flat';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const across = (c - (cols - 1) / 2) * spacing;
      const along = flat ? (r - (rows - 1) / 2) * spacing : -r * spacing;
      const wave = Math.sin(c * 0.5) * seedWave;
      setParticle(
        p,
        i,
        origin[0] + across,
        origin[1] + (flat ? wave : along),
        origin[2] + (flat ? along : wave),
      );
      p.pinned[i] = pinTopRow && r === 0 ? 1 : 0;
    }
  }
}

/** Flat triangle index buffer, two triangles per quad. Render-side helper. */
export function buildGridIndices(cloth: GridCloth): Uint16Array {
  const { cols, rows } = cloth;
  const closed = cloth.options.closed;
  const quadCols = closed ? cols : cols - 1;
  const out = new Uint16Array(quadCols * (rows - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < quadCols; c++) {
      const c2 = (c + 1) % cols;
      const a = r * cols + c;
      const b = r * cols + c2;
      const d = (r + 1) * cols + c;
      const e = (r + 1) * cols + c2;
      out[k++] = a; out[k++] = b; out[k++] = e;
      out[k++] = a; out[k++] = e; out[k++] = d;
    }
  }
  return out;
}

/**
 * Per-vertex normals by central differences across the grid, written into a
 * caller-owned Float32Array of length count*3. Smooth normals are required —
 * visible faceting was the reviewed complaint against flat shading.
 */
export function computeGridNormals(cloth: GridCloth, out: Float32Array): void {
  const { cols, rows } = cloth;
  const closed = cloth.options.closed;
  const { px, py, pz } = cloth.particles;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      // On a tube the neighbours wrap, or the seam column would shade as a crease.
      const iR = r * cols + (closed ? (c + 1) % cols : Math.min(c + 1, cols - 1));
      const iL = r * cols + (closed ? (c - 1 + cols) % cols : Math.max(c - 1, 0));
      const iD = Math.min(r + 1, rows - 1) * cols + c;
      const iU = Math.max(r - 1, 0) * cols + c;
      const tx1 = px[iR] - px[iL], ty1 = py[iR] - py[iL], tz1 = pz[iR] - pz[iL];
      const tx2 = px[iD] - px[iU], ty2 = py[iD] - py[iU], tz2 = pz[iD] - pz[iU];
      const nx = ty1 * tz2 - tz1 * ty2;
      const ny = tz1 * tx2 - tx1 * tz2;
      const nz = tx1 * ty2 - ty1 * tx2;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6;
      out[i * 3] = nx / nl;
      out[i * 3 + 1] = ny / nl;
      out[i * 3 + 2] = nz / nl;
    }
  }
}
