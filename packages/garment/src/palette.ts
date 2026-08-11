/**
 * The pangden stripe palette. Letters are referenced by the stripe programs in
 * `pattern/panels.json` and in `pangden.ts`.
 *
 * Nine of these came over verbatim from the approved phase-one demo. `N` was
 * added when the regional programs were written, because several of the styles
 * Buckley describes are built on brown and no letter carried one — walnut husk
 * is one of the seven dyestuffs he records, so the gap was in the palette
 * rather than in the descriptions.
 *
 * What these are NOT: measurements. Nobody has put a spectrophotometer on the
 * cloth. They are plausible values for the dyes named, and the dye each one
 * stands for is the honest part:
 *
 *   R  madder, usually compounded with bangtsen lichen
 *   O  the rhubarb-like root
 *   Y  barberry
 *   G  indigo over-dyed on a yellow — there is no green dyestuff
 *   T  the same over-dye, further toward the indigo
 *   B  indigo
 *   M  Bhutanese lac (gyasar) — the vivid pinks, and precious
 *   N  walnut husk
 *   W  undyed wool
 *   K  walnut over indigo — the darkest band, and never a true black
 */

export const PANGDEN_PALETTE: Record<string, readonly [number, number, number]> = {
  R: [179, 40, 45],
  O: [217, 108, 43],
  Y: [224, 165, 38],
  G: [62, 122, 69],
  T: [46, 127, 135],
  B: [44, 78, 138],
  M: [166, 58, 110],
  N: [104, 68, 48],
  W: [232, 226, 212],
  K: [38, 36, 40],
};

/** `#rrggbb` for a palette letter. Unknown letters fall back to undyed wool. */
export function pangdenHex(letter: string): string {
  const c = PANGDEN_PALETTE[letter] ?? PANGDEN_PALETTE.W;
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
