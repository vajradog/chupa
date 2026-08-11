/**
 * Phase 2 acceptance criterion: a cloth square dropped on the shoulder drapes
 * convincingly against the form without tunneling, at reference solver settings.
 *
 * "Convincingly" is made testable as four separate claims: it does not pass
 * through the body, it does not slide off, it does not end up floating, and it
 * takes the body's shape rather than staying flat.
 */

import { describe, expect, it } from 'vitest';
import {
  bakeSdf,
  buildForm,
  createSdfCollider,
  maxPenetration,
  sampleSdf,
} from '@chupa/body';
import { FABRICS, FABRIC_KEYS, createGridCloth, createSolver, step } from '@chupa/cloth';

const form = buildForm();
const grid = bakeSdf(form.sdf, form.bounds, { cell: 0.5 });
const MARGIN = grid.cell * 0.5;

/**
 * 300 steps, not 600.
 *
 * The figure's neck used to run five centimetres past where a chin belongs, and
 * that extra height hooked the cloth: a free square would sit on it for
 * thousands of steps. With the neck stopping at the chin — which is what a body
 * does — a flat square has far less to grip, and every fabric starts to slide
 * somewhere between 450 and 600 steps. 300 is inside the settled window for all
 * four; the numbers below were re-measured there, not nudged until they passed.
 */
function dropOnShoulder(fabricKey: string, steps = 300) {
  // A 60cm square (24 particles at 2.5cm spacing), held flat above the shoulders
  // and released. Nothing is pinned — gravity and the body do all of it.
  const cloth = createGridCloth({
    cols: 24,
    rows: 24,
    spacing: 1,
    orientation: 'flat',
    origin: [0, form.bounds.max[1] + 2, 0],
    pinTopRow: false,
    seedWave: 0,
  });
  const solver = createSolver({
    cloth,
    fabric: FABRICS[fabricKey],
    collider: createSdfCollider(grid, { margin: MARGIN, friction: 0.6 }),
  });
  for (let i = 0; i < steps; i++) step(solver);
  return { cloth, solver };
}

describe('cloth square dropped on the shoulder', () => {
  for (const key of FABRIC_KEYS) {
    it(`${key} does not tunnel through the form`, () => {
      const { solver } = dropOnShoulder(key);
      // Allow a fraction of a voxel of sink — trilinear sampling is not exact —
      // but nothing may end up meaningfully inside the body.
      expect(maxPenetration(solver.particles, grid, MARGIN)).toBeLessThan(grid.cell * 0.6);
    });
  }

  it('settles ON the figure rather than sliding to the floor', () => {
    const { solver } = dropOnShoulder('cotton');
    const p = solver.particles;
    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = 0; i < p.count; i++) {
      lowest = Math.min(lowest, p.py[i]);
      highest = Math.max(highest, p.py[i]);
    }
    // Friction has to hold it on the shoulders: the top of the cloth stays up
    // near shoulder height, and no part of it reaches the floor.
    expect(highest).toBeGreaterThan(form.levelOf('bust'));
    expect(lowest).toBeGreaterThan(form.levelOf('ankle'));
  });

  it('is actually in contact — not hovering above the body', () => {
    const { solver } = dropOnShoulder('cotton');
    const p = solver.particles;
    let touching = 0;
    for (let i = 0; i < p.count; i++) {
      if (sampleSdf(grid, p.px[i], p.py[i], p.pz[i]) < MARGIN + grid.cell) touching++;
    }
    expect(touching).toBeGreaterThan(p.count * 0.2);
  });

  it('takes the shape of the body instead of staying a flat sheet', () => {
    const { solver } = dropOnShoulder('cotton');
    const p = solver.particles;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < p.count; i++) {
      minZ = Math.min(minZ, p.pz[i]);
      maxZ = Math.max(maxZ, p.pz[i]);
    }
    // Dropped flat it had almost no depth; wrapped over the shoulders it must
    // now span front to back.
    expect(maxZ - minZ).toBeGreaterThan(4);
  });

  it('comes to rest — the contact does not feed energy back in', () => {
    const { solver } = dropOnShoulder('wool');
    const p = solver.particles;
    let motion = 0;
    for (let i = 0; i < p.count; i++) {
      motion += Math.abs(p.px[i] - p.ox[i]) + Math.abs(p.py[i] - p.oy[i]);
    }
    expect(motion / p.count).toBeLessThan(0.01);
  });

  it('silk conforms more closely than nambu wool', () => {
    const meanDistance = (key: string) => {
      const { solver } = dropOnShoulder(key);
      const p = solver.particles;
      let sum = 0;
      for (let i = 0; i < p.count; i++) sum += sampleSdf(grid, p.px[i], p.py[i], p.pz[i]);
      return sum / p.count;
    };
    // Wool's bending stiffness holds it off the body; silk collapses onto it.
    // Measured on the corrected figure: silk 0.96, cotton 1.07, khadi 1.11,
    // wool 1.17 world units of mean standoff. Small, but correctly ordered
    // across all four fabrics.
    expect(meanDistance('silk')).toBeLessThan(meanDistance('wool'));
  });

  it('light fabric eventually creeps off an unbelted form — measured, not a bug', () => {
    // A loose square on a smooth figure is held only by the shoulder slope. Over
    // ~20-30 seconds of sim, silk and cotton work their way off; nambu wool stays
    // indefinitely. Real cloth does this too, and the real garment is belted at
    // the waist with its bodice pinned, so nothing in the chupa is ever held by
    // friction alone. Recorded here so the behaviour is known rather than
    // discovered later.
    const stillOnAfter = (key: string, steps: number) => {
      const cloth = createGridCloth({
        cols: 24,
        rows: 24,
        spacing: 1,
        orientation: 'flat',
        origin: [0, form.bounds.max[1] + 2, 0],
        pinTopRow: false,
        seedWave: 0,
      });
      const solver = createSolver({
        cloth,
        fabric: FABRICS[key],
        collider: createSdfCollider(grid, { margin: MARGIN, friction: 0.6 }),
      });
      for (let i = 0; i < steps; i++) step(solver);
      let highest = -Infinity;
      for (let i = 0; i < solver.particles.count; i++) {
        highest = Math.max(highest, solver.particles.py[i]);
      }
      return highest > form.levelOf('waist');
    };
    for (const key of FABRIC_KEYS) {
      expect(stillOnAfter(key, 300)).toBe(true);   // draped, every fabric
      expect(stillOnAfter(key, 3000)).toBe(false); // and gone, every fabric
    }
  });

  it('friction is what holds it on — take it away and it slides straight off', () => {
    // Guards the Coulomb formulation. Viscous damping only slowed the creep;
    // this test failed against that implementation and passes against this one.
    //
    // The contrast is against a frictionless surface, not a nearly-frictionless
    // one: dropped symmetrically the square lands as a poncho over the neck, and
    // even a coefficient of 0.05 holds that balanced for several seconds before
    // it tips. Zero has nothing to tip — it is off the figure inside 300 steps.
    const highestAfter = (friction: number, steps: number) => {
      const cloth = createGridCloth({
        cols: 24,
        rows: 24,
        spacing: 1,
        orientation: 'flat',
        origin: [0, form.bounds.max[1] + 2, 0],
        pinTopRow: false,
        seedWave: 0,
      });
      const solver = createSolver({
        cloth,
        fabric: FABRICS.silk,
        collider: createSdfCollider(grid, { margin: MARGIN, friction }),
      });
      for (let i = 0; i < steps; i++) step(solver);
      let highest = -Infinity;
      for (let i = 0; i < solver.particles.count; i++) {
        highest = Math.max(highest, solver.particles.py[i]);
      }
      return highest;
    };
    // Frictionless is measured later, once it has had time to be gone; the
    // gripping case is measured inside the settled window.
    expect(highestAfter(0, 600)).toBeLessThan(form.levelOf('ankle'));
    expect(highestAfter(0.6, 300)).toBeGreaterThan(form.levelOf('bust'));
  });
});

describe('collider behaviour', () => {
  it('does nothing to cloth that is nowhere near the body', () => {
    const cloth = createGridCloth({
      cols: 8,
      rows: 8,
      spacing: 1,
      origin: [400, 0, 0],
      pinTopRow: true,
    });
    const collide = createSdfCollider(grid, { margin: MARGIN });
    const before = Float32Array.from(cloth.particles.px);
    collide(cloth.particles);
    expect(Array.from(cloth.particles.px)).toEqual(Array.from(before));
  });

  it('never moves a pinned particle', () => {
    // Pinned particles are the belted bodice; collision must not fight the pin.
    const cloth = createGridCloth({
      cols: 8,
      rows: 8,
      spacing: 1,
      origin: [0, form.levelOf('waist'), 0],
      pinTopRow: true,
    });
    const p = cloth.particles;
    const before = Float32Array.from(p.px);
    createSdfCollider(grid, { margin: MARGIN })(p);
    for (let i = 0; i < p.count; i++) {
      if (p.pinned[i]) expect(p.px[i]).toBe(before[i]);
    }
  });

  it('pushes a particle buried in the torso back out to the surface', () => {
    const cloth = createGridCloth({ cols: 2, rows: 1, spacing: 1, pinTopRow: false });
    const p = cloth.particles;
    const waistY = form.levelOf('waist');
    p.px[0] = 0; p.py[0] = waistY; p.pz[0] = 0;
    p.ox[0] = 0; p.oy[0] = waistY; p.oz[0] = 0;
    createSdfCollider(grid, { margin: MARGIN })(p);
    expect(sampleSdf(grid, p.px[0], p.py[0], p.pz[0])).toBeGreaterThan(-grid.cell);
  });
});
