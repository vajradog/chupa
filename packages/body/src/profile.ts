/**
 * The lathed torso: a stack of elliptical rings, one per measured level, with a
 * signed-distance function taken in the meridian plane.
 *
 * Tailors measure circumferences, not radii, so every ring is built by solving a
 * circumference back into ellipse semi-axes at a given depth/width ratio.
 */

import type { Measurements } from './measurements.js';

export interface Ring {
  /** Height above the floor. */
  readonly y: number;
  /** Semi-axis across the body (left-right). */
  readonly rx: number;
  /** Semi-axis front-to-back. */
  readonly rz: number;
  /** Level name, for debugging and dev rendering. */
  readonly name: string;
}

/**
 * Ramanujan's ellipse perimeter, exact enough for tailoring (error under 1e-5
 * for the ratios a body actually takes).
 */
export function ellipsePerimeter(rx: number, rz: number): number {
  return Math.PI * (3 * (rx + rz) - Math.sqrt((3 * rx + rz) * (rx + 3 * rz)));
}

/**
 * Invert the above: given a circumference and a depth/width ratio, recover the
 * semi-axes. Ramanujan's formula is linear in scale, so this is a division, not
 * a search.
 */
export function ellipseFromCircumference(circumference: number, depthRatio: number): {
  rx: number;
  rz: number;
} {
  const shape = ellipsePerimeter(1, depthRatio);
  const rx = circumference / shape;
  return { rx, rz: rx * depthRatio };
}

/** Semi-axes of one limb cross-section, treated as near-circular. */
function limb(circumference: number, depthRatio = 0.92) {
  return ellipseFromCircumference(circumference, depthRatio);
}

/**
 * Build the torso rings, floor upward.
 *
 * Below the hip the two legs are lathed as ONE merged column (width doubled,
 * depth kept). For a floor-length wrap dress with no character animation the
 * skirt never falls between the legs, so the merged column is indistinguishable
 * from two — and it keeps the lower body inside a single surface of revolution,
 * which is what makes the cheap meridian-plane SDF below valid.
 */
export function buildRings(m: Measurements, scale = 1): Ring[] {
  const s = scale;
  const ratio = m.depthRatio;

  const ankle = limb(m.ankleCircumference);
  const knee = limb(m.kneeCircumference);
  const thigh = limb(m.thighCircumference);
  const hip = ellipseFromCircumference(m.hipCircumference, ratio.hip);
  const waist = ellipseFromCircumference(m.waistCircumference, ratio.waist);
  const underbust = ellipseFromCircumference(m.underbustCircumference, ratio.bust);
  const bust = ellipseFromCircumference(m.bustCircumference, ratio.bust);
  const neck = ellipseFromCircumference(m.neckCircumference, ratio.neck);

  const floorToThigh = (m.floorToKnee + m.floorToHip) / 2;

  const rings: Ring[] = [
    { name: 'ankle', y: m.floorToAnkle, rx: ankle.rx * 2, rz: ankle.rz },
    { name: 'knee', y: m.floorToKnee, rx: knee.rx * 2, rz: knee.rz },
    { name: 'thigh', y: floorToThigh, rx: thigh.rx * 2, rz: thigh.rz },
    { name: 'hip', y: m.floorToHip, rx: hip.rx, rz: hip.rz },
    { name: 'waist', y: m.floorToWaist, rx: waist.rx, rz: waist.rz },
    { name: 'underbust', y: m.floorToUnderbust, rx: underbust.rx, rz: underbust.rz },
    { name: 'bust', y: m.floorToBust, rx: bust.rx, rz: bust.rz },
    // The shoulder ring is set by shoulder width, not by a circumference.
    { name: 'shoulder', y: m.floorToShoulder, rx: m.shoulderWidth / 2, rz: bust.rz * 0.92 },
    { name: 'neckBase', y: m.floorToNeckBase, rx: neck.rx, rz: neck.rz },
  ];

  return rings
    .sort((a, b) => a.y - b.y)
    .map((r) => ({ name: r.name, y: r.y * s, rx: r.rx * s, rz: r.rz * s }));
}

/** Look up a ring by level name. */
export function ringNamed(rings: readonly Ring[], name: string): Ring {
  const r = rings.find((x) => x.name === name);
  if (!r) throw new Error(`no ring named "${name}"`);
  return r;
}

/**
 * Radius of a ring in the compass direction (dx, dz) — the ellipse's support
 * radius along that bearing.
 */
function ringRadius(ring: Ring, dx: number, dz: number): number {
  const a = dx / ring.rx;
  const b = dz / ring.rz;
  return 1 / Math.sqrt(a * a + b * b);
}

/**
 * Signed distance to the lathed torso.
 *
 * The surface of revolution is collapsed into its meridian plane: for the query
 * point's compass bearing, each ring contributes a radius, giving a 2D silhouette
 * polyline in (radius, height). Distance to that polyline — closed to the axis at
 * both ends — is the answer.
 *
 * Approximate, in that the cross-section is treated as locally circular when
 * picking the bearing, so it slightly overestimates distance where the ellipse is
 * most eccentric. Cloth collision needs the sign and the gradient direction, and
 * both are right; the bake below smooths the rest.
 */
export function latheSdf(rings: readonly Ring[], x: number, y: number, z: number): number {
  const rho = Math.sqrt(x * x + z * z);
  const dx = rho > 1e-9 ? x / rho : 1;
  const dz = rho > 1e-9 ? z / rho : 0;

  const n = rings.length;
  // Silhouette polygon: axis at the bottom, up the outside, back to the axis.
  const px = new Array<number>(n + 2);
  const py = new Array<number>(n + 2);
  px[0] = 0;
  py[0] = rings[0].y;
  for (let i = 0; i < n; i++) {
    px[i + 1] = ringRadius(rings[i], dx, dz);
    py[i + 1] = rings[i].y;
  }
  px[n + 1] = 0;
  py[n + 1] = rings[n - 1].y;

  let best = Infinity;
  let inside = false;
  for (let i = 0, j = n + 1; i < n + 2; j = i++) {
    const ax = px[i], ay = py[i];
    const bx = px[j], by = py[j];

    // Crossing number over the closed polygon, evaluated in the half-plane rho >= 0.
    if ((ay > y) !== (by > y) && rho < ax + ((y - ay) / (by - ay)) * (bx - ax)) {
      inside = !inside;
    }

    // i === 0 is the closing edge, which runs along the axis of revolution.
    // That edge is an artifact of working in the meridian half-plane — it is not
    // a surface, and counting it would report distance 0 for every point on the
    // body's centreline. The end caps (the other two horizontal edges) are real.
    if (i === 0) continue;

    const ex = bx - ax, ey = by - ay;
    const wx = rho - ax, wy = y - ay;
    const len2 = ex * ex + ey * ey || 1e-12;
    let t = (wx * ex + wy * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = wx - ex * t, cy = wy - ey * t;
    const d2 = cx * cx + cy * cy;
    if (d2 < best) best = d2;
  }
  const d = Math.sqrt(best);
  return inside ? -d : d;
}
