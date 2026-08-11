/**
 * How the skirt hangs — solved, not authored.
 *
 * The side profile of a hanging skirt is a one-dimensional problem. A length of
 * cloth is pinned at the sash; gravity pulls it down; its bending stiffness
 * resists folding over the hip; the body stops it passing through. Where it ends
 * up is the silhouette. Nothing about that needs three dimensions.
 *
 * So this runs the REAL solver on a single column of particles — a 1-wide grid
 * is a chain, with the same distance and 2-apart bending constraints everything
 * else uses — and reads the settled shape back out. Heavy fluid cloth folds over
 * the seat and falls plumb from it; stiff light cloth keeps the cone it was cut
 * to. That difference is the weight of the fabric, and it comes out of the
 * solver rather than out of a number someone guessed.
 *
 * Replaces an earlier `fluidity` fudge that simply scaled the cut's flare.
 */

import type { Fabric, Particles } from '@chupa/cloth';
import {
  captureRestShape, createGridCloth, createSolver, kineticEnergy, step,
} from '@chupa/cloth';

export interface HangOptions {
  /** Height the cloth is pinned at, cm. */
  readonly topY: number;
  /** Half-width at the pin, cm. */
  readonly topHalf: number;
  /** Height of the hem, cm. */
  readonly hemY: number;
  /** Half-width the cut would give at the hem if nothing disturbed it, cm. */
  readonly hemHalf: number;
  /** Body half-width at a height, cm — the cloth cannot pass inside this. */
  readonly bodyHalfAt: (y: number) => number;
  /** Clearance held off the body, cm. */
  readonly ease: number;
  /** Particles down the chain. */
  readonly links?: number;
  /** Hard cap on solver steps. It stops early once it has settled. */
  readonly steps?: number;
}

export interface HangProfile {
  /** Settled half-width at a height, cm. */
  halfAt(y: number): number;
  /** The settled points, top to hem. */
  readonly points: readonly (readonly [number, number])[];
}

/**
 * Settle a hanging length of cloth and return its side profile.
 *
 * Everything is in centimetres. The solver's own units cancel out because the
 * chain is built, settled and read back in the same space.
 */
export function solveHang(fabric: Fabric, opts: HangOptions): HangProfile {
  const links = opts.links ?? 28;
  const steps = opts.steps ?? 4000;
  const { topY, topHalf, hemY, hemHalf } = opts;

  // Rest length per link is taken from the CUT: the side seam of the cone the
  // pattern describes, which is longer than the vertical drop whenever the
  // skirt flares. That surplus length is what the cloth has to dispose of, and
  // disposing of it is the whole behaviour.
  const drop = topY - hemY;
  const seam = Math.hypot(hemHalf - topHalf, drop);
  const spacing = seam / (links - 1);

  const cloth = createGridCloth({
    cols: 1, rows: links, spacing, pinTopRow: true, seedWave: 0,
  });
  const p = cloth.particles;
  for (let i = 0; i < links; i++) {
    const t = i / (links - 1);
    p.px[i] = topHalf + (hemHalf - topHalf) * t;
    p.py[i] = topY - drop * t;
    p.pz[i] = 0;
    p.ox[i] = p.px[i];
    p.oy[i] = p.py[i];
    p.oz[i] = p.pz[i];
  }
  captureRestShape(cloth);

  /**
   * The cut is a CEILING. Cloth does not stretch, so a ring of it can never sit
   * wider than the circumference it was cut to — whatever gravity is doing, the
   * hem cannot swing out past the pattern.
   *
   * Leaving this out made more flare produce a NARROWER skirt: the extra seam
   * length simply let the chain hang lower and straighter, so widening the cut
   * pulled the hem in. Between this ceiling and the body's floor, stiffness
   * decides where the cloth sits, which is the whole of drape.
   */
  const cutHalfAt = (y: number) => {
    const t = Math.max(0, Math.min(1, (topY - y) / (drop || 1)));
    return topHalf + (hemHalf - topHalf) * t;
  };

  const collide = (q: Particles) => {
    for (let i = 0; i < q.count; i++) {
      if (q.pinned[i]) continue;
      // Out of the body, and out of the plane's far side — this is a section, so
      // the cloth stays on its own side of the centreline.
      const floor = opts.bodyHalfAt(q.py[i]) + opts.ease;
      if (q.px[i] < floor) q.px[i] = floor;
      const ceiling = Math.max(floor, cutHalfAt(q.py[i]));
      if (q.px[i] > ceiling) q.px[i] = ceiling;
      q.pz[i] = 0;
      // The hem cannot rise back above where it started, and nothing goes under
      // the floor: both are artefacts, not cloth.
      if (q.py[i] > topY) q.py[i] = topY;
    }
  };

  /**
   * WEIGHT HAS TO ENTER THE SOLVE, and in this solver it does not on its own:
   * gravity is uniform, so a heavy cloth and a light one fall identically. The
   * quantity that actually governs drape is stiffness over weight — a melton is
   * stiff but also heavy, and the heaviness is why it still falls. Scaling bend
   * by density is that ratio, and it is the difference between a material list
   * that changes the picture and one that only changes the label.
   */
  const effective: Fabric = { ...fabric, bend: fabric.bend / fabric.density };

  const solver = createSolver({ cloth, fabric: effective, collider: collide, breeze: 0 });
  // Run until it stops moving, not for a fixed count. The lightest cloths retain
  // the most velocity — georgette is still swinging OUTWARD at 400 steps, which
  // read as a stiffer drape than melton and is simply an unfinished solve.
  for (let i = 0; i < steps; i++) {
    step(solver);
    if (i > 60 && i % 20 === 0 && kineticEnergy(p) / p.count < 1e-7) break;
  }

  const points: [number, number][] = [];
  for (let i = 0; i < links; i++) points.push([p.px[i], p.py[i]]);
  points.sort((a, b) => b[1] - a[1]);

  return {
    points,
    halfAt(y: number): number {
      if (y >= points[0][1]) return points[0][0];
      const last = points[points.length - 1];
      if (y <= last[1]) return last[0];
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (y >= b[1]) {
          const t = (a[1] - y) / (a[1] - b[1] || 1);
          return a[0] + (b[0] - a[0]) * t;
        }
      }
      return last[0];
    },
  };
}
