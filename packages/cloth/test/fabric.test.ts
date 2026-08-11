/**
 * Phase 1 acceptance criterion (c): fabric presets load from
 * fabrics/presets.json and produce measurably different settle times.
 *
 * Measured settle times (substeps to reach 1% of peak energy, reference panel):
 *     silk 116 · cotton 81 · khadi 74 · wool 64
 * Strictly ordered light to heavy, with silk taking ~1.8x as long as nambu wool.
 */

import { describe, expect, it } from 'vitest';
import {
  FABRICS,
  FABRIC_KEYS,
  PRESETS_DOCUMENT,
  REFERENCE_GRID,
  SOLVER_CONFIG,
  createGridCloth,
  createSolver,
  getFabric,
  parseFabricPresets,
  parseSolverConfig,
  settle,
} from '@chupa/cloth';

describe('presets load from fabrics/presets.json', () => {
  it('exposes the four approved fabrics in weight order', () => {
    expect(FABRIC_KEYS).toEqual(['silk', 'cotton', 'khadi', 'wool']);
  });

  it('keeps the approved values verbatim — these were tuned by feel with Thupten', () => {
    // The tuned values are bend/density/damping and the two render terms. The
    // descriptive fields added later (gsm, fluidity, crease) say what the cloth
    // IS; they do not touch what the solver does, so they are checked apart from
    // the approved block rather than folded into it.
    expect(FABRICS.silk).toMatchObject({
      key: 'silk',
      label: 'Silk brocade',
      note: 'light, flows',
      bend: 0.1,
      density: 0.45,
      damping: 0.993,
      sheen: 0.85,
      sat: 1.1,
    });
    expect(FABRICS.wool.bend).toBe(0.85);
    expect(FABRICS.wool.density).toBe(2.6);
    expect(FABRICS.wool.damping).toBe(0.935);
    // Real weights, heaviest to lightest across the library.
    expect(FABRICS.melton.gsm).toBeGreaterThan(FABRICS.wool.gsm);
    expect(FABRICS.georgette.gsm).toBeLessThan(FABRICS.silk.gsm);
    // Fluidity runs the other way from weight, as cloth does.
    expect(FABRICS.georgette.fluidity).toBeGreaterThan(FABRICS.melton.fluidity);
    // Linen keeps a crease; wool hangs its out.
    expect(FABRICS.linen.crease).toBeGreaterThan(FABRICS.worsted.crease);
  });

  it('loads the reference solver settings', () => {
    expect(SOLVER_CONFIG).toEqual({
      gravity: -0.016,
      iterations: 7,
      substeps: 2,
      timestep: 0.01666667,
      bendConstraintScale: 0.5,
    });
    expect(REFERENCE_GRID).toEqual({ cols: 40, rows: 52, spacing: 1 });
  });

  it('skips $comment keys and the solver block', () => {
    expect(Object.keys(PRESETS_DOCUMENT)).toContain('$comment');
    expect(FABRIC_KEYS).not.toContain('$comment');
    expect(FABRIC_KEYS).not.toContain('solver');
  });

  it('orders the presets monotonically heavier and stiffer', () => {
    const keys = [...FABRIC_KEYS];
    for (let i = 1; i < keys.length; i++) {
      const prev = FABRICS[keys[i - 1]];
      const cur = FABRICS[keys[i]];
      expect(cur.density).toBeGreaterThan(prev.density);
      expect(cur.bend).toBeGreaterThan(prev.bend);
      expect(cur.damping).toBeLessThan(prev.damping);
    }
  });

  it('rejects a malformed preset loudly', () => {
    expect(() => parseFabricPresets({ bad: { bend: 'stiff' } })).toThrow(/bend/);
    expect(() => parseFabricPresets({ $comment: 'only a comment' })).toThrow(/no fabrics/);
    expect(() => parseSolverConfig({})).toThrow(/gravity/);
  });

  it('names an unknown fabric in the error', () => {
    expect(() => getFabric('polyester')).toThrow(/polyester/);
  });
});

describe('presets produce measurably different settle times', () => {
  const settleSteps = (key: string) => {
    const cloth = createGridCloth({ ...REFERENCE_GRID });
    const solver = createSolver({ cloth, fabric: FABRICS[key] });
    const result = settle(solver, { maxSteps: 2000, relativeThreshold: 0.01 });
    expect(result.settled).toBe(true);
    return result.steps;
  };

  it('settles strictly faster as the fabric gets heavier', () => {
    const steps = FABRIC_KEYS.map(settleSteps);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThan(steps[i - 1]);
    }
  });

  it('separates the extremes by a margin nobody could mistake for noise', () => {
    expect(settleSteps('silk')).toBeGreaterThan(settleSteps('wool') * 1.5);
  });

  /**
   * FINDING — `density` divides wind and grab response but is absent from the
   * gravity term, exactly as in the reference demo, so every fabric falls at the
   * same rate and heavy nambu wool does NOT hang lower than silk brocade. It
   * hangs marginally HIGHER (~0.25 units on a 51-unit panel, under 0.5%),
   * because its harder damping kills the momentum overshoot that stretches silk.
   *
   * Product decision 5 asks the silk -> wool switch to "visibly drop, stiffen,
   * and go still". Stiffen and go still are delivered and dramatic. The drop is
   * not there. Flagged for Thupten — see packages/cloth/README.md.
   */
  it('hem settle height barely moves with fabric — the "drop" is not in the solver yet', () => {
    const hemY = (key: string) => {
      const cloth = createGridCloth({ ...REFERENCE_GRID });
      const solver = createSolver({ cloth, fabric: FABRICS[key] });
      settle(solver, { maxSteps: 2000, relativeThreshold: 0.01 });
      const { cols, rows } = cloth;
      let lowest = 0;
      for (let c = 0; c < cols; c++) lowest = Math.min(lowest, solver.particles.py[(rows - 1) * cols + c]);
      return lowest;
    };
    const silk = hemY('silk');
    const wool = hemY('wool');
    expect(wool).toBeGreaterThan(silk); // wool hangs higher, not lower
    expect(Math.abs(wool - silk)).toBeLessThan(REFERENCE_GRID.rows * 0.02);
  });
});
