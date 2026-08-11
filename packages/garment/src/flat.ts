/**
 * The chupa as a front elevation — the garment as a drawing, in centimetres.
 *
 * This exists because the 3D shell was being authored blind. The silhouette is
 * fixed and the figure never turns, so the front elevation is a *complete*
 * description of the garment: get this drawing right and the shell is only that
 * drawing wrapped onto the body. Get it wrong and no amount of 3D work helps.
 *
 * Everything here is derived from `pattern/panels.json` plus the mannequin's own
 * widths. Nothing is hand-placed, so correcting a number in the spec moves the
 * drawing and the shell together.
 *
 * Coordinates: x from the centreline, y up from the floor, both in centimetres.
 * Screen +x is the wearer's LEFT, because we are looking at her.
 */

import type { Form } from '@chupa/body';
import type { Fabric } from '@chupa/cloth';
import { FABRICS } from '@chupa/cloth';
import type { GarmentSpec } from './spec.js';
import { GARMENT_SPEC } from './spec.js';

/**
 * Two cloths, and only two. The collar is the honju's own neckline folded out
 * over the chupa, and the sleeve end is the honju turned back on itself — a
 * fold-up, not a cuff. A contrast cuff is a modern idea and this garment does
 * not have one, so there is no third slot for it to live in.
 */
export type FlatGarment = 'chupa' | 'honju';

export interface FlatRegion {
  readonly name: string;
  readonly garment: FlatGarment;
  /** Closed outline in cm. */
  readonly outline: readonly (readonly [number, number])[];
  /** Painter's order, low first. */
  readonly layer: number;
}

/** A visible edge that is not a silhouette — the wrap edge, the sash seams. */
export interface FlatSeam {
  readonly name: string;
  readonly path: readonly (readonly [number, number])[];
  readonly layer: number;
  /** Topstitching rather than a construction edge — drawn as a fine dashed line. */
  readonly stitch?: boolean;
}

/**
 * The curves behind the drawing, so the 3D shell can be built FROM the elevation
 * instead of describing the garment a second time.
 *
 * Two descriptions of one garment is how the shell drifted from the drawing
 * before: a correction would be made here and then made again, differently, over
 * there. Everything the shell needs to know about the cut comes through this.
 * All centimetres.
 */
export interface FlatProfile {
  /** Front half-width of the chupa at a height — the silhouette. */
  halfAt(y: number): number;
  /**
   * Height of a wrap fold at a horizontal position. `side` is +1 for the panel
   * that lies on top (starting at screen right) and -1 for the one beneath.
   */
  foldYAt(x: number, side: 1 | -1): number;
  /** Where the fold starts and ends, so callers need not re-derive it. */
  readonly foldFromX: number;
  readonly foldToX: number;
}

export interface FlatChupa {
  readonly regions: readonly FlatRegion[];
  readonly seams: readonly FlatSeam[];
  readonly landmarks: Readonly<Record<string, number>>;
  readonly profile: FlatProfile;
}

type P = readonly [number, number];

/**
 * Shift a polyline sideways by `dist`, perpendicular to itself at every point.
 * Offsetting in y instead collapses to nothing wherever the line runs steeply,
 * which is most of a neckline.
 */
function offsetPolyline(spine: readonly P[], dist: number): P[] {
  return spine.map((pt, i) => {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(spine.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [pt[0] + (-dy * dist) / len, pt[1] + (dx * dist) / len] as P;
  });
}

/** Body half-width at a height, in cm, interpolated between the measured rings. */
function bodyHalfWidth(form: Form, yCm: number): number {
  const rings = form.rings;
  const y = yCm * form.scale;
  if (y <= rings[0].y) return rings[0].rx / form.scale;
  const last = rings[rings.length - 1];
  if (y >= last.y) return last.rx / form.scale;
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      return (a.rx + (b.rx - a.rx) * t) / form.scale;
    }
  }
  return last.rx / form.scale;
}

export function buildFlatChupa(
  form: Form,
  spec: GarmentSpec = GARMENT_SPEC,
  fabric: Fabric = FABRICS.silk,
): FlatChupa {
  const { chupa: c, honju: h } = spec;
  const m = form.measurements;

  // --- Landmarks -----------------------------------------------------------
  const shoulderY = m.floorToShoulder;
  const hemY = c.hemFromFloor;
  const sashMidY = m.floorToWaist;
  const sashTopY = sashMidY + c.sashWidth / 2;
  const sashBotY = sashMidY - c.sashWidth / 2;
  const vNeckY = shoulderY - c.vNeckDrop;
  const armholeY = shoulderY - c.armholeDrop;

  const neckHalf = c.necklineWidth / 2;
  const strapOuter = neckHalf + c.shoulderPanelWidth;
  const shoulderPoint = m.shoulderWidth / 2;

  // The chupa's own side, height by height: it follows the body with ease, and
  // below the waist opens on the straight cut edge of the A — barely, on the
  // adult, and never inside the seat.
  const halfAtWaist = bodyHalfWidth(form, sashMidY) + c.bodiceEase;
  /**
   * THE SILHOUETTE OF A SMOOTH SKIRT IS THE CUT, NOT THE DRAPE.
   *
   * This ran a hanging solve here and let the fabric decide the width. That was
   * wrong, and worth writing down so it is not tried again: this skirt carries
   * no surplus (waistGatherRatio is 1), so every horizontal ring of it is a
   * fixed circumference of cloth. Cloth does not stretch, so the ring cannot go
   * wider than the cut; and it cannot go narrower either without FOLDING, and
   * folding is the gathered case, which this garment is not.
   *
   * So weight does not change this outline. Where weight shows on a smooth
   * A-line is in the folds — how many, how deep — which is a buckling problem
   * and is not solved here yet. `solveHang` is kept and tested because it is
   * right for a panel that hangs freely; it is simply not what governs this.
   */
  /**
   * Widest the body gets between the sash and this height — cloth hanging off
   * the seat does not come back in under it.
   *
   * Computed from y, NOT accumulated. It used to be a running maximum that only
   * ever grew, which was fine while it was called once per row top-to-bottom and
   * silently wrong the moment it was exposed for the shell to sample: the same
   * height gave different answers depending on what had been asked before.
   */
  const heldBodyHalf = (y: number) => {
    let widest = 0;
    const from = Math.max(y, hemY);
    for (let s = from; s <= sashBotY; s += 1.5) widest = Math.max(widest, bodyHalfWidth(form, s));
    return Math.max(widest, bodyHalfWidth(form, from));
  };
  const skirtHalfAt = (y: number) => {
    const t = Math.max(0, Math.min(1, (sashBotY - y) / (sashBotY - hemY)));
    const cone = halfAtWaist * (1 + (c.hemFlare - 1) * t);
    return Math.max(cone, heldBodyHalf(y) + c.skirtEase);
  };
  // The underarm: where the armhole meets the side seam, at the side of the
  // ribcage. A normal sleeveless armhole — Thupten's technical flat and the
  // orange chupa both show an ordinary curved armhole, NOT a dropped one.
  // A deep armhole can be dialled below the top of the sash, at which point
  // there is no side seam left between them — clamp so the interpolation below
  // never divides by a negative span.
  const underarmY = Math.max(armholeY, sashTopY + 0.5);
  const underarmHalf = bodyHalfWidth(form, underarmY) + c.bodiceEase;
  // THE SHOULDER SEAM SLOPES. A drafted shoulder falls 20-23 degrees from the
  // neck point out to the shoulder point — it is not a horizontal line, and a
  // flat-topped strap is the main reason this read as a cut-out rather than a
  // garment. Taking the angle rather than a fixed drop keeps it right when the
  // strap width changes.
  const shoulderPointY = shoulderY - c.shoulderPanelWidth * Math.tan(
    (c.shoulderSlopeDeg * Math.PI) / 180,
  );

  const bodiceHalfAt = (y: number) => {
    if (y >= shoulderPointY) {
      // On the shoulder seam itself, running down and out from the neck point.
      const t = Math.max(0, Math.min(1, (shoulderY - y) / (shoulderY - shoulderPointY || 1)));
      return neckHalf + (strapOuter - neckHalf) * t;
    }
    if (y >= underarmY) {
      // ABOVE THE UNDERARM THERE IS NO BODY FLOOR. An armhole is exactly the
      // place where the garment is narrower than the body — the strap lies over
      // the top of the shoulder and the arm is outside the cloth, not under it.
      //
      // The armhole is CONCAVE, as it is drafted: it leaves the shoulder point
      // scooping inward, bottoms out, then flares to the underarm. A monotonic
      // sweep between the two gives a wedge, not an armhole.
      const t = Math.max(0, Math.min(1, (shoulderPointY - y) / (shoulderPointY - underarmY)));
      const along = strapOuter + (underarmHalf - strapOuter) * (t * t * (3 - 2 * t));
      const cut = along - c.armholeScoop * Math.sin(Math.PI * t);
      // The armhole may cut inside the SHOULDER — that is where the arm is, not
      // the body. It may not cut inside the RIBCAGE: below the bust the cloth
      // has to cover her. Faded in over the last few centimetres rather than
      // switched on at the bust, because a hard max put an angular notch in the
      // side of the garment exactly where the two rules met.
      const floor = bodyHalfWidth(form, y) + c.bodiceEase;
      const f = Math.max(0, Math.min(1, (m.floorToBust - y) / 8));
      return cut + (Math.max(cut, floor) - cut) * (f * f * (3 - 2 * f));
    }
    // Below the underarm it is the side seam running down to the waist, and HERE
    // the body floor does apply — the cloth wraps her, so it cannot be narrower.
    const t = Math.max(0, Math.min(1, (underarmY - y) / (underarmY - sashTopY)));
    const w = underarmHalf + (halfAtWaist - underarmHalf) * t;
    return Math.max(w, bodyHalfWidth(form, y) + c.bodiceEase);
  };

  // --- The two wrap edges --------------------------------------------------
  // A single smooth sweep, NOT two straight legs meeting in a point. Traced off
  // Thupten 2026-08-10: it leaves the shoulder about two thirds of the way out
  // the strap, sags about 3.5 cm below a straight chord as it crosses the chest,
  // and dies out at the side around the last rib — well above the sash.
  //
  // A quadratic Bézier pinned to pass through the centre-front point at t = 0.5
  // gives exactly that: steep off the shoulder, flattening as it goes.
  const vPoint: P = [0, vNeckY];
  const bezier = (p0: P, mid: P, p2: P, from: number, to: number, steps = 20): P[] => {
    // Control point that forces B(0.5) === mid.
    const c: P = [2 * mid[0] - (p0[0] + p2[0]) / 2, 2 * mid[1] - (p0[1] + p2[1]) / 2];
    const out: P[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = from + (to - from) * (i / steps);
      const u = 1 - t;
      out.push([
        u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0],
        u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1],
      ]);
    }
    return out;
  };

  // Where the fold runs out at the far side. It ends HIGH — Thupten 2026-08-10,
  // marked "A": the fold arriving from the left should reach its highest point
  // there, not carry on down to the waist. Taking it to the sash drew a long
  // low tail across the ribs that the garment does not have.
  // It also stops well INSIDE the side seam — traced off Thupten's line, it dies
  // out around 9 cm from centre, not out at the body's edge.
  const wrapEnd = (side: 1 | -1): P => {
    const y = shoulderY - c.wrapEndDrop;
    // Never past the side seam. Dialled up, wrapEndX ran the fold out beyond the
    // bodice's own edge and left a spur of cloth hanging off the waist.
    return [-side * Math.min(c.wrapEndX, bodiceHalfAt(y)), y];
  };
  /**
   * The chupa's cut edge — and the TOP of the collar, which is the same line.
   * The honju's collar comes up from underneath, folds over this edge, and lies
   * down the outside of the chupa. So the fold IS the chupa's edge: the band
   * hangs below it and nothing of the chupa shows above it.
   */
  const wrapEdge = (side: 1 | -1, from: number, to: number) =>
    bezier([side * neckHalf, shoulderY], vPoint, wrapEnd(side), from, to);

  // --- Skirt ---------------------------------------------------------------
  const SKIRT_STEPS = 24;
  const skirtRight: P[] = [];
  const skirtLeft: P[] = [];
  for (let i = 0; i <= SKIRT_STEPS; i++) {
    const y = sashBotY + (hemY - sashBotY) * (i / SKIRT_STEPS);
    const half = skirtHalfAt(y);
    skirtRight.push([half, y]);
    skirtLeft.push([-half, y]);
  }
  /**
   * THICK CLOTH CANNOT TURN A TIGHT CORNER. A hem in 2.6mm melton rounds off
   * where the same hem in georgette comes to a point — the fold radius of a
   * cloth is several times its own thickness, and at the hem the cloth turns
   * through ninety degrees.
   *
   * This is the only honest way thickness can show at a figure's scale: drawn
   * literally it is a sixth of a percent of her height and invisible.
   */
  const cornerR = fabric.thickness * 0.8;
  const roundCorner = (pts: P[]): P[] => {
    if (cornerR < 0.15 || pts.length < 3) return pts;
    const out: P[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[i - 1];
      const next = pts[i + 1];
      if (!prev || !next) { out.push(pts[i]); continue; }
      const turn = Math.abs(
        Math.atan2(next[1] - pts[i][1], next[0] - pts[i][0])
        - Math.atan2(pts[i][1] - prev[1], pts[i][0] - prev[0]),
      );
      if (turn < 0.6) { out.push(pts[i]); continue; }
      // Cut the corner off with a short arc of the cloth's own fold radius.
      const back = (a: P, b: P): P => {
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const f = Math.min(0.45, cornerR / d);
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      };
      const a = back(pts[i], prev);
      const b = back(pts[i], next);
      out.push(a);
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        const u = 1 - t;
        out.push([
          u * u * a[0] + 2 * u * t * pts[i][0] + t * t * b[0],
          u * u * a[1] + 2 * u * t * pts[i][1] + t * t * b[1],
        ]);
      }
      out.push(b);
    }
    return out;
  };

  const skirt: FlatRegion = {
    name: 'skirt',
    garment: 'chupa',
    outline: roundCorner([...skirtRight, ...skirtLeft.slice().reverse()]),
    layer: 20,
  };

  // --- Bodice --------------------------------------------------------------
  /**
   * Sample the side zone by zone. Uniform sampling in y would give the sloping
   * shoulder seam a single point — it spans only a couple of centimetres of
   * height while the armhole and side seam span thirty.
   */
  const bodiceSide = (side: 1 | -1): P[] => {
    const pts: P[] = [];
    const run = (fromY: number, toY: number, steps: number, skipFirst: boolean) => {
      for (let i = skipFirst ? 1 : 0; i <= steps; i++) {
        const y = fromY + (toY - fromY) * (i / steps);
        pts.push([side * bodiceHalfAt(y), y]);
      }
    };
    run(shoulderY, shoulderPointY, 4, false);
    run(shoulderPointY, underarmY, 16, true);
    run(underarmY, sashTopY, 6, true);
    return pts;
  };
  // The front is TWO PANELS, not one shape with a V cut in it. The under panel
  // is the whole bodice; the over panel lies on top of it and its fold edge —
  // the long diagonal sweeping down across the chest — is the defining line of
  // the garment. Drawing only the V left that diagonal unrepresented, which is
  // why it vanished the moment the collar was not covering it.
  const bodiceUnder: FlatRegion = {
    name: 'bodiceUnder',
    garment: 'chupa',
    // bodiceSide now BEGINS at the neck point and carries the sloping shoulder
    // seam itself, so no corner is added at the strap's outer end. Adding one
    // made the outline double back on itself and the two shoulders came out
    // different shapes.
    outline: [
      ...wrapEdge(-1, 0, 0.5),
      ...wrapEdge(1, 0.5, 0).slice(1),
      ...bodiceSide(1).slice(1),
      ...bodiceSide(-1).slice().reverse(),
    ],
    layer: 30,
  };

  /** Side seam points from a height down to the sash. */
  const sideFrom = (side: 1 | -1, fromY: number): P[] => {
    const pts: P[] = [];
    for (let i = 0; i <= 12; i++) {
      const y = fromY + (sashTopY - fromY) * (i / 12);
      pts.push([side * bodiceHalfAt(y), y]);
    }
    return pts;
  };
  const overEnd = wrapEnd(1);
  const bodiceOver: FlatRegion = {
    name: 'bodiceOver',
    garment: 'chupa',
    outline: [
      // Its fold edge, all the way across.
      ...wrapEdge(1, 0, 1),
      // Down the far side seam to the sash, across, and back up its own side —
      // which carries the same shoulder seam as the panel underneath, so the two
      // shoulders are mirror images.
      ...sideFrom(-1, overEnd[1]),
      ...bodiceSide(1).slice().reverse(),
    ],
    layer: 32,
  };

  // --- Sash ----------------------------------------------------------------
  const sashHalf = halfAtWaist + 0.4;
  const sash: FlatRegion = {
    name: 'sash',
    garment: 'chupa',
    outline: [
      [-sashHalf, sashTopY], [sashHalf, sashTopY],
      [sashHalf, sashBotY], [-sashHalf, sashBotY],
    ],
    layer: 40,
  };

  // --- Honju sleeves -------------------------------------------------------
  // A tube seen head on: its drawn width is the DIAMETER, not half the
  // circumference. Getting that wrong is what made the sleeves enormous.
  const sleeveTopR = (m.upperArmCircumference + 2 * Math.PI * h.sleeveEase) / (2 * Math.PI);
  const cuffR = h.cuffCircumference / (2 * Math.PI);
  const cuffY = shoulderY - h.sleeveLength;
  const armAxisAt = (y: number) => {
    const t = (shoulderY - y) / (shoulderY - cuffY);
    // The arm drifts outboard going down, which is what lets the cuff clear the
    // skirt; at the shoulder it stays well inboard.
    return m.armSeparation + 3.5 * Math.max(0, Math.min(1, t));
  };
  const armRadiusAt = (y: number) => {
    const t = Math.max(0, Math.min(1, (shoulderY - y) / (shoulderY - cuffY)));
    return sleeveTopR + (cuffR - sleeveTopR) * t;
  };

  /**
   * The sleeve follows the ARM — it is the arm's own capsule with the sleeve's
   * ease added, capped round over the shoulder and round at the cuff.
   *
   * It starts at the shoulder, not at the point where it clears the chupa: the
   * honju is worn UNDER the chupa, so the overlap is simply covered (this sits
   * at the bottom of the stack). Starting it lower drew a straight vertical edge
   * where a shoulder should be, and the sleeves read as planks rather than as
   * cloth on an arm.
   */
  const sleeve = (side: 1 | -1): FlatRegion => {
    // THE SHOULDER IS A CURVE. Not a dome centred on the arm (a ball joint) and
    // not a straight diagonal (a coat hanger) — it is the deltoid: it leaves the
    // shoulder tip, bows OUTWARD, and eases into the line of the arm.
    //
    // And it starts BELOW the chupa's shoulder tip. The honju is worn inside the
    // chupa and comes out through the armhole, so there is always a little of
    // the chupa between its shoulder tip and where the sleeve appears. Butting
    // the two together made the honju look stuck onto the outside.
    const axis0 = armAxisAt(shoulderY);
    const r0 = armRadiusAt(shoulderY);
    const slope = Math.tan((c.shoulderSlopeDeg * Math.PI) / 180);
    const capTopY = shoulderY - h.armholeGap;
    // The deltoid's widest point is well DOWN the arm, not at the shoulder. My
    // curve spanned about three centimetres, which at this scale is a corner —
    // Thupten's line runs nearly a hand's length before it straightens.
    const outerTopY = shoulderY - h.deltoidDrop;
    void slope;

    const deltoid: P[] = [];
    {
      // Starts ON the chupa's armhole edge, tucked just inside it — the sleeve
      // comes OUT OF the armhole. Starting it from the arm's own axis built the
      // honju a shoulder of its own, sitting outside and on top of the chupa
      // instead of emerging from under it.
      const p0: P = [bodiceHalfAt(capTopY) - 1.5, capTopY];
      // Control pulled out and high, so the edge leaves the shoulder heading
      // OUTWARD and only then turns down — convex, the way a shoulder is.
      const p1: P = [axis0 + r0 * 1.05, capTopY - h.deltoidDrop * 0.15];
      const p2: P = [armAxisAt(outerTopY) + armRadiusAt(outerTopY), outerTopY];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        deltoid.push([
          side * (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]),
          u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ]);
      }
    }

    const STEPS = 18;
    const outer: P[] = [];
    const inner: P[] = [];
    for (let i = 1; i <= STEPS; i++) {
      const y = outerTopY + (cuffY - outerTopY) * (i / STEPS);
      outer.push([side * (armAxisAt(y) + armRadiusAt(y)), y]);
    }
    for (let i = 0; i <= STEPS; i++) {
      const y = capTopY + (cuffY - capTopY) * (i / STEPS);
      inner.push([side * (armAxisAt(y) - armRadiusAt(y)), y]);
    }
    void axis0; void r0;
    // A STRAIGHT CUT ACROSS. This is a sleeve end — cloth stops where it is cut.
    // It was rounded off like a capsule, which read as a finished tube rather
    // than as a hem.
    const cuffEnd: P[] = [
      [side * (armAxisAt(cuffY) + armRadiusAt(cuffY)), cuffY],
      [side * (armAxisAt(cuffY) - armRadiusAt(cuffY)), cuffY],
    ];
    return {
      name: side > 0 ? 'sleeveLeft' : 'sleeveRight',
      garment: 'honju',
      outline: [
        ...deltoid,
        ...outer,
        ...cuffEnd,
        ...inner.slice().reverse(),
      ],
      layer: 10, // behind the chupa
    };
  };

  // --- Honju shawl collar --------------------------------------------------
  // A band straddling each wrap edge: half of it stands above against the neck,
  // half lies down over the chupa. The over side follows its edge well past
  // centre, down the long diagonal; the under side stops at the V.
  const band = (spine: P[], side: 1 | -1, name: string, layer: number): FlatRegion => {
    const w = side * h.collarWidth;
    // Thicken the spine PERPENDICULAR to itself. Offsetting in y instead
    // collapses the band to nothing wherever the edge runs steeply — which is
    // most of the neckline.
    return {
      name, garment: 'honju',
      // Hangs entirely to the inside of the spine — the spine is the fold.
      outline: [...spine, ...offsetPolyline(spine, w).slice().reverse()],
      layer,
    };
  };

  // The chupa's own band along the wrap edge, in its own cloth. This is the
  // chupa's, not the honju's: it is there whether or not a collar sits over it.
  const wrapBand = (side: 1 | -1, to: number, width: number, name: string, layer: number):
  FlatRegion => {
    const spine = wrapEdge(side, 0, to);
    // The perpendicular flips with the direction of travel, so the offset has to
    // be signed by `side`. Unsigned, the back band was laid on the wrong side of
    // its own fold — up into the neck opening rather than down onto the cloth —
    // which ate into that shoulder and made the two straps different widths.
    const inner = offsetPolyline(spine, side * width);
    // The band is part of the chupa and it is STITCHED IN, so where it meets the
    // shoulder it is cut ON the shoulder seam — not square to its own direction.
    // Capping it perpendicular left a notch between the band and the shoulder.
    const dx = side * (strapOuter - neckHalf);
    const dy = shoulderPointY - shoulderY;
    const len = Math.hypot(dx, dy) || 1;
    inner[0] = [side * neckHalf + (dx / len) * width, shoulderY + (dy / len) * width];
    return {
      name, garment: 'chupa',
      outline: [...spine, ...inner.slice().reverse()],
      layer,
    };
  };

  const regions: FlatRegion[] = [
    sleeve(1), sleeve(-1),
    skirt, bodiceUnder, bodiceOver, sash,
    wrapBand(1, 1, c.wrapBandWidth, 'wrapBand', 34),
    // The same band finishes the back panel's edge. It runs to the crossing and
    // stops, because past that the front panel is lying over it.
    wrapBand(-1, 0.5, c.wrapBandWidth, 'wrapBandBack', 31),
    // NOT a V. The two bands are not mirror images, and that asymmetry is the
    // whole look. The under side comes down from its shoulder and stops at the
    // crossing. The over side comes down from the opposite shoulder, turns at
    // the crossing, and runs on almost horizontally — under the bust, out to the
    // last rib at the side seam. Stopping it at the crossing makes a V, which
    // is what the reference garment does not do.
    // The under band stops just short of the crossing so its end tucks beneath
    // the over band rather than poking out from under it.
    // BENEATH the chupa's over panel (32), not above it. The collar comes out
    // from under the chupa and folds back over it, so its far end goes back
    // under and is never seen — drawn on top, the end stuck out as a blunt cut
    // across the chest.
    band(wrapEdge(-1, 0, c.collarUnderReach), -1, 'collarRight', 31),
    band(wrapEdge(1, 0, c.collarReach), 1, 'collarLeft', 52),
  ];

  // The chupa's double stitch is real — two rows of topstitching set in from the
  // wrap edge — but it is NOT drawn. At this scale it reads as a hard line and
  // competes with the fold itself; Thupten's note about it was explaining what
  // that line in the photograph is, not asking for it on the drawing. Kept in
  // the spec so Phase 5 can put it back as a shading detail rather than a line.
  const seams: FlatSeam[] = [];

  /** Whatever piece of the chupa is at this height, its half-width. */
  const garmentHalfAt = (y: number) => {
    if (y >= sashTopY) return bodiceHalfAt(y);
    if (y >= sashBotY) return sashHalf;
    return skirtHalfAt(y);
  };

  // The fold sampled once, then read back by x. It is monotonic in x — it runs
  // from one strap across to the far side — so inverting it is a lookup.
  const foldSamples = wrapEdge(1, 0, 1);
  const foldYAt = (x: number, side: 1 | -1): number => {
    const want = x * side;
    let best = foldSamples[0];
    let bestD = Infinity;
    for (let i = 0; i < foldSamples.length - 1; i++) {
      const a = foldSamples[i];
      const b = foldSamples[i + 1];
      if ((want - a[0]) * (want - b[0]) <= 0) {
        const t = (want - a[0]) / ((b[0] - a[0]) || 1);
        return a[1] + (b[1] - a[1]) * t;
      }
      const d = Math.min(Math.abs(want - a[0]), Math.abs(want - b[0]));
      if (d < bestD) { bestD = d; best = Math.abs(want - a[0]) < Math.abs(want - b[0]) ? a : b; }
    }
    return best[1];
  };

  return {
    regions: regions.slice().sort((a, b) => a.layer - b.layer),
    seams,
    profile: {
      halfAt: garmentHalfAt,
      foldYAt,
      foldFromX: foldSamples[0][0],
      foldToX: foldSamples[foldSamples.length - 1][0],
    },
    landmarks: {
      shoulderY, vNeckY, armholeY, sashTopY, sashMidY, sashBotY, hemY,
      neckHalf, strapOuter, shoulderPoint, halfAtWaist, underarmHalf,
      halfAtHip: bodyHalfWidth(form, m.floorToHip) + c.skirtEase,
      halfAtHem: skirtHalfAt(hemY), cuffY,
      gsm: fabric.gsm,
    },
  };
}
