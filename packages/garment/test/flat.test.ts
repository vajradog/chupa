/**
 * The front elevation — the drawing the 3D shell is built from.
 *
 * These guard the specific things that went wrong while it was being corrected
 * against Thupten's references, because every one of them looked like a
 * judgement call on a screenshot when it was actually a bug.
 */

import { describe, expect, it } from 'vitest';
import { buildForm } from '@chupa/body';
import { GARMENT_SPEC, buildFlatChupa } from '@chupa/garment';
import type { FlatRegion, GarmentSpec } from '@chupa/garment';

const form = buildForm();
const flat = buildFlatChupa(form);

const withChupa = (patch: Partial<GarmentSpec['chupa']>): GarmentSpec => ({
  ...GARMENT_SPEC,
  chupa: { ...GARMENT_SPEC.chupa, ...patch },
});

const named = (f: ReturnType<typeof buildFlatChupa>, name: string): FlatRegion => {
  const r = f.regions.find((x) => x.name === name);
  if (!r) throw new Error(`no flat region named "${name}"`);
  return r;
};

/**
 * How far out the shoulder seam reaches on one side.
 *
 * NOT the region's widest point — that is the ribcage, which does not move when
 * the strap does. And not a thin slice at the very top either: the seam SLOPES,
 * descending a few centimetres as it runs out, so the band has to reach down to
 * where that seam ends.
 */
function strapOuterOf(
  f: ReturnType<typeof buildFlatChupa>, spec: GarmentSpec, side: 1 | -1,
): number {
  const shoulderY = form.measurements.floorToShoulder;
  const seamEndY = shoulderY
    - spec.chupa.shoulderPanelWidth * Math.tan((spec.chupa.shoulderSlopeDeg * Math.PI) / 180);
  let outer = -Infinity;
  for (const region of f.regions) {
    if (region.garment !== 'chupa') continue;
    for (const [x, y] of region.outline) {
      if (y >= seamEndY - 0.01) outer = Math.max(outer, x * side);
    }
  }
  return outer;
}

/** Widest point on each side, and the height it happens at. */
function extremes(region: FlatRegion) {
  let left = { x: Infinity, y: 0 };
  let right = { x: -Infinity, y: 0 };
  for (const [x, y] of region.outline) {
    if (x < left.x) left = { x, y };
    if (x > right.x) right = { x, y };
  }
  return { left, right };
}

describe('the shoulders', () => {
  it('are mirror images of each other', () => {
    // They were not: `bodiceSide` was changed to begin at the neck point and
    // carry the sloping shoulder seam, but both panels still appended the old
    // flat-top corner at the strap's outer end. The outlines doubled back and
    // the two shoulders came out different shapes.
    const { left, right } = extremes(named(flat, 'bodiceUnder'));
    expect(Math.abs(left.x)).toBeCloseTo(right.x, 6);
    expect(left.y).toBeCloseTo(right.y, 6);
  });

  it('slope: the neck point sits above the shoulder point', () => {
    // A drafted shoulder falls ~21 degrees. A flat-topped strap is what made
    // the bodice read as a cut-out rather than a garment.
    const { chupa: c } = GARMENT_SPEC;
    const shoulderY = form.measurements.floorToShoulder;
    const pts = named(flat, 'bodiceUnder').outline;
    const topY = Math.max(...pts.map((p) => p[1]));
    expect(topY).toBeCloseTo(shoulderY, 6);
    // The highest points are the two neck points, at the neckline's own width.
    const atTop = pts.filter((p) => Math.abs(p[1] - topY) < 1e-6);
    for (const [x] of atTop) expect(Math.abs(x)).toBeCloseTo(c.necklineWidth / 2, 5);
    // And the strap's outer end is a shoulder-slope's worth lower.
    const strapOuter = c.necklineWidth / 2 + c.shoulderPanelWidth;
    const expectedY = shoulderY
      - c.shoulderPanelWidth * Math.tan((c.shoulderSlopeDeg * Math.PI) / 180);
    const corner = pts.reduce((best, p) =>
      Math.hypot(p[0] - strapOuter, p[1] - expectedY)
        < Math.hypot(best[0] - strapOuter, best[1] - expectedY) ? p : best);
    expect(corner[0]).toBeCloseTo(strapOuter, 4);
    expect(corner[1]).toBeCloseTo(expectedY, 4);
    expect(corner[1]).toBeLessThan(topY);
  });

  it('actually narrow when the strap is narrowed', () => {
    // The regression that cost the most: bodiceHalfAt ended with
    // `max(w, bodyHalfWidth + ease)`, so above the underarm the body's shoulder
    // width — 20cm — silently overrode every strap width ever set. Four
    // different values produced an identical drawing.
    const wideSpec = withChupa({ shoulderPanelWidth: 14 });
    const narrowSpec = withChupa({ shoulderPanelWidth: 3 });
    const wide = strapOuterOf(buildFlatChupa(form, wideSpec), wideSpec, 1);
    const narrow = strapOuterOf(buildFlatChupa(form, narrowSpec), narrowSpec, 1);
    expect(narrow).toBeLessThan(wide - 5);
  });
});

describe('the wrap', () => {
  it('lays every band on the garment side of its own edge', () => {
    // The perpendicular that gives a band its width flips with the direction of
    // travel, so an unsigned offset put the back band on the WRONG side of its
    // fold — above the shoulder line, into the neck opening — which ate that
    // strap and made the two shoulders different widths. Nothing above the
    // shoulder seam is cloth.
    const shoulderY = form.measurements.floorToShoulder;
    for (const region of flat.regions) {
      for (const [, y] of region.outline) {
        expect(y).toBeLessThanOrEqual(shoulderY + 1e-6);
      }
    }
  });

  it('keeps the two straps the same width', () => {
    // The mirror check on the widest points passes even when the straps differ,
    // because the widest point is the underarm. Measure the straps themselves.
    expect(strapOuterOf(flat, GARMENT_SPEC, 1))
      .toBeCloseTo(strapOuterOf(flat, GARMENT_SPEC, -1), 6);
  });
  it('never hangs the fold outside the side seam', () => {
    // Dialled up, wrapEndX ran the fold past the bodice's own edge and left a
    // spur of cloth hanging off the waist.
    const f = buildFlatChupa(form, withChupa({ wrapEndX: 40 }));
    const bodice = extremes(named(f, 'bodiceUnder'));
    const widest = Math.max(bodice.right.x, -bodice.left.x);
    for (const [x] of named(f, 'bodiceOver').outline) {
      // A hair of tolerance: the two panels sample the side seam at different
      // heights, so they can disagree by a fraction of a millimetre. A spur is
      // centimetres, which is what this is looking for.
      expect(Math.abs(x)).toBeLessThanOrEqual(widest + 0.05);
    }
  });

  it('bands both edges — the front panel and the one underneath', () => {
    expect(named(flat, 'wrapBand').garment).toBe('chupa');
    expect(named(flat, 'wrapBandBack').garment).toBe('chupa');
    // The back band stops at the crossing; past that the front panel covers it.
    const back = named(flat, 'wrapBandBack');
    let maxX = -Infinity;
    for (const [x] of back.outline) maxX = Math.max(maxX, x);
    // It reaches the crossing at centre front, plus its own width — no further.
    expect(maxX).toBeLessThan(GARMENT_SPEC.chupa.wrapBandWidth + 1);
  });

  it('cuts the band on the shoulder seam, leaving no notch', () => {
    // Capping the band square to its own direction left a wedge of bare cloth
    // between it and the strap. It is stitched in, so it is cut on the seam.
    const band = named(flat, 'wrapBand');
    const shoulderY = form.measurements.floorToShoulder;
    const onSeam = band.outline.filter(([, y]) => y > shoulderY - 6);
    expect(onSeam.length).toBeGreaterThanOrEqual(2);
    // Both ends of that cut sit on the sloping seam, so they differ in height.
    const ys = onSeam.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.2);
  });
});

describe('the armhole', () => {
  it('never cuts inside her ribcage', () => {
    // It may cut inside the SHOULDER — that is where the arm is. Below the bust
    // it may not: a deep armhole was leaving bare torso showing between the
    // chupa's side and her arm once the mannequin was drawn behind it.
    // Checked below the fade: the ribcage floor is eased in over the 8cm under
    // the bust rather than switched on at it, because a hard changeover put an
    // angular notch in the side of the garment. Inside that band the cloth may
    // sit a few tenths of a millimetre in.
    const f = buildFlatChupa(form, withChupa({ armholeDrop: 34 }));
    const bodice = named(f, 'bodiceUnder').outline;
    const fadeTop = form.measurements.floorToBust - 8;
    for (let y = form.measurements.floorToWaist + 4; y < fadeTop; y += 1) {
      const here = bodice.filter(([, py]) => Math.abs(py - y) < 0.9).map(([x]) => Math.abs(x));
      if (!here.length) continue;
      const torso = (() => {
        const rings = form.rings;
        const yy = y * form.scale;
        for (let i = 0; i < rings.length - 1; i++) {
          if (yy <= rings[i + 1].y) {
            const t = (yy - rings[i].y) / (rings[i + 1].y - rings[i].y);
            return (rings[i].rx + (rings[i + 1].rx - rings[i].rx) * t) / form.scale;
          }
        }
        return 0;
      })();
      expect(Math.max(...here)).toBeGreaterThanOrEqual(torso - 1e-6);
    }
  });

  it('is concave — it scoops in before flaring to the underarm', () => {
    // A monotonic sweep from strap to underarm gives a wedge, not an armhole.
    const shoulderY = form.measurements.floorToShoulder;
    const armholeY = shoulderY - GARMENT_SPEC.chupa.armholeDrop;
    const side = named(flat, 'bodiceUnder').outline
      .filter(([x, y]) => x > 0 && y > armholeY && y < shoulderY - 3)
      .sort((a, b) => b[1] - a[1]);
    const xs = side.map(([x]) => x);
    expect(xs.length).toBeGreaterThan(4);
    // Somewhere along it the edge comes back inside both of its endpoints.
    expect(Math.min(...xs)).toBeLessThan(Math.min(xs[0], xs[xs.length - 1]) - 0.2);
  });
});
