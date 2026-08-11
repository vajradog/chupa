/**
 * The measurement set the mannequin is generated from.
 *
 * Values live in `body/measurements.json` at the repo root — a strawman until
 * Thupten corrects it. Nothing in this package hard-codes a body: change the
 * JSON and a different woman comes out the other end.
 */

import measurementsJson from '../../../body/measurements.json';

export interface DepthRatios {
  /** Cross-section depth / width. 1.0 would be circular. */
  readonly neck: number;
  readonly bust: number;
  readonly waist: number;
  readonly hip: number;
}

export interface Measurements {
  /** cm per solver world unit — also the cloth particle spacing in cm. */
  readonly worldScale: number;
  readonly height: number;
  readonly floorToAnkle: number;
  readonly floorToKnee: number;
  readonly floorToHip: number;
  readonly floorToWaist: number;
  readonly floorToUnderbust: number;
  readonly floorToBust: number;
  readonly floorToShoulder: number;
  readonly floorToNeckBase: number;
  /** Chin height. The neck stops here — it is not open-ended. */
  readonly floorToChin: number;
  /** Head breadth in front view. The form has no head; this is for drawing one. */
  readonly headWidth: number;
  readonly neckCircumference: number;
  readonly shoulderWidth: number;
  readonly bustCircumference: number;
  readonly underbustCircumference: number;
  readonly waistCircumference: number;
  readonly hipCircumference: number;
  readonly thighCircumference: number;
  readonly kneeCircumference: number;
  readonly ankleCircumference: number;
  readonly armLength: number;
  readonly upperArmCircumference: number;
  readonly wristCircumference: number;
  readonly armSeparation: number;
  readonly depthRatio: DepthRatios;
}

const REQUIRED_LEVELS = [
  'floorToAnkle',
  'floorToKnee',
  'floorToHip',
  'floorToWaist',
  'floorToUnderbust',
  'floorToBust',
  'floorToShoulder',
  'floorToNeckBase',
  'floorToChin',
] as const;

/** Validate a measurements document. Heights must increase up the body. */
export function parseMeasurements(doc: Record<string, unknown>): Measurements {
  const num = (key: string): number => {
    const v = doc[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new Error(`measurements: "${key}" must be a positive number`);
    }
    return v;
  };
  for (let i = 1; i < REQUIRED_LEVELS.length; i++) {
    if (num(REQUIRED_LEVELS[i]) <= num(REQUIRED_LEVELS[i - 1])) {
      throw new Error(
        `measurements: ${REQUIRED_LEVELS[i]} must sit above ${REQUIRED_LEVELS[i - 1]}`,
      );
    }
  }
  const ratios = (doc.depthRatio ?? {}) as Record<string, unknown>;
  const ratio = (key: keyof DepthRatios): number => {
    const v = ratios[key];
    if (typeof v !== 'number' || !(v > 0) || v > 1.5) {
      throw new Error(`measurements: depthRatio.${key} must be a ratio in (0, 1.5]`);
    }
    return v;
  };
  return {
    worldScale: num('worldScale'),
    height: num('height'),
    floorToAnkle: num('floorToAnkle'),
    floorToKnee: num('floorToKnee'),
    floorToHip: num('floorToHip'),
    floorToWaist: num('floorToWaist'),
    floorToUnderbust: num('floorToUnderbust'),
    floorToBust: num('floorToBust'),
    floorToShoulder: num('floorToShoulder'),
    floorToNeckBase: num('floorToNeckBase'),
    floorToChin: num('floorToChin'),
    headWidth: num('headWidth'),
    neckCircumference: num('neckCircumference'),
    shoulderWidth: num('shoulderWidth'),
    bustCircumference: num('bustCircumference'),
    underbustCircumference: num('underbustCircumference'),
    waistCircumference: num('waistCircumference'),
    hipCircumference: num('hipCircumference'),
    thighCircumference: num('thighCircumference'),
    kneeCircumference: num('kneeCircumference'),
    ankleCircumference: num('ankleCircumference'),
    armLength: num('armLength'),
    upperArmCircumference: num('upperArmCircumference'),
    wristCircumference: num('wristCircumference'),
    armSeparation: num('armSeparation'),
    depthRatio: {
      neck: ratio('neck'),
      bust: ratio('bust'),
      waist: ratio('waist'),
      hip: ratio('hip'),
    },
  };
}

/** The strawman figure, in centimetres. */
export const MEASUREMENTS: Measurements = parseMeasurements(
  measurementsJson as unknown as Record<string, unknown>,
);

/** Keys Thupten has confirmed. Everything else is still a guess. */
export const CONFIRMED_MEASUREMENTS: readonly string[] =
  ((measurementsJson as Record<string, unknown>).$fromThupten as string[]) ?? [];
