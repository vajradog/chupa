/**
 * Phase 1 acceptance criterion (a): a hanging panel settles below an energy
 * threshold within N steps.
 *
 * The threshold is relative to the peak energy of the drop, not absolute.
 * Absolute thresholds are meaningless across these presets: peak energy for the
 * same panel ranges 10.3 (nambu wool) to 29.2 (silk), and silk at the approved
 * damping of 0.9930 never goes fully still — it keeps a permanent low shimmer,
 * which is the whole reason silk reads as silk.
 */

import { describe, expect, it } from 'vitest';
import {
  FABRICS,
  FABRIC_KEYS,
  REFERENCE_GRID,
  createGridCloth,
  createSolver,
  energy,
  setFabric,
  settle,
  step,
} from '@chupa/cloth';

/** Substeps allowed to reach 1% of peak energy. Measured worst case: 116 (silk). */
const SETTLE_BUDGET = 300;
const SETTLE_FRACTION = 0.01;

function referencePanel(fabricKey: string) {
  const cloth = createGridCloth({ ...REFERENCE_GRID });
  return createSolver({ cloth, fabric: FABRICS[fabricKey] });
}

describe('hanging panel settles', () => {
  for (const key of FABRIC_KEYS) {
    it(`${key} falls below ${SETTLE_FRACTION * 100}% of peak energy within ${SETTLE_BUDGET} substeps`, () => {
      const solver = referencePanel(key);
      const result = settle(solver, {
        maxSteps: SETTLE_BUDGET * 4,
        relativeThreshold: SETTLE_FRACTION,
      });
      expect(result.settled).toBe(true);
      expect(result.steps).toBeLessThanOrEqual(SETTLE_BUDGET);
      expect(result.peakEnergy).toBeGreaterThan(1);
    });

    it(`${key} stays settled — no energy revival after 2000 substeps`, () => {
      const solver = referencePanel(key);
      let peak = 0;
      for (let i = 0; i < 400; i++) {
        step(solver);
        peak = Math.max(peak, energy(solver));
      }
      let tail = 0;
      for (let i = 0; i < 1600; i++) {
        step(solver);
        tail = Math.max(tail, energy(solver));
      }
      expect(tail).toBeLessThan(peak * SETTLE_FRACTION);
    });
  }

  it('does not report a false settle on the first step', () => {
    // Released from rest, energy is zero before gravity has acted. Without the
    // minSteps guard every settle would "succeed" on step 1.
    const solver = referencePanel('wool');
    const result = settle(solver, { maxSteps: 500, threshold: 1e-3 });
    expect(result.steps).toBeGreaterThan(1);
  });
});

describe('fabric change is a live physics event', () => {
  it('silk settled under wool goes stiller than it ever was as silk', () => {
    const solver = referencePanel('silk');
    for (let i = 0; i < 600; i++) step(solver);
    const asSilk = energy(solver);

    setFabric(solver, FABRICS.wool);
    for (let i = 0; i < 600; i++) step(solver);
    const asWool = energy(solver);

    // Nambu wool damps ~10x harder; the shimmer has to die.
    expect(asWool).toBeLessThan(asSilk * 0.1);
  });

  it('swapping fabric does not teleport the cloth', () => {
    const solver = referencePanel('silk');
    for (let i = 0; i < 300; i++) step(solver);
    const before = Float32Array.from(solver.particles.py);
    setFabric(solver, FABRICS.wool);
    step(solver);
    let maxMove = 0;
    for (let i = 0; i < before.length; i++) {
      maxMove = Math.max(maxMove, Math.abs(solver.particles.py[i] - before[i]));
    }
    // Continuity: one substep of a heavier fabric moves particles a fraction of
    // a cell, never a jump. Positions carry over; only the response changes.
    expect(maxMove).toBeLessThan(REFERENCE_GRID.spacing * 0.25);
  });
});

describe('determinism', () => {
  it('identical inputs produce bit-identical state', () => {
    const run = () => {
      const solver = referencePanel('cotton');
      solver.breeze = 0.6;
      for (let i = 0; i < 200; i++) {
        if (i === 50) solver.grabbed = 26 * REFERENCE_GRID.cols + 20;
        if (i >= 50 && i < 120) {
          solver.grabX = 12 + i * 0.1;
          solver.grabY = -14;
        }
        if (i === 120) solver.grabbed = -1;
        step(solver);
      }
      return solver.particles;
    };
    const a = run();
    const b = run();
    expect(Array.from(a.px)).toEqual(Array.from(b.px));
    expect(Array.from(a.py)).toEqual(Array.from(b.py));
    expect(Array.from(a.pz)).toEqual(Array.from(b.pz));
  });

  it('pinned particles never move', () => {
    const solver = referencePanel('silk');
    solver.breeze = 1;
    const p = solver.particles;
    const x0 = Float32Array.from(p.px);
    const y0 = Float32Array.from(p.py);
    const z0 = Float32Array.from(p.pz);
    for (let i = 0; i < 400; i++) step(solver);
    for (let i = 0; i < p.count; i++) {
      if (!p.pinned[i]) continue;
      expect(p.px[i]).toBe(x0[i]);
      expect(p.py[i]).toBe(y0[i]);
      expect(p.pz[i]).toBe(z0[i]);
    }
  });

  it('breeze at zero leaves the cloth in the vertical plane it started in', () => {
    const solver = referencePanel('cotton');
    for (let i = 0; i < 600; i++) step(solver);
    // The seed ripple is +-0.08; with no wind nothing should amplify it much.
    let maxZ = 0;
    for (let i = 0; i < solver.particles.count; i++) {
      maxZ = Math.max(maxZ, Math.abs(solver.particles.pz[i]));
    }
    expect(maxZ).toBeLessThan(1);
  });
});
