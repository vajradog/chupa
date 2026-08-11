/**
 * The cut. A uniform lattice can only hold a flat sheet or a straight cylinder
 * for free, which is not enough to build a garment — the chupa's skirt is a
 * cone, wider at the hem than at the waist, and it holds that flare with no
 * fabric surplus at all. `captureRestShape` makes an authored shape the cloth's
 * zero-energy state, which is what a pattern piece is.
 */

import { describe, expect, it } from 'vitest';
import {
  FABRICS,
  buildGridConstraints,
  captureRestShape,
  createGridCloth,
  createSolver,
  maxOverstretch,
  resetGridCloth,
  restFromShape,
  setParticle,
  step,
} from '@chupa/cloth';

/** A cone: a closed tube whose radius grows from `rTop` to `rBottom`. */
function cone(cols: number, rows: number, rTop: number, rBottom: number) {
  const cloth = createGridCloth({
    cols, rows, spacing: 1, closed: true, pinTopRow: false, seedWave: 0,
  });
  const p = cloth.particles;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const radius = rTop + (rBottom - rTop) * t;
    for (let c = 0; c < cols; c++) {
      const th = (c / cols) * Math.PI * 2;
      setParticle(p, r * cols + c, Math.cos(th) * radius, -r, Math.sin(th) * radius);
      p.pinned[r * cols + c] = r === 0 ? 1 : 0;
    }
  }
  return cloth;
}

const radiusAtRow = (cloth: ReturnType<typeof cone>, r: number) => {
  const p = cloth.particles;
  let sum = 0;
  for (let c = 0; c < cloth.cols; c++) {
    const i = r * cloth.cols + c;
    sum += Math.hypot(p.px[i], p.pz[i]);
  }
  return sum / cloth.cols;
};

describe('rest shape', () => {
  it('takes rest lengths from the authored shape, not from spacing', () => {
    const cloth = cone(32, 12, 4, 9);
    captureRestShape(cloth);
    const uniform = buildGridConstraints(cloth.cols, cloth.rows, cloth.spacing, true);
    const cut = buildGridConstraints(cloth.cols, cloth.rows, cloth.spacing, true);
    restFromShape(cut, cloth.rest!, cloth.restSlack);
    // The uniform lattice wants one spacing everywhere; the cut wants the cone,
    // whose hem ring links are more than twice its waist ring links.
    expect(new Set(Array.from(uniform.structural.filter((_, i) => i % 3 === 2))).size)
      .toBeLessThanOrEqual(2);
    const cutRests = Array.from(cut.structural.filter((_, i) => i % 3 === 2));
    expect(Math.max(...cutRests) / Math.min(...cutRests)).toBeGreaterThan(2);
  });

  it('holds a cone with no overstretch — the flare costs the cloth nothing', () => {
    const cloth = cone(32, 12, 4, 9);
    captureRestShape(cloth);
    const solver = createSolver({ cloth, fabric: FABRICS.silk });
    expect(maxOverstretch(cloth.particles, solver.constraints.structural)).toBeLessThan(1e-4);
  });

  it('collapses the same cone without it — this is why the flare needed the mechanism', () => {
    const cloth = cone(32, 12, 4, 9);
    const solver = createSolver({ cloth, fabric: FABRICS.silk });
    const before = radiusAtRow(cloth, cloth.rows - 1);
    for (let i = 0; i < 200; i++) step(solver);
    // Rest lengths of one spacing drag the wide hem in towards the waist ring.
    expect(radiusAtRow(cloth, cloth.rows - 1)).toBeLessThan(before * 0.9);
  });

  it('slack is the gather: surplus over the cut, and nothing else', () => {
    const smooth = cone(32, 12, 4, 9);
    captureRestShape(smooth, 1);
    const gathered = cone(32, 12, 4, 9);
    captureRestShape(gathered, 1.4);
    const a = createSolver({ cloth: smooth, fabric: FABRICS.silk });
    const b = createSolver({ cloth: gathered, fabric: FABRICS.silk });
    const rest = (n: number, s: typeof a) => s.constraints.structural[n * 3 + 2];
    expect(rest(0, b) / rest(0, a)).toBeCloseTo(1.4, 5);
  });

  it('reset returns the garment to its cut, not to a flat sheet', () => {
    const cloth = cone(32, 12, 4, 9);
    captureRestShape(cloth);
    const solver = createSolver({ cloth, fabric: FABRICS.silk });
    for (let i = 0; i < 120; i++) step(solver);
    resetGridCloth(cloth);
    expect(radiusAtRow(cloth, cloth.rows - 1)).toBeCloseTo(9, 4);
    expect(cloth.particles.py[(cloth.rows - 1) * cloth.cols]).toBeCloseTo(-(cloth.rows - 1), 4);
    // And the authored pins survive, which a flat-grid reset would have rewritten.
    expect(cloth.particles.pinned[0]).toBe(1);
  });
});
