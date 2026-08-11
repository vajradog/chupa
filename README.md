# Chupa ཕྱུ་པ་

A grown-up dress-up game for the Ü-Tsang Tibetan woman's chupa.

**→ [vajradog.github.io/chupa](https://vajradog.github.io/chupa/)**

The chupa is a fixed design. Women never change the cut — only the colours and
the cloth of the chupa and the honju beneath it. That constraint is the whole
idea here: **one garment, infinite expression through colour and material.**
You pick colours; a physically simulated cloth responds like cloth.

<br>

## Why this is buildable at all

Traditional Tibetan tailoring is **rectilinear**. Chupas were historically cut
from narrow loom-width nambu strips, so the pattern pieces are rectangles,
trapezoids and simple triangular gores — no curved seams, no darts. That
collapses the hardest part of garment software into almost nothing, and it is
culturally correct: the app builds a chupa the way a Lhasa tailor does.

The same is true of the apron. A pangden is one long woven strip, cut into three
lengths and sewn edge to edge, with the middle length turned upside down. So the
code does exactly that, and the properties that follow — every panel sharing one
set of band heights, the bands never lining up across the apron, the outer two
panels reading as a pair — are tests rather than decoration.

<br>

## Built from scratch

No three.js, no physics library, no CAD. External dependencies are build tooling
only: Vite, TypeScript, Vitest.

| | |
| --- | --- |
| **`@chupa/cloth`** | Verlet integration and PBD constraint projection. Pure TypeScript, typed-array SoA, renderer-agnostic, zero dependencies. Fabrics are parameter blocks — bend stiffness, density, damping, sheen. |
| **`@chupa/body`** | A parametric female form lathed from a small measurement set, baked to a signed-distance grid for collision and friction. Static forever, so it is baked once. |
| **`@chupa/garment`** | The chupa itself: eleven pieces, three of them live cloth. The apron's weave, the seven regional stripe programs, and the colour engine. |

The solver stays pure so it ports line-for-line to Rust/WASM or a compute shader
if profiling ever demands it. Budget is 15k simulated particles at 60fps on a
mid-range phone; pinning everything above the waist is what buys the headroom.

<br>

## Colour is measured, not folklore

The suggestion engine is built in **Oklab**, and it is justified from research
rather than from colour-wheel tradition.

- **Lightness contrast is the load-bearing rule.** Ou & Luo find equal hue with
  *unequal* lightness the principle that best predicts harmony, and equal
  lightness the least harmonious configuration there is.
- **Hue contrast is for a figure on a ground, not for a pair.** Schloss & Palmer
  separate three judgements that classical theory conflates: judged *harmony*
  rises with hue **similarity** — complementary pairs score reliably *less*
  harmonious — while preference for a **figure seen against a ground** rises
  with hue **contrast**. A honju is a band at the collar shown against the
  chupa. So contrast is right here, for the opposite of the usual reason.
- **The wheel itself was the wrong wheel.** Adding 180° to an HSL hue does not
  give the perceptual opposite. Oklab does.

<br>

## What is known, and what is a guess

This project sits next to [Khadog](https://github.com/terma-heritage), a
dictionary of the traditional Tibetan palette, and inherits its habit of saying
which is which.

**Sourced.** The pangden's dyestuffs and regional styles come from Buckley's
fieldwork — indigo, Indian madder compounded with bangtsen lichen, Bhutanese lac
for the vivid pinks, barberry and rhubarb-root yellows over-dyed for green,
walnut husk for the darks. There is no green dyestuff, and no true black.

**Interpretation.** The seven regional stripe programs are readings of his
written descriptions. He writes "dark blue-green overall, enlivened with narrow
stripes of red"; he does not say which dark blue-green, how many stripes, or how
narrow. The character of each is faithful and tested. Every number is invented.

**Still a guess.** Every value in `body/measurements.json` and
`pattern/panels.json` is unconfirmed until its key is moved into `$fromThupten`.
Correcting a number costs nothing downstream — the drawing, the shell and the
apron are all generated from them.

<br>

## Running it

```bash
npm install
npm run dev      # the dressing room
npm test         # 174 tests
```

The dressing room is a **front elevation** — deliberately 2D. The figure never
turns, so the front view is a complete description of the garment; settling the
drawing here is far cheaper than authoring a 3D shell blind. Nothing on it is
hand-placed. The 3D pieces live at `/dev/`.

<br>

---

**Chupa Designer** · Thupten Chakrishar / GunkTech
Colour and pangden research after **Khadog**, a project of the Terma Heritage Foundation
