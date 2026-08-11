/**
 * Fabric = a parameter block. Switching fabric is a live physics event, never a
 * texture swap: bend/density/damping change what the solver does on the very
 * next step, so silk → nambu wool visibly drops, stiffens and goes still.
 *
 * The tuned values live in `fabrics/presets.json` at the repo root — that file
 * is the source of truth and is imported here, not duplicated.
 */

import presetsJson from '../../../fabrics/presets.json';

export interface Fabric {
  /** Stable key, e.g. "silk". */
  readonly key: string;
  readonly label: string;
  readonly note: string;
  /** Bending constraint stiffness, 0..1. Higher = holds a fold. */
  readonly bend: number;
  /** Mass proxy. Divides wind and interaction response; does not change gravity. */
  readonly density: number;
  /** Verlet velocity retention per step, 0..1. Lower = deader cloth. */
  readonly damping: number;
  /** Specular strength (rendering only). */
  readonly sheen: number;
  /** Colour saturation multiplier (rendering only). */
  readonly sat: number;
  /** Real cloth weight, grams per square metre. */
  readonly gsm: number;
  /**
   * How far the cloth abandons the cut and falls to the body, 0..1. 0 holds the
   * shape it was cut to (melton, gyaser); 1 pours straight down (georgette).
   * Describes the cloth — `bend`/`density`/`damping` are how the solver is made
   * to behave like it.
   */
  readonly fluidity: number;
  /** How well it KEEPS a fold once made, 0..1. Linen high, wool low. */
  readonly crease: number;
  /**
   * Real cloth thickness, MILLIMETRES.
   *
   * Too small to draw literally at a figure's scale, so it shows the way it does
   * on a real garment: thick cloth cannot turn a tight corner, so hems round off
   * and cut edges read heavier.
   */
  readonly thickness: number;
}

/** Solver settings the presets were tuned against. */
export interface SolverConfig {
  /** Per-substep gravity acceleration, world units. Negative is down. */
  readonly gravity: number;
  /** Constraint relaxation sweeps per substep. */
  readonly iterations: number;
  /** Substeps per 60fps frame. */
  readonly substeps: number;
  /** Fixed timestep, seconds. Advances the wind clock; integration is unit-step Verlet. */
  readonly timestep: number;
  /** Bending stiffness is multiplied by this before projection. */
  readonly bendConstraintScale: number;
}

export interface GridConfig {
  readonly cols: number;
  readonly rows: number;
  readonly spacing: number;
}

interface RawFabric {
  label?: string;
  note?: string;
  bend?: number;
  density?: number;
  damping?: number;
  sheen?: number;
  sat?: number;
  gsm?: number;
  fluidity?: number;
  crease?: number;
  thickness?: number;
}

const RESERVED_KEYS = new Set(['solver']);

function num(value: unknown, key: string, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`fabric preset "${key}": field "${field}" must be a finite number`);
  }
  return value;
}

/** Parse a presets document into fabric blocks. Shape errors throw loudly. */
export function parseFabricPresets(doc: Record<string, unknown>): Record<string, Fabric> {
  const out: Record<string, Fabric> = {};
  for (const key of Object.keys(doc)) {
    if (key.startsWith('$') || RESERVED_KEYS.has(key)) continue;
    const raw = doc[key] as RawFabric;
    out[key] = {
      key,
      label: typeof raw.label === 'string' ? raw.label : key,
      note: typeof raw.note === 'string' ? raw.note : '',
      bend: num(raw.bend, key, 'bend'),
      density: num(raw.density, key, 'density'),
      damping: num(raw.damping, key, 'damping'),
      sheen: num(raw.sheen, key, 'sheen'),
      sat: num(raw.sat, key, 'sat'),
      gsm: num(raw.gsm, key, 'gsm'),
      fluidity: num(raw.fluidity, key, 'fluidity'),
      crease: num(raw.crease, key, 'crease'),
      thickness: num(raw.thickness, key, 'thickness'),
    };
  }
  if (Object.keys(out).length === 0) throw new Error('presets document contains no fabrics');
  return out;
}

/** Parse the `solver` block of a presets document. */
export function parseSolverConfig(doc: Record<string, unknown>): SolverConfig {
  const raw = (doc.solver ?? {}) as Record<string, unknown>;
  return {
    gravity: num(raw.gravity, 'solver', 'gravity'),
    iterations: num(raw.iterations, 'solver', 'iterations'),
    substeps: num(raw.substeps, 'solver', 'substeps'),
    timestep: num(raw.timestep, 'solver', 'timestep'),
    bendConstraintScale: num(raw.bendConstraintScale, 'solver', 'bendConstraintScale'),
  };
}

/** Parse the reference grid dimensions from the `solver` block. */
export function parseGridConfig(doc: Record<string, unknown>): GridConfig {
  const raw = ((doc.solver ?? {}) as Record<string, unknown>).grid as Record<string, unknown>;
  return {
    cols: num(raw?.cols, 'solver.grid', 'cols'),
    rows: num(raw?.rows, 'solver.grid', 'rows'),
    spacing: num(raw?.spacing, 'solver.grid', 'spacing'),
  };
}

const doc = presetsJson as unknown as Record<string, unknown>;

/** The approved fabric presets, keyed by fabric key. */
export const FABRICS: Record<string, Fabric> = parseFabricPresets(doc);

/** Preset keys in authored order — light to heavy. */
/**
 * The four APPROVED fabrics, in the order they were tuned with Thupten. The
 * solver's regression guards iterate this — the measured stretch envelope and
 * the settle-time ordering are claims about these four and nothing else.
 *
 * Materials added since are real cloth but have not been approved by feel, so
 * they must not silently join the guarded set. Use `MATERIAL_KEYS` for the
 * whole library.
 */
export const FABRIC_KEYS: readonly string[] = ['silk', 'cotton', 'khadi', 'wool'];

/** Every fabric in the library, lightest first. */
export const MATERIAL_KEYS: readonly string[] = Object.keys(FABRICS)
  .sort((a, b) => FABRICS[a].gsm - FABRICS[b].gsm);

/** Reference solver settings the presets were tuned against. */
export const SOLVER_CONFIG: SolverConfig = parseSolverConfig(doc);

/** Reference grid dimensions from the phase-one proof. */
export const REFERENCE_GRID: GridConfig = parseGridConfig(doc);

/** Raw presets document, for callers that want fields the solver ignores. */
export const PRESETS_DOCUMENT: Record<string, unknown> = doc;

export function getFabric(key: string): Fabric {
  const f = FABRICS[key];
  if (!f) throw new Error(`unknown fabric "${key}" (have: ${MATERIAL_KEYS.join(', ')})`);
  return f;
}
