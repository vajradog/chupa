# @chupa/garment

The chupa itself: one fixed garment shape, built directly around the mannequin.

**No pattern pieces, no seams, no draping solve.** This is a dress-up game — the
cut never changes, so the shape is authored once from the finished-garment
proportions in `pattern/panels.json`. What a user changes is colour and cloth.

```ts
const form = buildForm();
const chupa = buildChupa(form);        // eleven pieces, three of them live

for (const piece of chupa.pieces) {
  if (piece.live) createSolver({ cloth: piece.cloth, fabric, collider });
}
```

See it: `npm run dev`, then `/dev/chupa/`.

## Pieces

| piece | kind | grid |
| --- | --- | --- |
| bodice | pinned | 28 × 13 tube, deep V at the front |
| shoulderLeft / shoulderRight | pinned | 6 × 14 broad panels, neck out to the arm |
| collarLeft / collarRight | pinned | 6 × 16 — the honju's shawl collar, folded out over the V |
| sash | pinned | 28 × 5 band at the waist, chupa fabric |
| **skirt** | **live** | 30 × 37 closed tube |
| **flap** (the crossover wrap) | **live** | 10 × 33 |
| **pangden** | **live** | 17 × 25, striped |
| sleeveLeft / sleeveRight | pinned | 16 × 24 tubes on the arms — honju, the only sleeves |

1,865 live particles of 3,497 total, against a 15k budget. Pinning everything
above the waist is what buys that headroom, exactly as planned.

## The skirt is a column, not a flare

The reference photographs show a slim wrap falling straight from the waist to the
ankle. The first build gathered it to 1.8× the waist and flared it to the hem;
that was its single biggest error, and there is a test guarding against the
regression.

So the skirt is a closed tube that follows the body from the waist out over the
hip and then stops following — below the hip the legs narrow and the cloth does
not, because a skirt does not taper to the ankles. `waistGatherRatio` is the
surplus fabric in that tube: rest spacing is one world unit, so the segment count
*is* the fabric circumference. At 1.08 it is only the wrap overlap and a centre
back pleat. Gravity puts those folds in on its own the first time you step the
solver — there are no authored pleats.

## Two limitations, both deliberate

**No cloth-vs-cloth collision.** The solver does not have it, and the fixed
silhouette does not need the general version. Instead `createSkirtCollider`
re-reads the skirt's live silhouette each substep and hands it to the pangden and
the flap as a surface to ride on, at different standoffs so they layer correctly
(pangden outermost — it is tied on last). The skirt is treated as a surface of
revolution, one radius per height, so a pleat opening on one side lifts the panel
at that height everywhere. Not visible at these standoffs.

**Front is −Z.** The camera looks along +Z, so the side anyone sees is −Z.
Building the pangden and flap at +Z put them on her back, hidden behind the
skirt, and nothing in the numbers said so — it took a screenshot. There is a test
for it now.

## Everything here is a guess

`pattern/panels.json` was corrected against Thupten's reference photographs on
2026-08-09 — those keys are listed under `$fromPhotos`. Everything else is still
an unconfirmed guess until Thupten moves its key into `$fromThupten`. The ones that most
change what you see:

- **`waistGatherRatio`** — the silhouette, as above.
- **`pangden.width`** — 42 cm on a 70 cm waist covers the front and no more, which
  is what the photographs show; it does not wrap to the back.
- **`hemFromFloor`** — ankle length.
- **`crossoverWidth`** — how much of the wrap edge shows past the pangden.

Correcting numbers costs nothing downstream: every piece is generated from them.
