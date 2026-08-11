/**
 * The mannequin: lathed torso, smooth-unioned with capsule arms and neck.
 *
 * Static forever (product decision 4), so this is built once and baked once. The
 * whole figure comes out of the measurement set — there is no model file.
 */

import type { Measurements } from './measurements.js';
import { MEASUREMENTS } from './measurements.js';
import type { Ring } from './profile.js';
import { buildRings, ellipseFromCircumference, latheSdf, ringNamed } from './profile.js';
import { sdRoundCone, smin } from './shapes.js';

export interface Limb {
  readonly name: string;
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
  readonly r1: number;
  readonly r2: number;
}

export interface Bounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface Form {
  readonly measurements: Measurements;
  /** cm -> world units. */
  readonly scale: number;
  readonly rings: readonly Ring[];
  readonly limbs: readonly Limb[];
  /** Blend radius used to weld limbs onto the torso, world units. */
  readonly blend: number;
  readonly bounds: Bounds;
  /** Signed distance to the figure, world units. Negative inside. */
  sdf(x: number, y: number, z: number): number;
  /** Height of a named ring, world units. Useful for placing the belt. */
  levelOf(name: string): number;
}

export interface FormOptions {
  /**
   * World units per centimetre. Defaults to 1/worldScale so the figure lands in
   * the same coordinate system as the cloth, where particle spacing is 1.
   */
  scale?: number;
  /** Limb-to-torso blend radius, centimetres. */
  blendCm?: number;
}

export function buildForm(m: Measurements = MEASUREMENTS, options: FormOptions = {}): Form {
  const scale = options.scale ?? 1 / m.worldScale;
  const blend = (options.blendCm ?? 3) * scale;
  const rings = buildRings(m, scale);

  const shoulder = ringNamed(rings, 'shoulder');
  const neckBase = ringNamed(rings, 'neckBase');

  const upperArm = ellipseFromCircumference(m.upperArmCircumference, 1).rx * scale;
  const wrist = ellipseFromCircumference(m.wristCircumference, 1).rx * scale;
  const neckR = ringNamed(rings, 'neckBase').rx;

  const sep = m.armSeparation * scale;
  const armTop = shoulder.y - upperArm * 0.5;
  const armBottom = armTop - m.armLength * scale;
  // Arms hang down the sides, barely splayed. Thupten's drawing and the navy
  // reference garment both show the honju sleeve falling close along the body
  // and staying inboard of the shoulder point; the earlier wide splay pushed the
  // sleeves out at an angle and was the most alien thing in the render.
  const armSplay = sep * 0.10;
  const armForward = upperArm * 0.15;

  const limbs: Limb[] = [
    {
      name: 'armLeft',
      a: [-sep, armTop, 0],
      b: [-sep - armSplay, armBottom, -armForward],
      r1: upperArm,
      r2: wrist,
    },
    {
      name: 'armRight',
      a: [sep, armTop, 0],
      b: [sep + armSplay, armBottom, -armForward],
      r1: upperArm,
      r2: wrist,
    },
    {
      name: 'neck',
      a: [0, neckBase.y - neckR, 0],
      // Stops AT THE CHIN. It used to run to neckBase + 1.6 radii, which put the
      // top of the neck five centimetres above where a chin belongs.
      b: [0, m.floorToChin * scale - neckR, 0],
      r1: neckR,
      r2: neckR * 0.92,
    },
  ];

  const sdf = (x: number, y: number, z: number): number => {
    let d = latheSdf(rings, x, y, z);
    for (const l of limbs) {
      const dl = sdRoundCone(x, y, z, l.a[0], l.a[1], l.a[2], l.b[0], l.b[1], l.b[2], l.r1, l.r2);
      d = smin(d, dl, blend);
    }
    return d;
  };

  let maxR = 0;
  for (const r of rings) maxR = Math.max(maxR, r.rx, r.rz);
  for (const l of limbs) {
    maxR = Math.max(maxR, Math.abs(l.a[0]) + l.r1, Math.abs(l.b[0]) + l.r2);
  }
  // Capsule ends are centres, so the radius has to be counted in or the bounds
  // slice the top off the neck.
  const top = Math.max(
    neckBase.y,
    ...limbs.map((l) => Math.max(l.a[1] + l.r1, l.b[1] + l.r2)),
  );
  const bottom = Math.min(rings[0].y, ...limbs.map((l) => Math.min(l.a[1], l.b[1])));
  const pad = blend * 2;

  return {
    measurements: m,
    scale,
    rings,
    limbs,
    blend,
    bounds: {
      min: [-maxR - pad, bottom - pad, -maxR - pad],
      max: [maxR + pad, top + pad, maxR + pad],
    },
    sdf,
    levelOf: (name: string) => ringNamed(rings, name).y,
  };
}
