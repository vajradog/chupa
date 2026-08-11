/**
 * Distance constraints, stored as flat triplets [a, b, restLength, ...] in a
 * single Float32Array. Indices survive the round-trip through Float32 exactly
 * for counts well past our 15k-particle budget (2^24), and a flat buffer keeps
 * the projection loop free of object churn.
 *
 * Projection is Position-Based Dynamics: correct positions directly, let Verlet
 * pick the velocity change up implicitly. Ported from the phase-one reference.
 */

import type { Particles } from './particles.js';

export interface ConstraintSet {
  /** Structural + shear: neighbour and diagonal links. Always projected at full stiffness. */
  readonly structural: Float32Array;
  /** Bending: 2-neighbour links across a particle. Projected at fabric bend stiffness. */
  readonly bending: Float32Array;
}

/**
 * Structural (orthogonal), shear (both diagonals of each quad), and bending
 * (2-apart in each direction) constraints for a rectangular grid.
 */
export function buildGridConstraints(
  cols: number,
  rows: number,
  spacing = 1,
  closed = false,
): ConstraintSet {
  const structural: number[] = [];
  const bending: number[] = [];
  const d = spacing;
  const dd = Math.SQRT2 * spacing;
  const d2 = 2 * spacing;
  const idx = (c: number, r: number) => r * cols + c;
  // On a closed tube every column has a right-hand neighbour; on a flat sheet the
  // last one does not.
  const lastCol = closed ? cols : cols - 1;
  const wrap = (c: number) => (closed ? c % cols : c);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(c, r);
      if (c < lastCol) structural.push(i, idx(wrap(c + 1), r), d);
      if (r + 1 < rows) structural.push(i, idx(c, r + 1), d);
      if (c < lastCol && r + 1 < rows) {
        structural.push(i, idx(wrap(c + 1), r + 1), dd);
        structural.push(idx(wrap(c + 1), r), idx(c, r + 1), dd);
      }
      if (closed ? cols > 4 : c + 2 < cols) bending.push(i, idx(wrap(c + 2), r), d2);
      if (r + 2 < rows) bending.push(i, idx(c, r + 2), d2);
    }
  }
  return { structural: new Float32Array(structural), bending: new Float32Array(bending) };
}

/**
 * Rewrite every rest length in a constraint set to the distance the pair sits at
 * in `rest` (xyz per particle), scaled by `slack`.
 *
 * This is what turns a uniform lattice into a cut pattern piece. `spacing` can
 * only describe a square grid; a garment panel is a cone, a gore, a curved band.
 * Author the shape, then call this, and that shape is what the cloth relaxes to.
 */
export function restFromShape(
  set: ConstraintSet,
  rest: Float32Array,
  slack = 1,
): void {
  for (const list of [set.structural, set.bending]) {
    for (let k = 0; k < list.length; k += 3) {
      const a = list[k] * 3;
      const b = list[k + 1] * 3;
      const dx = rest[b] - rest[a];
      const dy = rest[b + 1] - rest[a + 1];
      const dz = rest[b + 2] - rest[a + 2];
      list[k + 2] = Math.sqrt(dx * dx + dy * dy + dz * dz) * slack;
    }
  }
}

/** Constraint count in a flat triplet list. */
export function constraintCount(list: Float32Array): number {
  return list.length / 3;
}

/**
 * Project one distance constraint. `kf` is the stiffness factor; the internal
 * 0.5 splits the correction between the two endpoints, and a pinned endpoint
 * hands its whole share to its partner (the doubled correction below).
 */
export function projectConstraint(
  p: Particles,
  a: number,
  b: number,
  rest: number,
  kf: number,
): void {
  const { px, py, pz, pinned } = p;
  let dx = px[b] - px[a];
  let dy = py[b] - py[a];
  let dz = pz[b] - pz[a];
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  const diff = ((dist - rest) / dist) * 0.5 * kf;
  dx *= diff; dy *= diff; dz *= diff;
  const pa = pinned[a];
  const pb = pinned[b];
  if (!pa && !pb) {
    px[a] += dx; py[a] += dy; pz[a] += dz;
    px[b] -= dx; py[b] -= dy; pz[b] -= dz;
  } else if (pa && !pb) {
    px[b] -= 2 * dx; py[b] -= 2 * dy; pz[b] -= 2 * dz;
  } else if (!pa && pb) {
    px[a] += 2 * dx; py[a] += 2 * dy; pz[a] += 2 * dz;
  }
  // both pinned: nothing to correct.
}

/** Gauss-Seidel sweep over a flat triplet list at uniform stiffness. */
export function projectList(p: Particles, list: Float32Array, kf: number): void {
  for (let k = 0; k < list.length; k += 3) {
    projectConstraint(p, list[k] | 0, list[k + 1] | 0, list[k + 2], kf);
  }
}

/**
 * Full relaxation pass: `iterations` sweeps of structural-then-bending.
 * Bending is skipped entirely below 0.001 stiffness (silk is nearly there, and
 * the skip is a real saving on the bending list, which is the larger of the two).
 */
export function projectConstraints(
  p: Particles,
  set: ConstraintSet,
  iterations: number,
  bendStiffness: number,
  bendScale: number,
): void {
  const bendK = bendStiffness * bendScale;
  const doBend = bendStiffness > 0.001;
  for (let it = 0; it < iterations; it++) {
    projectList(p, set.structural, 1);
    if (doBend) projectList(p, set.bending, bendK);
  }
}

export interface StrainLimitResult {
  /** Passes actually run. */
  passes: number;
  /** True if a full pass completed with no constraint over the limit. */
  converged: boolean;
}

/**
 * Provot-style strain limiting: after PBD projection, clamp any structural link
 * longer than rest*(1 + maxStrain) back onto the limit, sweeping until a pass
 * makes no correction at all (which proves every link is within the limit).
 *
 * This is inequality projection — each constraint is "distance <= L", a convex
 * set — so alternating Gauss-Seidel sweeps converge. Direction alternates per
 * pass because a single-direction sweep propagates slack only one link per pass
 * and a top-pinned sheet is exactly the pathological case for that.
 *
 * OFF by default. Plain PBD at the approved 7 iterations leaves 8-30% stretch in
 * a 52-row hanging sheet, which is what the reference demo was tuned to look
 * like; turning this on makes the cloth inextensible and changes the feel.
 */
/**
 * Links are clamped to this fraction of the requested limit. Projecting exactly
 * onto the limit leaves no room for the neighbour corrections that follow in the
 * same sweep, and the pass settles at a fixed point slightly above the limit;
 * aiming a little inside keeps the guarantee true of the value actually asked for.
 */
const STRAIN_TARGET_FACTOR = 0.9;

/**
 * Relative tolerance on "is this link over the limit". Positions are Float32, so
 * a link projected to exactly the limit reads back a few ulp long; without this
 * every pass finds work to do and convergence could never be detected.
 */
const STRAIN_EPSILON = 1e-6;

export function limitStrain(
  p: Particles,
  list: Float32Array,
  maxStrain: number,
  maxPasses: number,
): StrainLimitResult {
  const { px, py, pz, pinned } = p;
  const scale = 1 + maxStrain * STRAIN_TARGET_FACTOR;
  let forward = true;
  for (let pass = 1; pass <= maxPasses; pass++) {
    let corrected = false;
    const start = forward ? 0 : list.length - 3;
    const end = forward ? list.length : -3;
    const stride = forward ? 3 : -3;
    for (let k = start; k !== end; k += stride) {
      const a = list[k] | 0;
      const b = list[k + 1] | 0;
      const limit = list[k + 2] * scale;
      let dx = px[b] - px[a];
      let dy = py[b] - py[a];
      let dz = pz[b] - pz[a];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= limit * (1 + STRAIN_EPSILON)) continue;
      const pa = pinned[a];
      const pb = pinned[b];
      if (pa && pb) continue;
      corrected = true;
      const diff = ((dist - limit) / dist) * 0.5;
      dx *= diff; dy *= diff; dz *= diff;
      if (!pa && !pb) {
        px[a] += dx; py[a] += dy; pz[a] += dz;
        px[b] -= dx; py[b] -= dy; pz[b] -= dz;
      } else if (pa) {
        px[b] -= 2 * dx; py[b] -= 2 * dy; pz[b] -= 2 * dz;
      } else {
        px[a] += 2 * dx; py[a] += 2 * dy; pz[a] += 2 * dz;
      }
    }
    if (!corrected) return { passes: pass, converged: true };
    forward = !forward;
  }
  return { passes: maxPasses, converged: false };
}

/**
 * Largest fractional overstretch over a constraint list: max((dist - rest)/rest),
 * clamped at 0 (compression is not a stretch violation — cloth buckles freely).
 * Test instrument, not used by the solver.
 */
export function maxOverstretch(p: Particles, list: Float32Array): number {
  const { px, py, pz } = p;
  let worst = 0;
  for (let k = 0; k < list.length; k += 3) {
    const a = list[k] | 0;
    const b = list[k + 1] | 0;
    const rest = list[k + 2];
    const dx = px[b] - px[a];
    const dy = py[b] - py[a];
    const dz = pz[b] - pz[a];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const over = (dist - rest) / rest;
    if (over > worst) worst = over;
  }
  return worst;
}
