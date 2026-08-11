# @chupa/cloth

Verlet integration + PBD constraint projection. Pure TypeScript, zero runtime
dependencies, renderer-agnostic, typed arrays only — so it ports line-for-line to
Rust/WASM or a WebGPU compute pass if profiling ever demands it.

Ported from `reference/pangden-physics-proof.html` with the integration order,
wind field, and grab response preserved exactly. The fabric parameter blocks are
imported from `fabrics/presets.json`, not duplicated.

```ts
import { FABRICS, REFERENCE_GRID, createGridCloth, createSolver, stepFrame } from '@chupa/cloth';

const cloth = createGridCloth({ ...REFERENCE_GRID });   // 40x52, top row pinned
const solver = createSolver({ cloth, fabric: FABRICS.silk, breeze: 0.45 });

stepFrame(solver);          // one 60fps frame = 2 substeps
setFabric(solver, FABRICS.wool);   // live physics event; positions carry over
```

Run the dev page — the phase-one proof driven by this package:

```bash
npm run dev
```

then open `/dev/pangden/`.

## Phase 1 acceptance criteria

| Criterion | Status |
| --- | --- |
| (a) hanging panel settles below an energy threshold within N steps | met — see below |
| (b) no structural constraint exceeds 1% overstretch after projection | **not met at approved settings** — see below |
| (c) presets load from `fabrics/presets.json`, measurably different settle times | met |
| a Vite dev page reproduces the reference demo using the package | met — `app/dev/pangden/` |

### (a) Settling

Measured on the reference panel, substeps to reach 1% of the peak energy of the drop:

| fabric | peak energy | settles in |
| --- | --- | --- |
| silk brocade | 29.2 | 116 substeps |
| cotton | 21.7 | 81 |
| khadi | 15.9 | 74 |
| nambu wool | 10.3 | 64 |

The threshold is relative, not absolute, on purpose. Peak energy varies 3x across
the presets, and **silk never goes fully still** — at the approved damping of
0.9930 it keeps a permanent low shimmer (energy plateaus around 1.6e-2, roughly
0.003 world units of motion per particle per substep). That shimmer is what makes
silk read as silk; it is not a failure to converge.

### (b) The 1% overstretch criterion

This one cannot be met at the approved solver settings, and I did not change them
to force it. Measured on the reference 40x52 top-pinned panel at 7 iterations /
2 substeps, with no strain limiting:

| fabric | peak overstretch | steady state |
| --- | --- | --- |
| silk | 29.9% | 17.7% |
| cotton | 21.6% | 14.3% |
| khadi | 16.4% | 11.4% |
| nambu wool | 12.0% | 9.0% |

This is ordinary PBD extensibility: 7 Gauss-Seidel sweeps cannot propagate the
load of 52 rows up to the pinned row, so the sheet hangs slightly rubbery. It is
worst at the top and decays downward — row 48 is under 1% for every fabric. The
demo that was approved has exactly this behaviour, so "fixing" it is a change to
the tuned feel, not a bug fix.

`limitStrain` (Provot-style, opt-in, off by default) is provided for when
inextensibility matters. It enforces the 1% bound on short panels and reduces
stretch monotonically with pass count on long ones, but does not reach 1% on a
52-row hanging sheet at any affordable cost:

| rows below the pin | 4 passes | 8 | 16 | 32 |
| --- | --- | --- | --- | --- |
| 8 | 1.07% | 1.02% | 1.00% | **1.00%** |
| 12 | 2.7% | 2.2% | 1.7% | 1.3% |
| 24 | 10.6% | 8.3% | 5.8% | 3.6% |
| 52 | 34.1% | 25.6% | 17.5% | 10.6% |

Convergence is slow because this is projection onto many nearly-parallel convex
sets; reaching 1% on 52 rows needs roughly 1000 passes per substep. Note the top
row of the table is the geometry Phase 4 actually simulates — the belted bodice is
pinned entirely, so only a short span hangs free below it.

Options for Phase 4, in increasing order of disruption:

1. **Accept it.** The rubberiness is part of the approved look, and pinning the
   bodice shortens every free span.
2. **Long-range attachments** — give each particle a max-distance constraint
   straight to its nearest pinned particle (geodesic rest length). This is the
   standard fix for exactly this case (top-pinned cloth) and costs one pass, not
   hundreds. Untested here.
3. **Raise `iterations`.** Cheap to try, changes the feel of every preset, and
   would need re-approval against the reference demo.

### (c) Preset differences

Settle times are strictly ordered light → heavy (116 / 81 / 74 / 64 substeps) with
silk taking 1.8x as long as nambu wool. Switching fabric mid-flight is a genuine
physics event: silk settled under wool drops to under a tenth of the energy it
had as silk, with no positional discontinuity.

## Finding: `density` does not affect gravity

Inherited from the reference demo, `density` divides the wind and grab response
only — the gravity term ignores it. So every fabric falls at the same rate, and
nambu wool does not hang lower than silk brocade. It settles about 0.25 units
*higher* on a 51-unit panel (under 0.5%), because its harder damping kills the
momentum overshoot that stretches the silk.

Product decision 5 asks the silk → wool switch to "visibly drop, stiffen, and go
still". Stiffen and go still are delivered and dramatic. **The drop is not there.**
Making it real means giving weight a role in the gravity/stretch response, which
changes the approved presets — a call for Thupten, not one to make silently.

## Layout

```
src/particles.ts     SoA buffers, grid construction, normals, index buffer
src/constraints.ts   structural/shear/bend building, PBD projection, strain limiting
src/fabric.ts        preset loading + validation from fabrics/presets.json
src/solver.ts        integrate -> grab -> project; step, stepFrame, settle
```

Determinism is a tested property: identical inputs give bit-identical state, and
there is no RNG or wall clock anywhere in the solver. `settle()` is the future
rest-state bake — the settled state per fabric is what Phase 4 wants to cache.
