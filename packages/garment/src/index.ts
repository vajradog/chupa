/**
 * @chupa/garment — the chupa shell.
 *
 * One fixed garment shape, built directly around the mannequin. No pattern
 * pieces, no seams, no draping solve: the cut never changes, so it is authored
 * once. What the user changes is colour and material.
 */

export type { GarmentSpec, ChupaSpec, HonjuSpec, PangdenSpec } from './spec.js';
export {
  GARMENT_SPEC,
  CONFIRMED_SPEC,
  parseGarmentSpec,
  expandStripeProgram,
} from './spec.js';

export type { Chupa, ChupaOptions, Piece, PieceName, PieceGarment } from './chupa.js';
export { buildChupa, totalParticles, pieceNamed, isFullyPinned } from './chupa.js';

export type { Hsl, Oklch, Harmony, NamedColour } from './colour.js';
export {
  hexToHsl, hslToHex, hexToOklch, oklchToHex,
  harmoniesFor, nearestNamed, NAMED_COLOURS, NEUTRAL_SATURATION,
} from './colour.js';

export type { HangOptions, HangProfile } from './hang.js';
export { solveHang } from './hang.js';

export type { FlatChupa, FlatProfile, FlatRegion, FlatSeam, FlatGarment } from './flat.js';
export { buildFlatChupa } from './flat.js';

export type { SkirtColliderOptions, Collide } from './skirt-collider.js';
export { createSkirtCollider, composeColliders } from './skirt-collider.js';

export { PANGDEN_PALETTE } from './palette.js';
