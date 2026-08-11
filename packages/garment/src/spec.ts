/**
 * Finished-garment proportions, loaded from `pattern/panels.json`.
 *
 * This is deliberately NOT a sewing pattern. The chupa's cut never changes, so
 * the shape is authored once from these numbers; there are no panels, no seams
 * and no draping solve anywhere in this package.
 *
 * The values were corrected against Thupten's reference photographs of real
 * Ü-Tsang chupas. The file records which ones came from the photographs and
 * which are still guesses.
 */

import specJson from '../../../pattern/panels.json';

export interface ChupaSpec {
  /** Hem height above the floor, cm. */
  readonly hemFromFloor: number;
  readonly bodiceEase: number;
  readonly skirtEase: number;
  /**
   * Hem circumference over waist circumference — the A-line, cut in. This is
   * what makes the reference garment's silhouette: it leaves the waist at body
   * width and opens on straight side edges to a hem nearly twice as wide.
   */
  readonly hemFlare: number;
  /**
   * Surplus fabric over the shape the skirt is tied to, which gravity pleats.
   * Distinct from `hemFlare`: flare is the cut, gather is the surplus. The
   * reference garment is smooth brocade, so this sits at or just above 1.
   */
  readonly waistGatherRatio: number;
  /** How far the wrap laps past centre front, cm. */
  readonly crossoverWidth: number;
  /** Shoulder down to the point of the V, cm. */
  readonly vNeckDrop: number;
  /** Shoulder down to the back top edge, cm. */
  readonly backNeckDrop: number;
  /** Shoulder down to the lowest point of the armhole, cm. */
  readonly armholeDrop: number;
  /** Across the shoulder, neck side to arm side, cm. */
  readonly shoulderPanelWidth: number;
  /**
   * How far below the shoulder the honju sleeve starts showing, cm. The honju is
   * worn UNDER the chupa, so the top of the shoulder is chupa and the sleeve
   * emerges below it. Only the collar comes out from underneath and folds back
   * over the outside.
   */
  readonly shoulderSeamDrop: number;
  /** Fall of the shoulder seam from neck point to shoulder point, degrees. */
  readonly shoulderSlopeDeg: number;
  /** How far the concave armhole bites in between shoulder point and underarm, cm. */
  readonly armholeScoop: number;
  /** Gap at the neck between the two shoulder panels, cm. */
  readonly necklineWidth: number;
  /** Width of the sash at the waist, cm. */
  readonly sashWidth: number;
  /** Shoulder down to where the wrap fold runs out at the far side, cm. High. */
  readonly wrapEndDrop: number;
  /** How far from centre the wrap fold dies out, cm. Well inside the side seam. */
  readonly wrapEndX: number;
  /** How far along the fold the OVER collar band runs, 0-1. */
  readonly collarReach: number;
  /** How far along its fold the UNDER collar band runs, 0-1. */
  readonly collarUnderReach: number;
  /** Width of the chupa's own band along the wrap edge, cm. */
  readonly wrapBandWidth: number;
  /** How far in from the wrap edge the first row of topstitching sits, cm. */
  readonly topstitchInset: number;
  /** Spacing between the two rows of the chupa's double stitch, cm. */
  readonly topstitchGap: number;
}

export interface HonjuSpec {
  readonly sleeveLength: number;
  readonly cuffCircumference: number;
  /** Width of the shawl collar band where it folds out over the chupa, cm. */
  readonly collarWidth: number;
  /** How far below the chupa's shoulder tip the sleeve appears, cm. */
  readonly armholeGap: number;
  /** How far below the shoulder the sleeve reaches its widest, cm. */
  readonly deltoidDrop: number;
  readonly sleeveEase: number;
}

export interface PangdenSpec {
  readonly width: number;
  readonly length: number;
  /** Narrow vertical woven strips, each with its own stripe program. */
  readonly strips: number;
  readonly stripeProgram: string;
}

export interface GarmentSpec {
  readonly sleeveless: boolean;
  readonly chupa: ChupaSpec;
  readonly honju: HonjuSpec;
  readonly pangden: PangdenSpec;
}

function num(group: Record<string, unknown>, key: string, where: string): number {
  const v = group[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`garment spec: ${where}.${key} must be a finite number`);
  }
  return v;
}

export function parseGarmentSpec(doc: Record<string, unknown>): GarmentSpec {
  const chupa = (doc.chupa ?? {}) as Record<string, unknown>;
  const honju = (doc.honju ?? {}) as Record<string, unknown>;
  const pangden = (doc.pangden ?? {}) as Record<string, unknown>;
  const stripe = pangden.stripeProgram;
  if (typeof stripe !== 'string' || stripe.length === 0) {
    throw new Error('garment spec: pangden.stripeProgram must be a non-empty string');
  }
  const spec: GarmentSpec = {
    sleeveless: doc.sleeveless !== false,
    chupa: {
      hemFromFloor: num(chupa, 'hemFromFloor', 'chupa'),
      bodiceEase: num(chupa, 'bodiceEase', 'chupa'),
      skirtEase: num(chupa, 'skirtEase', 'chupa'),
      hemFlare: num(chupa, 'hemFlare', 'chupa'),
      waistGatherRatio: num(chupa, 'waistGatherRatio', 'chupa'),
      crossoverWidth: num(chupa, 'crossoverWidth', 'chupa'),
      vNeckDrop: num(chupa, 'vNeckDrop', 'chupa'),
      backNeckDrop: num(chupa, 'backNeckDrop', 'chupa'),
      armholeDrop: num(chupa, 'armholeDrop', 'chupa'),
      shoulderPanelWidth: num(chupa, 'shoulderPanelWidth', 'chupa'),
      shoulderSeamDrop: num(chupa, 'shoulderSeamDrop', 'chupa'),
      shoulderSlopeDeg: num(chupa, 'shoulderSlopeDeg', 'chupa'),
      armholeScoop: num(chupa, 'armholeScoop', 'chupa'),
      necklineWidth: num(chupa, 'necklineWidth', 'chupa'),
      sashWidth: num(chupa, 'sashWidth', 'chupa'),
      wrapEndDrop: num(chupa, 'wrapEndDrop', 'chupa'),
      wrapEndX: num(chupa, 'wrapEndX', 'chupa'),
      collarReach: num(chupa, 'collarReach', 'chupa'),
      collarUnderReach: num(chupa, 'collarUnderReach', 'chupa'),
      wrapBandWidth: num(chupa, 'wrapBandWidth', 'chupa'),
      topstitchInset: num(chupa, 'topstitchInset', 'chupa'),
      topstitchGap: num(chupa, 'topstitchGap', 'chupa'),
    },
    honju: {
      sleeveLength: num(honju, 'sleeveLength', 'honju'),
      cuffCircumference: num(honju, 'cuffCircumference', 'honju'),
      collarWidth: num(honju, 'collarWidth', 'honju'),
      armholeGap: num(honju, 'armholeGap', 'honju'),
      deltoidDrop: num(honju, 'deltoidDrop', 'honju'),
      sleeveEase: num(honju, 'sleeveEase', 'honju'),
    },
    pangden: {
      width: num(pangden, 'width', 'pangden'),
      length: num(pangden, 'length', 'pangden'),
      strips: Math.max(1, Math.round(num(pangden, 'strips', 'pangden'))),
      stripeProgram: stripe,
    },
  };
  if (spec.chupa.vNeckDrop <= spec.chupa.backNeckDrop) {
    throw new Error('garment spec: the V neck must drop further than the back neck');
  }
  if (spec.chupa.hemFlare < 1) {
    throw new Error('garment spec: hemFlare below 1 would taper the skirt to the ankles');
  }
  return spec;
}

export const GARMENT_SPEC: GarmentSpec = parseGarmentSpec(
  specJson as unknown as Record<string, unknown>,
);

/** Keys Thupten has stated outright. */
export const CONFIRMED_SPEC: readonly string[] =
  ((specJson as Record<string, unknown>).$fromThupten as string[]) ?? [];

/** Keys read off the reference photographs. */
export const SPEC_FROM_PHOTOS: readonly string[] =
  ((specJson as Record<string, unknown>).$fromPhotos as string[]) ?? [];

/** Expand "R3 K1 Y2" into one palette letter per row, starting at `offset`. */
export function expandStripeProgram(program: string, rows: number, offset = 0): string[] {
  const bands = program.trim().split(/\s+/).map((s) => ({ c: s[0], w: Math.max(1, +s.slice(1)) }));
  const total = bands.reduce((n, b) => n + b.w, 0);
  const out: string[] = [];
  let band = 0;
  let left = bands[0].w;
  // Wind the program forward so each woven strip starts somewhere different —
  // real pangden strips are woven separately and never line up.
  for (let i = 0; i < ((offset % total) + total) % total; i++) {
    if (--left === 0) { band = (band + 1) % bands.length; left = bands[band].w; }
  }
  for (let r = 0; r < rows; r++) {
    out.push(bands[band].c);
    if (--left === 0) { band = (band + 1) % bands.length; left = bands[band].w; }
  }
  return out;
}
