# @chupa/body

The mannequin. A parametric female form — a lathed torso plus capsule arms and
neck — baked once to an SDF grid that the cloth solver collides against.

There is no model file and nothing to import. The whole figure comes out of
`body/measurements.json`: change a number, get a different woman.

```ts
import { buildForm, bakeSdf, createSdfCollider } from '@chupa/body';

const form = buildForm();                                  // from measurements.json
const grid = bakeSdf(form.sdf, form.bounds, { cell: 0.5 }); // ~35 ms, ~1 MB
const collider = createSdfCollider(grid, { friction: 0.6 });

createSolver({ cloth, fabric, collider });                  // that's the whole hookup
```

See it: `npm run dev`, then `/dev/mannequin/`.

## Phase 2 acceptance

> a cloth square dropped on the shoulder drapes convincingly against the form
> without tunneling at reference solver settings

Met, for all four fabrics. Measured on a 60 cm square released above her head:
peak penetration stays under 0.25 world units (half a voxel, the collider's own
standoff), the cloth catches on both shoulders, wraps 12–17 units front to back,
and roughly 55% of its particles end up in contact.

## Two things worth knowing

**Friction is Coulomb, not viscous.** The first implementation damped tangential
velocity, which cannot hold cloth on a slope at all — it only slows the slide. A
square shawl crept off her shoulders over about eight seconds. The collider now
absorbs up to `mu * penetration` of tangential motion per contact, so cloth
sticks on any slope shallower than `atan(mu)`; at the default 0.6 that is about
31 degrees.

**Loose cloth still creeps off eventually, and that is correct.** With nothing
pinned, silk and cotton work their way off the figure after 20–30 seconds; nambu
wool stays indefinitely. Real cloth does this. Nothing in the actual garment is
held by friction alone — the chupa's bodice is pinned and belted — so this only
ever shows up in the bare drop test, where it is asserted rather than fixed.

## The interior of the SDF is approximate

`latheSdf` collapses the surface of revolution into its meridian plane and
measures distance along the query point's bearing. Outside the body and near the
surface — everywhere cloth ever is — that is accurate to well under a voxel.
On the centreline of an elliptical cross-section it reports the wide radius
instead of the true nearest distance, so the field has a seam down the axis that
the bake cannot resolve. Harmless, tested, and documented here so it is not
rediscovered as a bake bug.

## Layout

```
src/measurements.ts  load + validate body/measurements.json
src/profile.ts       circumference -> ellipse, the ring stack, the lathe SDF
src/shapes.ts        exact capsule / round cone / smooth min
src/form.ts          assembles torso + limbs into one signed distance function
src/sdf.ts           bake, trilinear sample, finite-difference gradient
src/collide.ts       project out, kill normal velocity, Coulomb friction
src/mesh.ts          dev-only triangle mesh so a human can look at her
```

Below the hip the two legs are lathed as one merged column. For a floor-length
wrap dress on a figure that never moves, the skirt never falls between the legs,
and keeping the lower body inside a single surface of revolution is what makes
the cheap meridian-plane SDF valid.
