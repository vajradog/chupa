/**
 * @chupa/cloth — Verlet + PBD cloth solver.
 *
 * Pure TypeScript, zero runtime dependencies, renderer-agnostic, typed arrays
 * only. Phase 1 of the chupa designer; every later phase (mannequin collision,
 * seams, drape) hangs off this core.
 */

export type { Particles, GridCloth, GridClothOptions } from './particles.js';
export {
  createParticles,
  setParticle,
  freeze,
  kineticEnergy,
  createGridCloth,
  captureRestShape,
  resetGridCloth,
  gridIndex,
  buildGridIndices,
  computeGridNormals,
} from './particles.js';

export type { ConstraintSet, StrainLimitResult } from './constraints.js';
export {
  buildGridConstraints,
  restFromShape,
  constraintCount,
  projectConstraint,
  projectList,
  projectConstraints,
  limitStrain,
  maxOverstretch,
} from './constraints.js';

export type { Fabric, SolverConfig, GridConfig } from './fabric.js';
export {
  FABRICS,
  FABRIC_KEYS,
  MATERIAL_KEYS,
  SOLVER_CONFIG,
  REFERENCE_GRID,
  PRESETS_DOCUMENT,
  getFabric,
  parseFabricPresets,
  parseSolverConfig,
  parseGridConfig,
} from './fabric.js';

export type { Solver, SolverOptions, SettleOptions, SettleResult } from './solver.js';
export {
  createSolver,
  setFabric,
  resetSolver,
  step,
  stepFrame,
  energy,
  settle,
  stillCloth,
} from './solver.js';
