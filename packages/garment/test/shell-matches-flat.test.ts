/**
 * THE SHELL MUST BE THE DRAWING.
 *
 * The front elevation is what gets looked at and approved on /dev/flat/. The 3D
 * shell is that elevation wrapped onto the body — it is not a second opinion
 * about the garment.
 *
 * It used to be exactly that: `flat.ts` and `chupa.ts` each described the cut,
 * and a correction made to one could quietly miss the other. The collar was
 * fixed twice, separately, and nothing would have said if the two had ended up
 * different. This is the check that says.
 *
 * If it fails, the shell has drifted from the drawing that was signed off — the
 * drawing is right and the shell is wrong.
 */

import { describe, expect, it } from 'vitest';
import { buildForm } from '@chupa/body';
import { FABRICS } from '@chupa/cloth';
import { buildChupa, buildFlatChupa, pieceNamed } from '@chupa/garment';
import type { GarmentSpec } from '@chupa/garment';
import { GARMENT_SPEC } from '@chupa/garment';

const form = buildForm();
const cm = form.scale;

/**
 * Widest point of a 3D piece at a height, in centimetres — its contribution to
 * the front silhouette. A tube's widest point in x IS the elevation's half-width,
 * which is what makes the two directly comparable.
 */
function shellHalfAt(name: 'skirt' | 'bodice', yCm: number, band = 2): number | null {
  const { cloth } = pieceNamed(buildChupa(form), name);
  const p = cloth.particles;
  let widest = -Infinity;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.py[i] / cm - yCm) > band) continue;
    widest = Math.max(widest, Math.abs(p.px[i]) / cm);
  }
  return widest === -Infinity ? null : widest;
}

describe('the shell is the elevation, wrapped', () => {
  it('matches the drawing down the whole skirt', () => {
    const flat = buildFlatChupa(form).profile;
    const hem = GARMENT_SPEC.chupa.hemFromFloor;
    const waist = form.measurements.floorToWaist;
    let checked = 0;
    for (let y = hem + 4; y < waist - 4; y += 4) {
      const shell = shellHalfAt('skirt', y);
      if (shell === null) continue;
      checked++;
      // Half a centimetre. The shell samples rows at its own spacing, so it can
      // land either side of the drawing's curve — but it cannot be a different
      // garment.
      expect(Math.abs(shell - flat.halfAt(y))).toBeLessThan(0.5);
    }
    expect(checked).toBeGreaterThan(8);
  });

  it('matches the drawing across the bodice, below the armhole', () => {
    // Only below the underarm. Above it the tube is cut away for the armhole, so
    // the widest cloth at a height sits at some bearing round the side rather
    // than at the ellipse's widest point — the shell is legitimately narrower
    // there than the elevation, and the shoulder is built from its own panels
    // anyway. Comparing up there measures the armhole, not agreement.
    const flat = buildFlatChupa(form).profile;
    const { cloth } = pieceNamed(buildChupa(form), 'bodice');
    const p = cloth.particles;
    let widest = -Infinity;
    let widestFlat = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const y = p.py[i] / cm;
      const x = Math.abs(p.px[i]) / cm;
      // No point of the bodice may sit outside the drawn silhouette.
      expect(x).toBeLessThanOrEqual(flat.halfAt(y) + 0.05);
      widest = Math.max(widest, x);
      widestFlat = Math.max(widestFlat, flat.halfAt(y));
    }
    // And it reaches it: the tube is as wide as the drawing where it is complete.
    expect(widest).toBeGreaterThan(widestFlat - 0.5);
  });

  it('follows the drawing when the cut is changed, not its own idea of it', () => {
    // The real test of one-description: move a number and BOTH must move. A
    // shell carrying its own copy of the cut would sit still here.
    const wide: GarmentSpec = {
      ...GARMENT_SPEC,
      chupa: { ...GARMENT_SPEC.chupa, hemFlare: 1.9 },
    };
    const flatWide = buildFlatChupa(form, wide).profile;
    const { cloth } = pieceNamed(buildChupa(form, { spec: wide }), 'skirt');
    const p = cloth.particles;
    let hemWidest = 0;
    for (let c = 0; c < cloth.cols; c++) {
      hemWidest = Math.max(hemWidest, Math.abs(p.px[(cloth.rows - 1) * cloth.cols + c]) / cm);
    }
    const hemY = p.py[(cloth.rows - 1) * cloth.cols] / cm;
    expect(Math.abs(hemWidest - flatWide.halfAt(hemY))).toBeLessThan(0.5);
    // And it really did get wider than the default cut, so this is not vacuous.
    expect(hemWidest).toBeGreaterThan(buildFlatChupa(form).profile.halfAt(hemY) + 0.5);
  });

  it('takes the fold from the drawing, at the same height', () => {
    const flat = buildFlatChupa(form).profile;
    const { cloth } = pieceNamed(buildChupa(form), 'wrap');
    const p = cloth.particles;
    // Row 0 is the fold. Every point of it should sit on the drawn curve.
    let compared = 0;
    for (let c = 0; c < cloth.cols; c++) {
      const x = p.px[c] / cm;
      if (x < Math.min(flat.foldFromX, flat.foldToX) + 1) continue;
      if (x > Math.max(flat.foldFromX, flat.foldToX) - 1) continue;
      compared++;
      expect(Math.abs(p.py[c] / cm - flat.foldYAt(x, 1))).toBeLessThan(2);
    }
    expect(compared).toBeGreaterThan(4);
  });

  it('does NOT change the outline when the cloth changes — the cut governs', () => {
    // Recorded deliberately. A smooth skirt carries no surplus, so every ring of
    // it is a fixed circumference: it cannot stretch wider than the cut and it
    // cannot go narrower without folding, which is the gathered case. Weight
    // shows on this garment in FOLDS, not in the silhouette. An earlier build
    // let the fabric set the width and it was simply wrong.
    const light = buildFlatChupa(form, GARMENT_SPEC, FABRICS.georgette).profile;
    const heavy = buildFlatChupa(form, GARMENT_SPEC, FABRICS.melton).profile;
    const hem = GARMENT_SPEC.chupa.hemFromFloor + 6;
    expect(light.halfAt(hem)).toBeCloseTo(heavy.halfAt(hem), 6);
  });
});
