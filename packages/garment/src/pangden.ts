/**
 * The pangden: how the apron is woven, cut, and sewn.
 *
 * This is the one part of the outfit where there is real fieldwork to build on,
 * so it is built on it rather than invented. The spine is Buckley ("Local
 * Colour", HALI c. 2014 — first-hand, named informants, textiles from the Karun
 * Thakar Collection), held as sourced data in the sibling Khadog project.
 *
 * THE CONSTRUCTION. The apron is woven as ONE long continuous strip. That strip
 * is cut into three lengths and the lengths are sewn edge to edge to make the
 * width. The middle length is often turned upside down before it is sewn in, so
 * the two outer panels read alike while the centre one runs the other way.
 *
 * That account is Khadog's editor testimony — practitioner knowledge awaiting a
 * citable source — and it is recorded as such there rather than as published
 * fact. It is used here because it explains what the published source leaves
 * unexplained, and because everything it predicts is checkable against the
 * object. Three consequences, all of them tested below:
 *
 *   ONE STRIP MEANS ONE SET OF BAND HEIGHTS. Every panel is cut from the same
 *   weaving, so a given band is the same height in each. A render showing a
 *   colour thick in one panel and thin in another has a bug, not a cloth.
 *
 *   THE PANELS ARE NOT ALIGNED. This part IS published — Buckley records it.
 *   Cut at three different points along the strip, the panels start mid-band
 *   and at different places, so the bands do not line up across the apron.
 *
 *   THE MIDDLE ONE RUNS BACKWARDS. Which is what makes the outer two read as a
 *   pair. This is the part that gives a way to check a render against a
 *   photograph: if panels one and three disagree in direction, it is wrong.
 *
 * And one thing to NOT draw: the panels are sewn edge to edge. There is no
 * gutter between them, and a render that shows one is inventing a feature.
 */

import { PANGDEN_PALETTE, pangdenHex } from './palette.js';
import { hexToOklch, oklchToHex } from './colour.js';
import type { PangdenSpec } from './spec.js';

/** One woven length, after cutting and sewing. */
export interface PangdenPanel {
  /** Palette letter per row, hem first. */
  readonly rows: readonly string[];
  /** Sewn in upside down — true for the middle length. */
  readonly inverted: boolean;
  /** Where along the woven strip this length was cut from, in rows. */
  readonly cutAt: number;
}

/** A band of one colour, merged from the rows that share it. */
export interface PangdenBand {
  readonly letter: string;
  readonly hex: string;
  /** Rows [from, to) within the panel, hem first. */
  readonly from: number;
  readonly to: number;
}

export interface PangdenWeave {
  readonly panels: readonly PangdenPanel[];
  readonly bands: readonly (readonly PangdenBand[])[];
  readonly rows: number;
  readonly program: string;
}

/**
 * Expand a stripe program into one palette letter per row.
 *
 * `offset` winds the program forward, which is what cutting a strip further
 * along does to the colour you start on.
 */
export function expandStripe(program: string, rows: number, offset = 0): string[] {
  const bands = program.trim().split(/\s+/)
    .filter((s) => s.length > 0)
    .map((s) => ({ c: s[0], w: Math.max(1, Math.round(Number(s.slice(1)) || 1)) }));
  if (bands.length === 0) throw new Error('pangden: empty stripe program');
  const total = bands.reduce((n, b) => n + b.w, 0);

  const out: string[] = [];
  let band = 0;
  let left = bands[0].w;
  for (let i = 0; i < ((offset % total) + total) % total; i++) {
    if (--left === 0) { band = (band + 1) % bands.length; left = bands[band].w; }
  }
  for (let r = 0; r < rows; r++) {
    out.push(bands[band].c);
    if (--left === 0) { band = (band + 1) % bands.length; left = bands[band].w; }
  }
  return out;
}

/** Merge a run of rows sharing a letter into one band. */
function bandsOf(
  rows: readonly string[],
  dyes: Readonly<Record<string, string>>,
): PangdenBand[] {
  const out: PangdenBand[] = [];
  let from = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i === rows.length || rows[i] !== rows[from]) {
      const letter = rows[from];
      out.push({ letter, hex: dyes[letter] ?? pangdenHex(letter), from, to: i });
      from = i;
    }
  }
  return out;
}

/**
 * Weave one apron.
 *
 * `rows` is the resolution the caller wants down the length of a panel — the
 * drawing and the simulation ask for different numbers, and the cloth is the
 * same cloth either way, so the band heights are in rows rather than in cm.
 */
export function weavePangden(
  spec: PangdenSpec,
  rows: number,
  /**
   * Letter to hex, overriding the default dye for that letter.
   *
   * The apron's colours are not one colour, so "recolour the pangden" has to
   * mean recolouring a DYE — every band woven with madder moves together, in
   * all three panels, because they were dyed in the same pot. Passing the
   * override in rather than mutating the palette keeps the module's own table
   * meaning what it says.
   */
  dyes: Readonly<Record<string, string>> = {},
): PangdenWeave {
  const strips = Math.max(1, Math.round(spec.strips));
  const middle = (strips - 1) / 2;

  const panels: PangdenPanel[] = [];
  for (let k = 0; k < strips; k++) {
    // Consecutive cuts from one strip. Panel k begins where panel k-1 ended,
    // which is why the bands are the same heights and still do not line up.
    const cutAt = k * rows;
    const woven = expandStripe(spec.stripeProgram, rows, cutAt);
    // The centre length goes in upside down. With an even number of panels
    // there is no true centre, so the two innermost take the turn — the point
    // is that the outermost pair reads as a pair.
    const inverted = Math.abs(k - middle) < 0.75;
    panels.push({ rows: inverted ? [...woven].reverse() : woven, inverted, cutAt });
  }

  return {
    panels,
    bands: panels.map((p) => bandsOf(p.rows, dyes)),
    rows,
    program: spec.stripeProgram,
  };
}

/**
 * The dyes an apron actually uses, in the order the weaver lays them down.
 *
 * Program order rather than alphabetical: it is the order you meet the colours
 * going up the cloth, so a list of them reads like the apron does.
 */
export function dyesInProgram(program: string): string[] {
  const seen: string[] = [];
  for (const word of program.trim().split(/\s+/)) {
    const c = word[0];
    if (c && !seen.includes(c)) seen.push(c);
  }
  return seen;
}

/**
 * Buckley's regional styles, as stripe programs.
 *
 * INTERPRETATIONS, and the labels say so wherever these are shown. Buckley
 * writes "large, dark blue-green overall, enlivened with narrow stripes of red
 * or purplish shades"; he does not say which dark blue-green, how many stripes,
 * or how narrow, and nobody has measured the cloth. What is faithful here is
 * the CHARACTER each description gives — which colours dominate, which are
 * accents, whether the bands are wide or narrow, even or uneven. What is
 * invented is every number.
 *
 * The seven are all the areas he describes. `Towns` is the odd one out and is
 * his point rather than mine: in Lhasa, Shigatse and Gyantse there are few
 * weavers, families buy rather than weave, and the design is as much fashion as
 * tradition.
 */
export interface PangdenRegion {
  readonly name: string;
  /** Buckley's own characterisation, compressed. */
  readonly note: string;
  readonly stripeProgram: string;
}

export const PANGDEN_REGIONS: readonly PangdenRegion[] = [
  {
    name: 'Tingri',
    note: 'dark blue-green overall, narrow red and purple',
    stripeProgram: 'T7 R1 T6 M1 T8 R2 T5 M1 T6 R1',
  },
  {
    name: 'Sakya',
    note: 'dark red, white and brown — narrow, sombre',
    stripeProgram: 'R2 W1 N2 W1 R3 N1 W1 R2 N2 W1 R1 N1',
  },
  {
    name: 'Panam',
    note: 'wide green and blue, narrow red, white, brown',
    stripeProgram: 'G5 R1 B5 W1 G4 N1 B5 R1 W1 G4 B4',
  },
  {
    name: 'Nyalam',
    note: 'white stripes are typical of the area',
    stripeProgram: 'W2 B3 W1 R2 W2 G3 W1 K1 W2 B2',
  },
  {
    name: 'Dolpo',
    note: 'very large, wide red and orange-yellow',
    stripeProgram: 'R5 Y5 R4 O5 R5 Y4',
  },
  {
    name: 'Near Kailash',
    note: 'red, green and orange in bands of even width',
    stripeProgram: 'R3 G3 O3',
  },
  {
    name: 'Towns',
    note: 'Lhasa, Shigatse, Gyantse — bought not woven, narrow and even',
    stripeProgram: 'R1 Y1 G1 T1 B1 M1 W1 O1 K1 W1',
  },
];

/** Look a region up by name. */
export function pangdenRegion(name: string): PangdenRegion | undefined {
  return PANGDEN_REGIONS.find((r) => r.name === name);
}

/**
 * Below this chroma a dye is not a colour, it is wool. Undyed white and the
 * walnut-on-indigo near-black both sit under it, and neither should move when
 * the outfit changes — nobody dyes their undyed wool to go with a chupa.
 */
const NEUTRAL_CHROMA = 0.04;

/**
 * Re-dye an apron to sit with a particular chupa and honju.
 *
 * NOT a match, and the difference matters. Traditionally the pangden is not
 * dyed to go with anything: it comes off another loom, in a regional palette,
 * and is often bought rather than woven. Matching it to the chupa would also be
 * the wrong move visually — it is a figure against the chupa's ground, which is
 * the case where hue contrast wins, so a tone-on-tone apron throws away the one
 * loud thing in the outfit.
 *
 * So this TUNES rather than matches, and it moves TWO DYES:
 *
 *   The ground goes opposite the chupa. Whichever dye covers most of the cloth
 *   is moved to the chupa's perceptual complement, because that is the one dye
 *   that would otherwise vanish into the skirt — Sakya's ground is madder, and
 *   a madder apron on a madder chupa is one flat red panel.
 *
 *   The loudest accent echoes the honju. One band, so there is a thread of the
 *   blouse running through the apron. Skipped when the honju is a neutral,
 *   because the hue of a bone-coloured cloth is numerical noise.
 *
 *   EVERYTHING ELSE STAYS ON ITS PLANT. This is a correction, and the reason is
 *   worth keeping. The first version rotated every dye through the same angle,
 *   on the theory that a uniform turn preserves the palette's structure. It does
 *   preserve the structure and it destroys the identity: the rotation that puts
 *   a madder ground opposite a madder chupa is 180°, and 180° is exactly the
 *   operation that turns every warm dye cool. Tuned that way, Sakya — "dark red,
 *   white and brown, echoing the stripes painted on the house walls" — came back
 *   as teal and navy. Structurally perfect, and not an apron from Sakya.
 *   Two dyes move; the rest of the region survives.
 *
 *   The undyed and near-black bands do not move at all.
 *
 * A MOVED DYE CAN COME BACK DULLER, and that is the gamut rather than a bug —
 * see `moveTo`. It is also much less damaging now that only two dyes move: the
 * Sakya ground still loses chroma going to teal, but its brown and its white
 * are untouched, so the apron still reads as narrow sombre stripes.
 */
export function tuneDyes(
  program: string,
  chupa: string,
  honju: string,
): Record<string, string> {
  const letters = dyesInProgram(program);
  // Share of the cloth, over enough rows that band widths dominate rounding.
  const share = new Map<string, number>();
  for (const c of expandStripe(program, 360)) share.set(c, (share.get(c) ?? 0) + 1);

  const chromatic = letters.filter((l) => hexToOklch(pangdenHex(l)).c >= NEUTRAL_CHROMA);
  if (chromatic.length === 0) return {};

  /**
   * Move one dye to a new hue, keeping its lightness and asking for its chroma.
   *
   * Asking, not keeping — and where sRGB cannot give it, it comes back duller.
   * That is physics rather than a bug: at this lightness a teal simply holds
   * about half the chroma a red does, so a madder ground moved opposite a madder
   * chupa loses half its colour and there is nowhere for it to go.
   *
   * Preserving chroma as a FRACTION of what each hue can hold was tried here to
   * fix that, and it is worse. It does nothing for the case it was aimed at —
   * madder is already near the ceiling, so its fraction is ~0.9 and 0.9 of a
   * teal ceiling is the same duller teal — while in the other direction it turns
   * a muted dye moving into a roomy hue LOUD: Tingri's soft blue-green ground
   * came back as vivid magenta at more than twice its chroma. Losing chroma is
   * forced; gaining it is a choice, and the wrong one for an apron whose
   * character is that it is muted.
   */
  const moveTo = (from: string, hue: number): string => {
    const o = hexToOklch(from);
    return oklchToHex({ l: o.l, c: o.c, h: hue });
  };

  const out: Record<string, string> = {};

  const ground = chromatic.reduce((a, b) => ((share.get(b) ?? 0) > (share.get(a) ?? 0) ? b : a));
  out[ground] = moveTo(pangdenHex(ground), (hexToOklch(chupa).h + 180) % 360);

  // The honju echo, but only where there is a dye to spare.
  //
  // At least one coloured dye has to come through on its own plant, or there is
  // nothing of the region left to have re-dyed. Sakya is the case that forces
  // this: it has exactly two coloured dyes, madder and walnut, so moving the
  // ground AND an accent moves everything, and "Sakya with a teal ground" —
  // which still reads as Sakya — becomes teal and blue, which does not.
  const honjuOk = hexToOklch(honju);
  const accent = chromatic
    .filter((l) => l !== ground)
    .sort((a, b) => (share.get(b) ?? 0) - (share.get(a) ?? 0))[0];
  if (accent && chromatic.length >= 3 && honjuOk.c >= NEUTRAL_CHROMA) {
    out[accent] = moveTo(pangdenHex(accent), honjuOk.h);
  }

  // A dye that did not actually move is not moved.
  //
  // The rotation can be nearly nothing — Tingri's blue-green ground already
  // sits almost exactly opposite madder, so tuning that apron to that chupa is
  // a two-degree turn. Recording those as overrides made every chip claim it
  // had been moved off its plant and lit the "put them back" button, over a
  // change nobody can see. Overrides are only kept where the cloth changed.
  for (const [letter, hex] of Object.entries(out)) {
    if (hex === pangdenHex(letter)) { delete out[letter]; continue; }
    const a = hexToOklch(hex);
    const b = hexToOklch(pangdenHex(letter));
    const dh = Math.abs(((a.h - b.h + 540) % 360) - 180);
    if (dh < 1.5 && Math.abs(a.l - b.l) < 0.01 && Math.abs(a.c - b.c) < 0.01) {
      delete out[letter];
    }
  }
  return out;
}

/** Every letter a program uses, for checking one against the palette. */
export function lettersUsed(program: string): string[] {
  return [...new Set(program.trim().split(/\s+/).map((s) => s[0]))]
    .filter((c) => c !== undefined);
}

/** True when every letter in the program has a colour. */
export function programIsPaintable(program: string): boolean {
  return lettersUsed(program).every((c) => c in PANGDEN_PALETTE);
}
