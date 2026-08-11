/**
 * The solver: Verlet integration + PBD constraint projection.
 *
 * Ported from `reference/pangden-physics-proof.html` — the approved phase-one
 * proof — with the same integration order, the same wind field, and the same
 * grab response, so the feel that was signed off does not drift.
 *
 * Deterministic: given the same initial state and the same sequence of
 * (breeze, grab, fabric) inputs, every step reproduces bit-for-bit. No RNG,
 * no wall clock — the wind clock advances by a fixed timestep.
 *
 * Renderer-agnostic and dependency-free. State is a plain object of typed
 * arrays; the hot loops are free functions over it.
 */

import type { ConstraintSet } from './constraints.js';
import {
  buildGridConstraints,
  limitStrain,
  projectConstraints,
  restFromShape,
} from './constraints.js';
import type { Fabric, SolverConfig } from './fabric.js';
import { SOLVER_CONFIG } from './fabric.js';
import type { GridCloth, Particles } from './particles.js';
import { freeze, kineticEnergy, resetGridCloth } from './particles.js';

export interface Solver {
  readonly cloth: GridCloth;
  readonly particles: Particles;
  readonly constraints: ConstraintSet;
  /** Active fabric. Assign through `setFabric` so the change reads as an event. */
  fabric: Fabric;
  readonly config: SolverConfig;
  /** Breeze strength, 0..1. */
  breeze: number;
  /** Wind clock, seconds. Advanced by config.timestep per substep. */
  time: number;
  /** Index of the grabbed particle, or -1. */
  grabbed: number;
  /** Grab target in world space. */
  grabX: number;
  grabY: number;
  /**
   * Max fractional overstretch allowed on structural links after projection,
   * or null (default) for plain PBD at the approved reference feel.
   */
  strainLimit: number | null;
  /** Cap on strain-limiting passes per substep. */
  strainLimitPasses: number;
  /** Passes used by the last substep's strain limiting. Diagnostic. */
  lastStrainPasses: number;
  /**
   * Optional collision resolver, run last in the substep. Kept as a callback so
   * this package stays dependency-free — @chupa/body supplies the SDF one.
   */
  collider: ((p: Particles) => void) | null;
}

export interface SolverOptions {
  cloth: GridCloth;
  fabric: Fabric;
  config?: Partial<SolverConfig>;
  breeze?: number;
  strainLimit?: number | null;
  strainLimitPasses?: number;
  collider?: ((p: Particles) => void) | null;
}

export function createSolver(options: SolverOptions): Solver {
  const { cloth, fabric } = options;
  const constraints = buildGridConstraints(
    cloth.cols,
    cloth.rows,
    cloth.spacing,
    cloth.options.closed,
  );
  // A cloth that has been cut to a shape relaxes to that shape, not to a square
  // lattice of `spacing`. See captureRestShape.
  if (cloth.rest) restFromShape(constraints, cloth.rest, cloth.restSlack);
  return {
    cloth,
    particles: cloth.particles,
    constraints,
    fabric,
    config: { ...SOLVER_CONFIG, ...options.config },
    breeze: options.breeze ?? 0,
    time: 0,
    grabbed: -1,
    grabX: 0,
    grabY: 0,
    strainLimit: options.strainLimit ?? null,
    strainLimitPasses: options.strainLimitPasses ?? 64,
    lastStrainPasses: 0,
    collider: options.collider ?? null,
  };
}

/**
 * Swap fabric mid-flight. Deliberately does not touch positions or velocities:
 * the drop-and-stiffen you see when silk becomes nambu wool is the solver
 * reacting, which is the whole point of decision 5 in the project brief.
 */
export function setFabric(solver: Solver, fabric: Fabric): void {
  solver.fabric = fabric;
}

/** Return the cloth to its start state and stop the wind clock. */
export function resetSolver(solver: Solver): void {
  resetGridCloth(solver.cloth);
  solver.time = 0;
  solver.grabbed = -1;
}

/** Gust envelope: two slow beats, so the breeze breathes instead of buzzing. */
function gustAt(breeze: number, time: number): number {
  if (breeze <= 0) return 0;
  const amp = Math.pow(breeze, 1.25);
  return amp * (0.55 + 0.45 * Math.sin(time * 0.5) * Math.sin(time * 0.23 + 1.7));
}

/**
 * One substep: integrate, apply the grab, then relax constraints.
 * Call `stepFrame` for a whole 60fps frame.
 */
export function step(solver: Solver): void {
  const { particles: p, fabric, config } = solver;
  const { px, py, pz, ox, oy, oz, pinned, count } = p;

  solver.time += config.timestep;
  const time = solver.time;
  const damp = fabric.damping;
  const invDen = 1 / fabric.density;
  const gust = gustAt(solver.breeze, time);
  const grav = config.gravity;

  for (let i = 0; i < count; i++) {
    if (pinned[i]) continue;
    let ax = 0;
    let az = 0;
    if (gust > 0) {
      // Two octaves per axis: a slow travelling swell plus a faster ripple.
      const wx = Math.sin(time * 1.1 + py[i] * 0.25) * 0.006
               + Math.sin(time * 2.7 + px[i] * 0.4) * 0.003;
      const wz = Math.sin(time * 0.9 + px[i] * 0.3 + py[i] * 0.12) * 0.009
               + Math.sin(time * 2.2 + py[i] * 0.5) * 0.004;
      ax = wx * gust * invDen;
      az = wz * gust * invDen;
    }
    const nx = px[i] + (px[i] - ox[i]) * damp + ax;
    const ny = py[i] + (py[i] - oy[i]) * damp + grav;
    const nz = pz[i] + (pz[i] - oz[i]) * damp + az;
    ox[i] = px[i]; oy[i] = py[i]; oz[i] = pz[i];
    px[i] = nx; py[i] = ny; pz[i] = nz;
  }

  const g = solver.grabbed;
  if (g >= 0) {
    // Heavier cloth resists the pointer; the +0.25 floor keeps nambu wool draggable.
    const k = Math.min(1, 0.55 * invDen + 0.25);
    px[g] += (solver.grabX - px[g]) * k;
    py[g] += (solver.grabY - py[g]) * k;
    pz[g] *= 0.9;
  }

  projectConstraints(
    p,
    solver.constraints,
    config.iterations,
    fabric.bend,
    config.bendConstraintScale,
  );

  if (solver.strainLimit !== null) {
    solver.lastStrainPasses = limitStrain(
      p,
      solver.constraints.structural,
      solver.strainLimit,
      solver.strainLimitPasses,
    ).passes;
  }

  // Collision last: nothing after it may push a particle back into the body.
  if (solver.collider) solver.collider(p);
}

/** One 60fps frame: `config.substeps` substeps. */
export function stepFrame(solver: Solver): void {
  for (let s = 0; s < solver.config.substeps; s++) step(solver);
}

/** Current kinetic-energy proxy — sum of squared implicit velocities. */
export function energy(solver: Solver): number {
  return kineticEnergy(solver.particles);
}

export interface SettleOptions {
  /** Give up after this many substeps. */
  maxSteps: number;
  /**
   * Absolute energy threshold, or omit and pass `relativeThreshold` to key off
   * the peak energy of the drop (which scales with fabric weight).
   */
  threshold?: number;
  /** Threshold as a fraction of the peak energy seen during the run. */
  relativeThreshold?: number;
  /**
   * Do not test the threshold before this many substeps. A cloth released from
   * rest starts at zero energy, so without this every settle "succeeds" on
   * step 1. Defaults to 60 — past the peak of the initial drop for every preset.
   */
  minSteps?: number;
}

export interface SettleResult {
  /** Substeps taken. Equals `maxSteps` if the threshold was never reached. */
  steps: number;
  /** Energy at the moment sampling stopped. */
  energy: number;
  /** Highest energy seen during the run. */
  peakEnergy: number;
  settled: boolean;
}

/**
 * Run until the kinetic-energy proxy drops below the threshold, or `maxSteps`
 * substeps elapse. Used by tests, and by the future rest-state bake — the
 * settled state per fabric is exactly what Phase 4 wants to cache.
 *
 * Note that silk never goes fully still at the approved damping of 0.9930; it
 * keeps a low shimmer forever, which is the point of silk. Prefer
 * `relativeThreshold` over an absolute one so the criterion means the same
 * thing across a 6x range of fabric weight.
 */
export function settle(solver: Solver, options: SettleOptions): SettleResult {
  const { maxSteps, threshold, relativeThreshold } = options;
  const minSteps = options.minSteps ?? 60;
  if (threshold === undefined && relativeThreshold === undefined) {
    throw new Error('settle: pass threshold or relativeThreshold');
  }
  let peak = 0;
  let e = kineticEnergy(solver.particles);
  for (let s = 1; s <= maxSteps; s++) {
    step(solver);
    e = kineticEnergy(solver.particles);
    if (e > peak) peak = e;
    if (s < minSteps) continue;
    const limit = relativeThreshold !== undefined ? peak * relativeThreshold : threshold!;
    if (e < limit) return { steps: s, energy: e, peakEnergy: peak, settled: true };
  }
  return { steps: maxSteps, energy: e, peakEnergy: peak, settled: false };
}

/** Stop the cloth dead where it stands (zero implicit velocity). */
export function stillCloth(solver: Solver): void {
  freeze(solver.particles);
}
