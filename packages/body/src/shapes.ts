/**
 * Analytic signed-distance primitives.
 *
 * These are exact (not approximations) for capsules and round cones, which is
 * why the mannequin's arms and neck are built from them: the cloth only ever
 * needs "am I inside, and which way is out", and an exact primitive gives a
 * clean gradient right up against the surface.
 */

/** Exact SDF of a capsule: segment a->b swept with radius r. */
export function sdCapsule(
  x: number, y: number, z: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r: number,
): number {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const baLen2 = bax * bax + bay * bay + baz * baz || 1e-12;
  let h = (pax * bax + pay * bay + paz * baz) / baLen2;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

const sign = (v: number) => (v < 0 ? -1 : v > 0 ? 1 : 0);

/**
 * Exact SDF of a round cone: segment a->b with radius r1 at a tapering to r2 at
 * b. Limbs taper — an arm is not a uniform tube — and this is the cheapest exact
 * way to say so. (Standard three-case formulation: cap at b, cap at a, or the
 * tangent side wall between them.)
 */
export function sdRoundCone(
  x: number, y: number, z: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r1: number, r2: number,
): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz || 1e-12;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;

  const pax = x - ax, pay = y - ay, paz = z - az;
  const yy = pax * bax + pay * bay + paz * baz;
  const zz = yy - l2;

  const qx = pax * l2 - bax * yy;
  const qy = pay * l2 - bay * yy;
  const qz = paz * l2 - baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * l2;
  const z2 = zz * zz * l2;

  const k = sign(rr) * rr * rr * x2;
  if (sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
}

/**
 * Polynomial smooth minimum. Blends two shapes over a band of width k instead of
 * leaving a crease. Arms meeting the torso is exactly the case that needs it: a
 * hard union leaves a concave seam that cloth catches on and never slides off.
 */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}
