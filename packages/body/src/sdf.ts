/**
 * SDF bake: sample the analytic form onto a voxel grid once, then answer every
 * collision query with a trilinear fetch.
 *
 * The figure never moves, so this is paid once at load. Sampling the analytic
 * form per particle per substep would mean walking the ring polyline and three
 * round cones ~30,000 times a frame; a grid fetch is a handful of multiplies.
 */

export interface SdfGrid {
  readonly dims: readonly [number, number, number];
  readonly min: readonly [number, number, number];
  /** Voxel edge length, world units. Uniform in all three axes. */
  readonly cell: number;
  readonly data: Float32Array;
}

export interface BakeOptions {
  /** Target voxel edge, world units. Smaller = sharper, cubically more memory. */
  cell?: number;
  /** Hard cap per axis, so a bad cell size cannot blow up memory. */
  maxDim?: number;
}

export function bakeSdf(
  sdf: (x: number, y: number, z: number) => number,
  bounds: { min: readonly [number, number, number]; max: readonly [number, number, number] },
  options: BakeOptions = {},
): SdfGrid {
  const maxDim = options.maxDim ?? 160;
  const cell = options.cell ?? 0.5;
  const dims = [0, 1, 2].map((axis) => {
    const span = bounds.max[axis] - bounds.min[axis];
    return Math.min(maxDim, Math.max(2, Math.ceil(span / cell) + 1));
  }) as [number, number, number];

  const data = new Float32Array(dims[0] * dims[1] * dims[2]);
  let w = 0;
  for (let k = 0; k < dims[2]; k++) {
    const z = bounds.min[2] + k * cell;
    for (let j = 0; j < dims[1]; j++) {
      const y = bounds.min[1] + j * cell;
      for (let i = 0; i < dims[0]; i++) {
        data[w++] = sdf(bounds.min[0] + i * cell, y, z);
      }
    }
  }
  return { dims, min: bounds.min, cell, data };
}

/**
 * Trilinear sample. Outside the grid this returns the distance to the grid box
 * plus the largest baked distance — a safe overestimate, so a particle that has
 * left the neighbourhood of the body simply never collides.
 */
export function sampleSdf(grid: SdfGrid, x: number, y: number, z: number): number {
  const { dims, min, cell, data } = grid;
  const fx = (x - min[0]) / cell;
  const fy = (y - min[1]) / cell;
  const fz = (z - min[2]) / cell;

  if (
    fx < 0 || fy < 0 || fz < 0 ||
    fx > dims[0] - 1 || fy > dims[1] - 1 || fz > dims[2] - 1
  ) {
    const dx = Math.max(0, Math.max(-fx, fx - (dims[0] - 1))) * cell;
    const dy = Math.max(0, Math.max(-fy, fy - (dims[1] - 1))) * cell;
    const dz = Math.max(0, Math.max(-fz, fz - (dims[2] - 1))) * cell;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) + cell;
  }

  const i0 = Math.min(dims[0] - 2, Math.floor(fx));
  const j0 = Math.min(dims[1] - 2, Math.floor(fy));
  const k0 = Math.min(dims[2] - 2, Math.floor(fz));
  const tx = fx - i0, ty = fy - j0, tz = fz - k0;

  const sx = dims[0];
  const sxy = dims[0] * dims[1];
  const base = i0 + j0 * sx + k0 * sxy;

  const c000 = data[base];
  const c100 = data[base + 1];
  const c010 = data[base + sx];
  const c110 = data[base + sx + 1];
  const c001 = data[base + sxy];
  const c101 = data[base + sxy + 1];
  const c011 = data[base + sxy + sx];
  const c111 = data[base + sxy + sx + 1];

  const c00 = c000 + (c100 - c000) * tx;
  const c10 = c010 + (c110 - c010) * tx;
  const c01 = c001 + (c101 - c001) * tx;
  const c11 = c011 + (c111 - c011) * tx;
  const c0 = c00 + (c10 - c00) * ty;
  const c1 = c01 + (c11 - c01) * ty;
  return c0 + (c1 - c0) * tz;
}

/**
 * Normalized surface direction by central differences, written into `out`.
 * Returns false when the gradient is degenerate (deep inside a flat region), in
 * which case the caller should leave the particle alone rather than push it in a
 * made-up direction.
 */
export function gradientSdf(
  grid: SdfGrid,
  x: number, y: number, z: number,
  out: [number, number, number],
): boolean {
  const h = grid.cell;
  const gx = sampleSdf(grid, x + h, y, z) - sampleSdf(grid, x - h, y, z);
  const gy = sampleSdf(grid, x, y + h, z) - sampleSdf(grid, x, y - h, z);
  const gz = sampleSdf(grid, x, y, z + h) - sampleSdf(grid, x, y, z - h);
  const len = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (len < 1e-9) return false;
  out[0] = gx / len;
  out[1] = gy / len;
  out[2] = gz / len;
  return true;
}

/** Bytes held by the grid — worth watching on a mid-range phone budget. */
export function gridBytes(grid: SdfGrid): number {
  return grid.data.byteLength;
}
