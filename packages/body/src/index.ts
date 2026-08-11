/**
 * @chupa/body — the mannequin.
 *
 * A parametric female form built from a measurement set: a lathed torso plus
 * capsule arms and neck, smooth-unioned and baked to an SDF grid that the cloth
 * solver collides against. Static forever, so it is built and baked once.
 */

export type { Measurements, DepthRatios } from './measurements.js';
export { MEASUREMENTS, CONFIRMED_MEASUREMENTS, parseMeasurements } from './measurements.js';

export type { Ring } from './profile.js';
export {
  buildRings,
  ringNamed,
  latheSdf,
  ellipsePerimeter,
  ellipseFromCircumference,
} from './profile.js';

export { sdCapsule, sdRoundCone, smin } from './shapes.js';

export type { Form, FormOptions, Limb, Bounds } from './form.js';
export { buildForm } from './form.js';

export type { SdfGrid, BakeOptions } from './sdf.js';
export { bakeSdf, sampleSdf, gradientSdf, gridBytes } from './sdf.js';

export type { Collider, ColliderOptions } from './collide.js';
export { createSdfCollider, maxPenetration } from './collide.js';

export type { FormMesh, MeshOptions } from './mesh.js';
export { buildFormMesh, limbAxes } from './mesh.js';
