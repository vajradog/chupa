/**
 * Phase 3: the chupa shell.
 *
 * Acceptance is "a recognizable Ü-Tsang chupa stands on the mannequin and moves
 * like cloth", which is a thing you look at. What is testable is everything that
 * would make the look wrong: the pieces existing, the pinned ones staying pinned,
 * the gather being real, the front pieces being on the front, and the whole thing
 * fitting the particle budget.
 */

import { describe, expect, it } from 'vitest';
import { MEASUREMENTS, bakeSdf, buildForm, createSdfCollider } from '@chupa/body';
import { FABRICS, createSolver, step } from '@chupa/cloth';
import {
  GARMENT_SPEC,
  buildChupa,
  composeColliders,
  createSkirtCollider,
  expandStripeProgram,
  isFullyPinned,
  parseGarmentSpec,
  pieceNamed,
  totalParticles,
} from '@chupa/garment';

const form = buildForm();
const chupa = buildChupa(form);

describe('spec loading', () => {
  it('reads the finished-garment proportions', () => {
    expect(GARMENT_SPEC.sleeveless).toBe(true);
    expect(GARMENT_SPEC.chupa.hemFlare).toBeGreaterThan(1);
    expect(GARMENT_SPEC.chupa.waistGatherRatio).toBeGreaterThanOrEqual(1);
    expect(GARMENT_SPEC.pangden.stripeProgram.length).toBeGreaterThan(0);
  });

  it('rejects a spec missing a number', () => {
    expect(() =>
      parseGarmentSpec({ chupa: {}, honju: {}, pangden: { stripeProgram: 'R1' } }),
    ).toThrow(/hemFromFloor/);
  });

  it('rejects a pangden with no stripe program', () => {
    expect(() =>
      parseGarmentSpec({ chupa: GARMENT_SPEC.chupa, honju: GARMENT_SPEC.honju, pangden: { width: 1, length: 1 } }),
    ).toThrow(/stripeProgram/);
  });

  it('expands a stripe program to one colour per row', () => {
    expect(expandStripeProgram('R2 K1', 5)).toEqual(['R', 'R', 'K', 'R', 'R']);
    expect(expandStripeProgram('R3 K1 Y2', 40)).toHaveLength(40);
  });
});

describe('the garment', () => {
  it('has every piece the design calls for, and no sleeves of its own', () => {
    const names = chupa.pieces.map((p) => p.name).sort();
    expect(names).toEqual([
      'bodice', 'collarLeft', 'collarRight', 'pangden', 'sash',
      'shoulderLeft', 'shoulderRight', 'skirt', 'sleeveLeft', 'sleeveRight', 'wrap',
    ]);
    // The shawl collar belongs to the honju and takes the honju's colour — it is
    // the feature that makes the outfit read as Tibetan at a glance.
    expect(pieceNamed(chupa, 'collarLeft').garment).toBe('honju');
    expect(pieceNamed(chupa, 'collarRight').garment).toBe('honju');
    // The only sleeves belong to the honju — decision 7.
    for (const n of ['sleeveLeft', 'sleeveRight'] as const) {
      expect(pieceNamed(chupa, n).garment).toBe('honju');
    }
  });

  it('pins the belted bodice, the straps and the sleeves entirely', () => {
    for (const piece of chupa.pieces) {
      if (piece.live) continue;
      expect(isFullyPinned(piece.cloth.particles)).toBe(true);
    }
  });

  it('simulates only the skirt and the pangden', () => {
    const live = chupa.pieces.filter((p) => p.live).map((p) => p.name).sort();
    expect(live).toEqual(['pangden', 'skirt']);
  });

  it('stays well inside the 15k particle budget', () => {
    expect(chupa.liveParticles).toBeGreaterThan(1000);
    expect(chupa.liveParticles).toBeLessThan(15000);
    expect(totalParticles(chupa)).toBeLessThan(15000);
  });

  it('makes the skirt a closed tube — no split seam down the side', () => {
    expect(pieceNamed(chupa, 'skirt').cloth.options.closed).toBe(true);
    expect(pieceNamed(chupa, 'bodice').cloth.options.closed).toBe(true);
  });

  it('keeps the skirt a column — the hem barely wider than the waist', () => {
    // Thupten's drawing and the navy reference garment both measure the hem at
    // about 1.15x the sash, on straight side edges. The child's chupa read 1.8
    // because children's garments flare; generalising it to the adult was wrong.
    const skirt = pieceNamed(chupa, 'skirt').cloth;
    const p = skirt.particles;
    const widthAtRow = (r: number) => {
      let w = 0;
      for (let c = 0; c < skirt.cols; c++) w = Math.max(w, Math.abs(p.px[r * skirt.cols + c]));
      return w;
    };
    const atWaist = widthAtRow(0);
    const atHem = widthAtRow(skirt.rows - 1);
    // hemFlare is Thupten's dial, so this does not pin a ratio — it checks the
    // build follows the cut he set, and that the cut stays in adult territory.
    // The child's 1.8 is the number this exists to keep out.
    expect(GARMENT_SPEC.chupa.hemFlare).toBeLessThan(1.6);
    expect(atHem).toBeGreaterThan(atWaist);
    // The seat can push the hem wider than the cut, never narrower.
    expect(atHem / atWaist).toBeGreaterThanOrEqual(
      Math.min(GARMENT_SPEC.chupa.hemFlare, 1) - 1e-6,
    );
    expect(atHem / atWaist).toBeLessThan(GARMENT_SPEC.chupa.hemFlare * 1.1);
    // Opening steadily, and never narrowing: straight side edges, no taper to
    // the ankles and no barrel at the hip. The tolerance is a millimetre because
    // this profile is now SOLVED — a settled chain of particles carries a little
    // numerical ripple, and a millimetre of that is not a taper.
    for (let r = 1; r < skirt.rows; r++) {
      expect(widthAtRow(r)).toBeGreaterThanOrEqual(widthAtRow(r - 1) - 0.05);
    }
  });

  it('clears the seat, where the flare has barely opened yet', () => {
    // The cone is narrow just below the waist but the hip is the widest thing
    // the skirt has to get past, so the cut is floored by the body there.
    const skirt = pieceNamed(chupa, 'skirt').cloth;
    const p = skirt.particles;
    const hipY = form.levelOf('hip');
    let rowAtHip = 0;
    for (let r = 0; r < skirt.rows; r++) {
      if (p.py[r * skirt.cols] >= hipY) rowAtHip = r;
    }
    const hipRadius = (MEASUREMENTS.hipCircumference / (2 * Math.PI)) * form.scale;
    let widest = 0;
    for (let c = 0; c < skirt.cols; c++) {
      widest = Math.max(widest, Math.abs(p.px[rowAtHip * skirt.cols + c]));
    }
    expect(widest).toBeGreaterThan(hipRadius);
  });

  it('crosses the fold shallow at the front and keeps the back high', () => {
    const shoulderY = form.levelOf('shoulder');
    const front = chupa.topEdgeY(-Math.PI / 2);
    const back = chupa.topEdgeY(Math.PI / 2);
    const side = chupa.topEdgeY(0);
    expect(front).toBeLessThan(back);
    expect(side).toBeLessThan(back);
    // How deep the fold crosses is a dialled number now — it is a slider on the
    // flat page and lands wherever Thupten sets it — so this asserts the
    // structure rather than a depth. It must clear the sash (the collar has to
    // cross above it, guarded separately) and must not sit up at the neck.
    expect(front).toBeGreaterThan(chupa.waistY + 2);
    expect(front).toBeLessThan(shoulderY - 6 * form.scale);
    expect(back).toBeGreaterThan(shoulderY - 3);
  });

  it('hangs the skirt from the waist to the measured hem', () => {
    const skirt = pieceNamed(chupa, 'skirt').cloth;
    const p = skirt.particles;
    const topY = p.py[0];
    const bottomY = p.py[(skirt.rows - 1) * skirt.cols];
    expect(topY).toBeCloseTo(form.levelOf('waist'), 5);
    expect(bottomY).toBeCloseTo(GARMENT_SPEC.chupa.hemFromFloor * form.scale, 5);
    // Ankle length: the hem clears the floor but covers the ankle.
    expect(bottomY).toBeLessThan(form.levelOf('ankle') + 2);
    expect(bottomY).toBeGreaterThan(0);
  });

  it('pins the skirt only at the waist, so the rest can swing', () => {
    const skirt = pieceNamed(chupa, 'skirt').cloth;
    const p = skirt.particles;
    for (let c = 0; c < skirt.cols; c++) expect(p.pinned[c]).toBe(1);
    for (let c = 0; c < skirt.cols; c++) expect(p.pinned[skirt.cols + c]).toBe(0);
  });

  it('puts the pangden and the wrap on her front', () => {
    // The camera looks along +Z, so the front of the figure is -Z. Getting this
    // backwards hides both pieces behind the skirt and is invisible in the numbers.
    for (const name of ['pangden', 'wrap'] as const) {
      const p = pieceNamed(chupa, name).cloth.particles;
      let sumZ = 0;
      for (let i = 0; i < p.count; i++) sumZ += p.pz[i];
      expect(sumZ / p.count).toBeLessThan(0);
    }
  });

  it('lays the wearer\'s left panel over the right, so the edge falls to screen-left', () => {
    // Thupten's drawing: the visible wrap edge is a long diagonal from the upper
    // right down to the lower left. The panel on top therefore starts high on
    // screen-right (+X, the wearer's left) and descends to the sash at -X.
    const wrap = pieceNamed(chupa, 'wrap').cloth;
    const p = wrap.particles;
    // Sampled INSIDE the fold's span, not at the panel's extreme columns: out at
    // the sides the armhole cuts the edge down on both sides equally, so the
    // extremes say nothing about which way the fold runs.
    const at = (f: number) => p.py[Math.round((wrap.cols - 1) * f)];
    expect(at(0.75)).toBeGreaterThan(at(0.25));
    // And the fold descends as it crosses — it is not level.
    expect(at(0.75) - at(0.25)).toBeGreaterThan(1);
  });

  it('crosses the two wrap edges at the point of the V', () => {
    // The bodice underneath carries the mirrored edge; where they meet is the V.
    const wrap = pieceNamed(chupa, 'wrap').cloth;
    // An even column count means no column sits exactly on centre front, so this
    // is the nearest one — within half a segment of the crossing.
    const wrapAtCentre = wrap.particles.py[Math.floor(wrap.cols / 2)];
    expect(Math.abs(wrapAtCentre - chupa.topEdgeY(-Math.PI / 2))).toBeLessThan(0.5);
  });

  it('does not make the collar a V — the over band crosses to the far side', () => {
    // Thupten, on the navy reference: "it doesn't go V shape". The under band
    // comes down from its shoulder and stops at the crossing; the over band
    // turns there and runs on under the bust to the last rib. Mirroring them
    // gives a V, which is the thing that reads wrong.
    const spread = (name: 'collarLeft' | 'collarRight') => {
      const p = pieceNamed(chupa, name).cloth.particles;
      let loX = Infinity;
      let hiX = -Infinity;
      let loY = Infinity;
      for (let i = 0; i < p.count; i++) {
        loX = Math.min(loX, p.px[i]);
        hiX = Math.max(hiX, p.px[i]);
        loY = Math.min(loY, p.py[i]);
      }
      return { loX, hiX, loY };
    };
    const over = spread('collarLeft');
    const under = spread('collarRight');
    // The under band stays on its own side of centre and stops at the crossing.
    expect(under.hiX).toBeLessThan(1);
    expect(under.loY).toBeGreaterThan(chupa.waistY + 2);
    // The over band starts on the far shoulder, crosses centre, and carries on
    // down to the side seam at the sash. Comparing x alone will not show this —
    // the body's ellipse squashes x near the side, so both bands bottom out at
    // about the same place. The descent is what distinguishes them.
    expect(over.hiX).toBeGreaterThan(0);
    expect(over.loX).toBeLessThan(0);
    expect(over.loY).toBeLessThan(under.loY - 2);
  });

  it('leaves the collar room to cross above the sash', () => {
    // The over band turns at the V and runs horizontally out to the side. Set
    // the V deeper than this and that run is crushed into the sash.
    const vY = chupa.topEdgeY(-Math.PI / 2);
    const collarWidth = GARMENT_SPEC.honju.collarWidth * form.scale;
    expect(vY - chupa.waistY).toBeGreaterThan(collarWidth * 0.5);
  });

  it('can be built without the pangden', () => {
    const plain = buildChupa(form, { pangden: false });
    expect(plain.pieces.some((p) => p.name === 'pangden')).toBe(false);
    expect(plain.liveParticles).toBeLessThan(chupa.liveParticles);
  });

  it('names an unknown piece in the error', () => {
    // @ts-expect-error deliberately wrong name
    expect(() => pieceNamed(chupa, 'collar')).toThrow(/collar/);
  });
});

describe('it moves like cloth', () => {
  const grid = bakeSdf(form.sdf, form.bounds, { cell: 0.5 });
  const body = createSdfCollider(grid, { margin: grid.cell * 0.5, friction: 0.6 });

  function settled(fabricKey: string, steps = 900) {
    const dressed = buildChupa(form);
    const panels = composeColliders(body, createSkirtCollider(dressed, { margin: 1.0 }));
    const solvers = dressed.pieces
      .filter((p) => p.live)
      .map((p) =>
        createSolver({
          cloth: p.cloth,
          fabric: FABRICS[fabricKey],
          collider: p.name === 'skirt' ? body : panels,
        }),
      );
    for (let i = 0; i < steps; i++) for (const s of solvers) step(s);
    return dressed;
  }

  it('keeps the skirt hanging from the waist and off the floor', () => {
    const dressed = settled('cotton');
    const skirt = pieceNamed(dressed, 'skirt').cloth;
    const p = skirt.particles;
    let lowest = Infinity;
    for (let i = 0; i < p.count; i++) lowest = Math.min(lowest, p.py[i]);
    expect(lowest).toBeGreaterThan(-2);
    // The waist row is pinned, so it cannot have moved at all.
    expect(p.py[0]).toBeCloseTo(form.levelOf('waist'), 5);
  });

  it('does not let the skirt collapse inside the figure', () => {
    const dressed = settled('cotton');
    const skirt = pieceNamed(dressed, 'skirt').cloth;
    const p = skirt.particles;
    const hip = form.rings.find((r) => r.name === 'hip')!;
    let widest = 0;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.py[i] - hip.y) < 1) widest = Math.max(widest, Math.abs(p.px[i]));
    }
    expect(widest).toBeGreaterThan(hip.rx);
  });

  it('keeps the pangden outside the skirt where it can be seen', () => {
    const dressed = settled('cotton');
    const skirt = pieceNamed(dressed, 'skirt').cloth.particles;
    const pangden = pieceNamed(dressed, 'pangden').cloth.particles;
    const frontDepth = (p: typeof skirt, y: number) => {
      let front = 0;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.py[i] - y) < 1.5 && Math.abs(p.px[i]) < 1.5) front = Math.min(front, p.pz[i]);
      }
      return front;
    };
    // Front is -Z, so "outside" means more negative.
    expect(frontDepth(pangden, 30)).toBeLessThan(frontDepth(skirt, 30));
  });

  it('nambu wool hangs stiller than silk brocade', () => {
    const motion = (key: string) => {
      const dressed = settled(key, 1200);
      const p = pieceNamed(dressed, 'skirt').cloth.particles;
      let sum = 0;
      for (let i = 0; i < p.count; i++) {
        sum += Math.abs(p.px[i] - p.ox[i]) + Math.abs(p.py[i] - p.oy[i]) + Math.abs(p.pz[i] - p.oz[i]);
      }
      return sum / p.count;
    };
    expect(motion('wool')).toBeLessThan(motion('silk'));
  });
});
