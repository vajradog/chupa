/**
 * The figure itself: does the geometry actually reproduce the measurements it
 * was given? Everything downstream trusts this, and a mannequin whose waist is
 * not the waist would poison the whole pattern.
 */

import { describe, expect, it } from 'vitest';
import {
  MEASUREMENTS,
  bakeSdf,
  buildForm,
  buildRings,
  ellipseFromCircumference,
  ellipsePerimeter,
  latheSdf,
  parseMeasurements,
  ringNamed,
  sampleSdf,
  sdCapsule,
  sdRoundCone,
  smin,
} from '@chupa/body';

describe('ellipse round-trip', () => {
  it('recovers semi-axes that reproduce the circumference', () => {
    for (const circ of [33, 70, 86, 92]) {
      for (const ratio of [0.7, 0.76, 0.9, 1]) {
        const { rx, rz } = ellipseFromCircumference(circ, ratio);
        expect(ellipsePerimeter(rx, rz)).toBeCloseTo(circ, 6);
        expect(rz / rx).toBeCloseTo(ratio, 9);
      }
    }
  });

  it('degenerates to a circle at ratio 1', () => {
    const { rx, rz } = ellipseFromCircumference(2 * Math.PI, 1);
    expect(rx).toBeCloseTo(1, 9);
    expect(rz).toBeCloseTo(1, 9);
  });
});

describe('rings reproduce the measurement set', () => {
  const rings = buildRings(MEASUREMENTS, 1); // centimetres

  it('places each level at its measured height', () => {
    expect(ringNamed(rings, 'waist').y).toBe(MEASUREMENTS.floorToWaist);
    expect(ringNamed(rings, 'hip').y).toBe(MEASUREMENTS.floorToHip);
    expect(ringNamed(rings, 'bust').y).toBe(MEASUREMENTS.floorToBust);
    expect(ringNamed(rings, 'neckBase').y).toBe(MEASUREMENTS.floorToNeckBase);
  });

  it('reproduces torso circumferences', () => {
    const check = (name: string, expected: number) => {
      const r = ringNamed(rings, name);
      expect(ellipsePerimeter(r.rx, r.rz)).toBeCloseTo(expected, 4);
    };
    check('waist', MEASUREMENTS.waistCircumference);
    check('hip', MEASUREMENTS.hipCircumference);
    check('bust', MEASUREMENTS.bustCircumference);
    check('underbust', MEASUREMENTS.underbustCircumference);
    check('neckBase', MEASUREMENTS.neckCircumference);
  });

  it('makes the shoulder ring as wide as the shoulders', () => {
    expect(ringNamed(rings, 'shoulder').rx * 2).toBeCloseTo(MEASUREMENTS.shoulderWidth, 6);
  });

  it('keeps the waist the narrowest point of the torso', () => {
    const waist = ringNamed(rings, 'waist');
    for (const name of ['hip', 'bust', 'underbust']) {
      expect(ringNamed(rings, name).rx).toBeGreaterThan(waist.rx);
    }
  });

  it('is ordered bottom to top', () => {
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i].y).toBeGreaterThan(rings[i - 1].y);
    }
  });

  it('scales uniformly into world units', () => {
    const world = buildRings(MEASUREMENTS, 1 / MEASUREMENTS.worldScale);
    const cm = ringNamed(rings, 'waist');
    const w = ringNamed(world, 'waist');
    expect(w.y).toBeCloseTo(cm.y / MEASUREMENTS.worldScale, 6);
    expect(w.rx).toBeCloseTo(cm.rx / MEASUREMENTS.worldScale, 6);
  });
});

describe('measurement validation', () => {
  const good = { ...(MEASUREMENTS as unknown as Record<string, unknown>), depthRatio: MEASUREMENTS.depthRatio };

  it('rejects a body whose waist sits below its hip', () => {
    expect(() => parseMeasurements({ ...good, floorToWaist: 10 })).toThrow(/floorToWaist/);
  });

  it('rejects a negative measurement', () => {
    expect(() => parseMeasurements({ ...good, bustCircumference: -1 })).toThrow(/bustCircumference/);
  });

  it('rejects an absurd depth ratio', () => {
    expect(() =>
      parseMeasurements({ ...good, depthRatio: { ...MEASUREMENTS.depthRatio, bust: 3 } }),
    ).toThrow(/depthRatio.bust/);
  });
});

describe('signed distance primitives', () => {
  it('capsule is exact along and across the segment', () => {
    // Segment from origin to (0,10,0), radius 2.
    expect(sdCapsule(0, 5, 0, 0, 0, 0, 0, 10, 0, 2)).toBeCloseTo(-2, 9);
    expect(sdCapsule(5, 5, 0, 0, 0, 0, 0, 10, 0, 2)).toBeCloseTo(3, 9);
    expect(sdCapsule(0, -5, 0, 0, 0, 0, 0, 10, 0, 2)).toBeCloseTo(3, 9);
  });

  it('round cone matches a capsule when it does not taper', () => {
    for (const [x, y, z] of [[3, 5, 0], [0, 12, 1], [-4, -2, 2]]) {
      const cone = sdRoundCone(x, y, z, 0, 0, 0, 0, 10, 0, 2, 2);
      const cap = sdCapsule(x, y, z, 0, 0, 0, 0, 10, 0, 2);
      expect(cone).toBeCloseTo(cap, 6);
    }
  });

  it('round cone honours both end radii', () => {
    expect(sdRoundCone(0, -1, 0, 0, 0, 0, 0, 10, 0, 3, 1)).toBeCloseTo(-2, 6);
    expect(sdRoundCone(0, 11, 0, 0, 0, 0, 0, 10, 0, 3, 1)).toBeCloseTo(0, 6);
  });

  it('smooth min never exceeds the hard min and closes the crease', () => {
    expect(smin(3, 5, 0)).toBe(3);
    expect(smin(3, 3, 2)).toBeLessThan(3);
    expect(smin(3, 50, 2)).toBeCloseTo(3, 6);
  });
});

describe('lathe SDF', () => {
  const rings = buildRings(MEASUREMENTS, 1);

  it('is negative on the axis inside the body and positive outside', () => {
    expect(latheSdf(rings, 0, MEASUREMENTS.floorToWaist, 0)).toBeLessThan(0);
    expect(latheSdf(rings, 100, MEASUREMENTS.floorToWaist, 0)).toBeGreaterThan(0);
    expect(latheSdf(rings, 0, MEASUREMENTS.height + 50, 0)).toBeGreaterThan(0);
    expect(latheSdf(rings, 0, -20, 0)).toBeGreaterThan(0);
  });

  it('puts the zero crossing on the measured waist radius', () => {
    const waist = ringNamed(rings, 'waist');
    expect(latheSdf(rings, waist.rx, waist.y, 0)).toBeCloseTo(0, 4);
    expect(latheSdf(rings, 0, waist.y, waist.rz)).toBeCloseTo(0, 4);
  });

  it('reports roughly the true distance straight out from the waist', () => {
    const waist = ringNamed(rings, 'waist');
    const d = latheSdf(rings, waist.rx + 10, waist.y, 0);
    // Slightly under 10: the waist is the narrow point, so the nearest surface is
    // on the flare above or below it, not straight out sideways.
    expect(d).toBeGreaterThan(9.5);
    expect(d).toBeLessThanOrEqual(10);
  });
});

describe('assembled form', () => {
  const form = buildForm();

  it('lands in world units, matching the cloth coordinate system', () => {
    expect(form.scale).toBeCloseTo(1 / MEASUREMENTS.worldScale, 9);
    // A 160cm woman at 2.5cm per unit is 64 units tall.
    expect(form.levelOf('shoulder')).toBeCloseTo(
      MEASUREMENTS.floorToShoulder / MEASUREMENTS.worldScale,
      6,
    );
  });

  it('bounds contain the whole figure', () => {
    const { min, max } = form.bounds;
    for (const l of form.limbs) {
      for (const p of [l.a, l.b]) {
        expect(p[0]).toBeGreaterThan(min[0]);
        expect(p[0]).toBeLessThan(max[0]);
        expect(p[1]).toBeGreaterThan(min[1]);
        expect(p[1]).toBeLessThan(max[1]);
      }
    }
  });

  it('has arms hanging clear of the torso', () => {
    // The sockets sit under the shoulder points, but by the elbow the arm must be
    // its own volume — otherwise the honju sleeve has nothing to hang on.
    const arm = form.limbs[1];
    const midX = (arm.a[0] + arm.b[0]) / 2;
    const midY = (arm.a[1] + arm.b[1]) / 2;
    expect(form.sdf(midX, midY, 0)).toBeLessThan(0);
    expect(latheSdf(form.rings, midX, midY, 0)).toBeGreaterThan(0);
  });

  it('is solid everywhere along the torso axis', () => {
    const lo = form.levelOf('ankle');
    const hi = form.levelOf('neckBase');
    for (let t = 0.05; t < 1; t += 0.05) {
      expect(form.sdf(0, lo + (hi - lo) * t, 0)).toBeLessThan(0);
    }
  });
});

describe('SDF bake', () => {
  const form = buildForm();
  const grid = bakeSdf(form.sdf, form.bounds, { cell: 0.5 });

  it('tracks the analytic field within a voxel in the band cloth occupies', () => {
    let worst = 0;
    const { min, max } = form.bounds;
    for (let i = 0; i < 400; i++) {
      // Deterministic lattice walk, not random — tests must not flake.
      const t = i / 400;
      const x = min[0] + (max[0] - min[0]) * ((i * 7) % 400) / 400;
      const y = min[1] + (max[1] - min[1]) * t;
      const z = min[2] + (max[2] - min[2]) * ((i * 13) % 400) / 400;
      const analytic = form.sdf(x, y, z);
      if (analytic < -2) continue; // see the interior caveat below
      worst = Math.max(worst, Math.abs(sampleSdf(grid, x, y, z) - analytic));
    }
    expect(worst).toBeLessThan(grid.cell);
  });

  it('is less accurate deep inside, near the axis of revolution — known and harmless', () => {
    // latheSdf measures distance along the query point's bearing, so on the
    // centreline of an elliptical cross-section it reports the WIDE radius rather
    // than the true nearest distance, and the analytic field has a seam there
    // that a half-unit grid cannot resolve. Cloth never occupies the inside of
    // the body, so this costs nothing — but it must not be mistaken for a bake bug.
    const y = form.levelOf('knee') + 1;
    expect(form.sdf(0, y, 0)).toBeLessThan(0);
    expect(sampleSdf(grid, 0, y, 0)).toBeLessThan(0);
    expect(Math.abs(sampleSdf(grid, 0, y, 0) - form.sdf(0, y, 0))).toBeGreaterThan(grid.cell);
  });

  it('agrees with the analytic sign deep inside and far outside', () => {
    const waistY = form.levelOf('waist');
    expect(sampleSdf(grid, 0, waistY, 0)).toBeLessThan(0);
    expect(sampleSdf(grid, 500, waistY, 0)).toBeGreaterThan(0);
  });

  it('stays inside a phone-sized memory budget', () => {
    // 64-ish cubed of Float32 is a megabyte or two, baked once per body.
    expect(grid.data.byteLength).toBeLessThan(8 * 1024 * 1024);
  });
});
