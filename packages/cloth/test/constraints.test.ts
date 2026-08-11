/**
 * Phase 1 acceptance criterion (b): "no structural constraint ever exceeds 1%
 * overstretch after projection."
 *
 * FINDING — the criterion is not met by the approved reference solver, and
 * cannot be without changing the tuned feel. Measured on the reference 40x52
 * top-pinned panel at the approved settings (7 iterations, 2 substeps):
 *
 *     fabric   peak overstretch   steady state
 *     silk     29.9%              17.7%
 *     cotton   21.6%              14.3%
 *     khadi    16.4%              11.4%
 *     wool     12.0%               9.0%
 *
 * This is ordinary PBD extensibility: 7 Gauss-Seidel sweeps cannot propagate a
 * 52-row load to the pinned row, so the sheet hangs slightly rubbery — and that
 * rubberiness is part of what was approved. It is worst at the top and decays
 * downward (row 50 is under 1% for every fabric).
 *
 * So this file tests two things instead of one:
 *   1. a regression guard that locks the reference solver's measured envelope;
 *   2. `limitStrain`, the opt-in Provot-style limiter, which DOES enforce 1%
 *      on short panels — the geometry Phase 4 actually simulates, since the
 *      belted bodice is pinned and only the skirt below it hangs free.
 * See the Phase 1 notes in packages/cloth/README.md for the options.
 */

import { describe, expect, it } from 'vitest';
import {
  FABRICS,
  FABRIC_KEYS,
  REFERENCE_GRID,
  buildGridConstraints,
  constraintCount,
  createGridCloth,
  createSolver,
  limitStrain,
  maxOverstretch,
  step,
} from '@chupa/cloth';

/** Measured worst transient on the reference panel is 29.9% (silk). */
const REFERENCE_ENVELOPE = 0.32;
/** Measured worst steady state is 17.7% (silk), sampled after the drop. */
const REFERENCE_STEADY_ENVELOPE = 0.20;

describe('grid constraint construction', () => {
  it('builds structural, shear and bending links with correct rest lengths', () => {
    const set = buildGridConstraints(3, 3, 1);
    // 3x3: 12 orthogonal (2 per row x3, 2 per col x3) + 8 diagonal (2 per quad,
    // 4 quads) = 20 structural.
    expect(constraintCount(set.structural)).toBe(20);
    // 2-apart: 3 rows x 1 + 3 cols x 1 = 6 bending.
    expect(constraintCount(set.bending)).toBe(6);
    const rests = [...new Set<number>(
      Array.from({ length: set.structural.length / 3 }, (_, i) => set.structural[i * 3 + 2]),
    )].sort((a, b) => a - b);
    expect(rests).toHaveLength(2);
    expect(rests[0]).toBe(1);
    expect(rests[1]).toBeCloseTo(Math.SQRT2, 6); // Float32 storage
    for (let k = 2; k < set.bending.length; k += 3) expect(set.bending[k]).toBe(2);
  });

  it('scales rest lengths with spacing', () => {
    const set = buildGridConstraints(4, 4, 2.5);
    expect(set.structural[2]).toBeCloseTo(2.5, 6);
    expect(set.bending[2]).toBeCloseTo(5, 6);
  });
});

describe('reference solver stretch envelope (regression guard)', () => {
  for (const key of FABRIC_KEYS) {
    it(`${key} stays inside the measured envelope every step`, () => {
      const cloth = createGridCloth({ ...REFERENCE_GRID });
      const solver = createSolver({ cloth, fabric: FABRICS[key] });
      let transient = 0;
      let steady = 0;
      for (let i = 1; i <= 800; i++) {
        step(solver);
        const over = maxOverstretch(solver.particles, solver.constraints.structural);
        if (i <= 300) transient = Math.max(transient, over);
        else steady = Math.max(steady, over);
      }
      expect(transient).toBeLessThan(REFERENCE_ENVELOPE);
      expect(steady).toBeLessThan(REFERENCE_STEADY_ENVELOPE);
    });
  }

  it('stretch is concentrated near the pinned row and decays down the panel', () => {
    const cloth = createGridCloth({ ...REFERENCE_GRID });
    const solver = createSolver({ cloth, fabric: FABRICS.silk });
    for (let i = 0; i < 800; i++) step(solver);
    const { cols } = cloth;
    const { px, py, pz } = solver.particles;
    const rowStretch = (r: number) => {
      let worst = 0;
      for (let c = 0; c + 1 < cols; c++) {
        const a = r * cols + c;
        const b = a + 1;
        const below = (r + 1) * cols + c;
        for (const [i, j] of [[a, b], [a, below]] as const) {
          const dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i];
          worst = Math.max(worst, Math.sqrt(dx * dx + dy * dy + dz * dz) - 1);
        }
      }
      return worst;
    };
    expect(rowStretch(0)).toBeGreaterThan(rowStretch(20));
    expect(rowStretch(20)).toBeGreaterThan(rowStretch(48));
    // The hem carries no load and is effectively inextensible.
    expect(rowStretch(48)).toBeLessThan(0.01);
  });
});

describe('strain limiting (opt-in)', () => {
  /**
   * Criterion (b) as specified, on the geometry it is reachable on: a short
   * top-pinned panel, which is what hangs below a pinned bodice.
   */
  for (const key of FABRIC_KEYS) {
    it(`${key}: a short panel never exceeds 1% overstretch after projection`, () => {
      const cloth = createGridCloth({ cols: 40, rows: 8, spacing: 1 });
      const solver = createSolver({
        cloth,
        fabric: FABRICS[key],
        strainLimit: 0.01,
        strainLimitPasses: 128,
      });
      solver.breeze = 0.5;
      for (let i = 1; i <= 600; i++) {
        step(solver);
        const over = maxOverstretch(solver.particles, solver.constraints.structural);
        // Float32 storage costs a few ulp at the limit; 1e-4 of slack absorbs it.
        expect(over).toBeLessThanOrEqual(0.01 + 1e-4);
      }
    });
  }

  it('reduces stretch monotonically with pass count on the full reference panel', () => {
    const worstFor = (passes: number) => {
      const cloth = createGridCloth({ ...REFERENCE_GRID });
      const solver = createSolver({
        cloth,
        fabric: FABRICS.silk,
        strainLimit: 0.01,
        strainLimitPasses: passes,
      });
      let worst = 0;
      for (let i = 1; i <= 400; i++) {
        step(solver);
        worst = Math.max(worst, maxOverstretch(solver.particles, solver.constraints.structural));
      }
      return worst;
    };
    const p8 = worstFor(8);
    const p32 = worstFor(32);
    const p128 = worstFor(128);
    expect(p32).toBeLessThan(p8);
    expect(p128).toBeLessThan(p32);
    // Documented cost of the criterion on a 52-row panel: even 128 passes per
    // substep only reaches ~3%. Reaching 1% here is not a 60fps proposition.
    expect(p128).toBeGreaterThan(0.01);
  });

  it('is off by default — the approved feel is untouched', () => {
    const cloth = createGridCloth({ ...REFERENCE_GRID });
    const solver = createSolver({ cloth, fabric: FABRICS.silk });
    expect(solver.strainLimit).toBeNull();
    for (let i = 0; i < 100; i++) step(solver);
    expect(solver.lastStrainPasses).toBe(0);
  });

  it('leaves an already-slack configuration completely alone', () => {
    const cloth = createGridCloth({ cols: 6, rows: 6, spacing: 1, seedWave: 0 });
    const before = Float32Array.from(cloth.particles.px);
    const result = limitStrain(cloth.particles, buildGridConstraints(6, 6, 1).structural, 0.01, 16);
    expect(result.converged).toBe(true);
    expect(result.passes).toBe(1);
    expect(Array.from(cloth.particles.px)).toEqual(Array.from(before));
  });

  it('pulls a single overstretched link back within the limit', () => {
    const cloth = createGridCloth({ cols: 2, rows: 1, spacing: 1, pinTopRow: false, seedWave: 0 });
    const p = cloth.particles;
    p.px[1] = 3; // 200% overstretched
    p.ox[1] = 3;
    const list = buildGridConstraints(2, 1, 1).structural;
    const result = limitStrain(p, list, 0.01, 16);
    expect(result.converged).toBe(true);
    expect(maxOverstretch(p, list)).toBeLessThanOrEqual(0.01 + 1e-6);
    // Correction splits evenly between two free particles: the midpoint of the
    // link (they start at -0.5 and 3) does not move.
    expect(p.px[0] + p.px[1]).toBeCloseTo(2.5, 5);
  });

  it('gives a pinned link its partner the whole correction', () => {
    const cloth = createGridCloth({ cols: 2, rows: 1, spacing: 1, pinTopRow: false, seedWave: 0 });
    const p = cloth.particles;
    p.pinned[0] = 1;
    p.px[1] = 3;
    p.ox[1] = 3;
    const list = buildGridConstraints(2, 1, 1).structural;
    limitStrain(p, list, 0.01, 16);
    expect(p.px[0]).toBe(-0.5);
    // Clamped to the internal target of 0.9% rather than the full 1%.
    expect(p.px[1]).toBeCloseTo(0.509, 5);
  });
});
