/**
 * Colour matching for the outfit.
 *
 * The honju is never chosen on its own — it is the cloth that shows AGAINST the
 * chupa, in a narrow band at the collar and the sleeves. So the useful thing is
 * to let the chupa be picked freely and then offer the honjus that work with it.
 *
 * REBUILT 2026-08-11 on the research, after Thupten asked whether any of this
 * was real. It was not. An earlier version of this comment claimed "costume
 * studies of Tibetan dress" describe high-saturation complementary pairs held
 * together by a neutral ground. No such study was ever cited and none could be
 * found; everything retrievable on Tibetan dress colour is tourism-tier writing.
 * That sentence was invented and is now deleted rather than dressed up. What is
 * below is either measurable colour science or it is stated as taste.
 *
 * What the evidence actually supports:
 *
 *   LIGHTNESS MUST CONTRAST. The best-supported rule here by a distance, and
 *   the only one that survived from the old version. Ou & Luo's two-colour
 *   harmony model finds equal hue with UNEQUAL lightness to be the principle
 *   that predicts harmony best, and equal lightness the least harmonious
 *   configuration of all. Schloss & Palmer find lightness contrast raising every
 *   judgement they measured. It is also the practical truth for a garment: a
 *   band at the collar that lands near the chupa's own value disappears.
 *
 *   HUE CONTRAST IS FOR A FIGURE ON A GROUND, NOT FOR A PAIR. This is the
 *   distinction the classical rules miss, and it is the one that matters to a
 *   chupa. Schloss & Palmer separate three judgements that colour theory had
 *   been mashing together, and they come apart: judged HARMONY of a pair rises
 *   with hue SIMILARITY — complementary pairs score reliably LESS harmonious
 *   than neighbouring ones — while preference for a FIGURE seen against a
 *   ground rises with hue CONTRAST. The honju is a figure on a ground. So the
 *   contrasting suggestions are right for this garment, but for the opposite of
 *   the reason usually given, and they are not "harmonies". The list is
 *   therefore split in two and each half says which job it is doing.
 *
 *   THE WHEEL ITSELF WAS THE WRONG WHEEL. Adding 180° to an HSL hue does not
 *   give the perceptual opposite; HSL is a wrapper over sRGB, not a model of
 *   vision. Everything is now built in Oklab — see below — which is why the
 *   floors and ceilings the old code needed have gone.
 *
 *   A NEUTRAL CHUPA IS THE EXCEPTION. It has no family and no meaningful hue to
 *   take angles from, so it takes an accent instead. Deriving anything from the
 *   hue of a grey is reading numerical noise.
 *
 * Sources: Schloss & Palmer, "Aesthetic response to color combinations:
 * preference, harmony, and similarity", Atten Percept Psychophys 73 (2011);
 * Ou & Luo, "A colour harmony model for two-colour combinations", Color Res
 * Appl 31 (2006); Ottosson, "A perceptual color space for image processing"
 * (2020) for Oklab.
 *
 * The garment gives the classic proportion for free — the chupa is the field,
 * the honju the secondary, the collar the accent.
 */

export interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

export function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  // Normalise ONCE, at the top. The sector index used to be normalised and the
  // ramp term was not, so a negative hue produced a negative channel and a hex
  // string like "#bf40-15".
  const hue = (((h % 360) + 360) % 360);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const t = hue / 60;
  const [r, g, b] =
    t < 1 ? [c, x, 0] : t < 2 ? [x, c, 0] : t < 3 ? [0, c, x]
    : t < 4 ? [0, x, c] : t < 5 ? [x, 0, c] : [c, 0, x];
  const hx = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

// ---------------------------------------------------------------------------
// Oklab / OkLCh
//
// The suggestions used to be built by adding degrees to an HSL hue. HSL is a
// convenience wrapper over sRGB, not a model of vision: its hue wheel is not
// perceptually spaced — the greens sprawl across a third of it while the blues
// crowd into a corner — its "lightness" is the midpoint of the largest and
// smallest channel rather than perceived brightness, and its saturation means
// something different at every lightness. Every clamp in the old version was a
// patch over one of those faults: the saturation floor, the ceiling, and the
// note explaining that a colour pushed near white has no strength left whatever
// its saturation number says. That note was correct, and it was describing a
// defect in the space rather than anything about colour.
//
// Oklab fixes the three that matter here. L is perceived lightness, so "these
// two cloths differ in value" becomes a number that means it. Equal hue steps
// look equal, so the opposite of madder is the colour that actually looks
// opposite. Chroma is separable from lightness, so a partner can be made
// lighter without going pale. The matrices below are Ottosson's, unaltered.
// ---------------------------------------------------------------------------

export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

const srgbToLinear = (v: number): number =>
  (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v: number): number =>
  (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.slice(1), 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);

  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  return {
    l: L,
    c: Math.hypot(A, B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
}

/** Linear RGB for an OkLCh, before any gamut decision. */
function oklchToLinear(l: number, c: number, h: number): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = Math.cos(rad) * c;
  const B = Math.sin(rad) * c;

  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.2914855480 * B) ** 3;

  return [
    +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
  ];
}

const inGamut = ([r, g, b]: [number, number, number]): boolean =>
  r >= -1e-4 && r <= 1 + 1e-4 && g >= -1e-4 && g <= 1 + 1e-4
  && b >= -1e-4 && b <= 1 + 1e-4;

/**
 * OkLCh to hex, holding lightness and hue and giving up chroma.
 *
 * Most requested colours are outside what sRGB can show — a screen has no
 * vivid dark blue-green. Clipping the channels is the usual answer and it is
 * the wrong one: it shifts both the hue and the lightness, so the colour that
 * comes back is not the one that was asked for and the lightness contrast the
 * whole design rests on quietly stops holding. Chroma is the attribute a
 * garment can most afford to lose, so it is the one bisected away.
 */
/**
 * The most chroma sRGB can show at a given lightness and hue.
 *
 * Wildly uneven around the wheel — at mid lightness a red holds about twice
 * what a teal does — which is why "keep the chroma" is not a thing you can ask
 * for when moving a colour to another hue. What you can ask for is the same
 * FRACTION of what is available, which is what `tuneDyes` does.
 */
export function maxChromaAt(l: number, h: number): number {
  let lo = 0;
  let hi = 0.5;                       // beyond any sRGB colour
  if (inGamut(oklchToLinear(l, hi, h))) return hi;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(l, mid, h))) lo = mid; else hi = mid;
  }
  return lo;
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const L = Math.max(0, Math.min(1, l));
  const want = Math.max(0, c);
  const C = inGamut(oklchToLinear(L, want, h)) ? want : maxChromaAt(L, h);
  const rgb = oklchToLinear(L, C, h);
  const hx = (v: number) =>
    Math.round(Math.max(0, Math.min(1, linearToSrgb(v))) * 255)
      .toString(16).padStart(2, '0');
  return `#${hx(rgb[0])}${hx(rgb[1])}${hx(rgb[2])}`;
}

export interface Harmony {
  readonly name: string;
  readonly note: string;
  readonly hex: string;
}

/**
 * Below this a colour reads as a neutral and its hue is not worth taking angles
 * from. Set from a real case: Thupten picked #4A4A68, which is a grey-blue at
 * saturation 0.17, and every suggestion came back grey. If it looks grey it
 * should be treated as grey.
 */
export const NEUTRAL_SATURATION = 0.2;

/**
 * How far apart in perceived lightness two cloths have to sit.
 *
 * In Oklab L, where 0 is black and 1 is white and the scale is perceptual, so
 * these numbers mean what they say. The wider figure is for the partners that
 * stay near the chupa's own hue: hue is doing none of the separating there, so
 * value has to do all of it. That is Ou & Luo's finding used directly — equal
 * hue with unequal lightness is the pairing that predicts harmony best, and the
 * emphasis belongs on *unequal*.
 */
const MIN_VALUE_GAP = 0.20;
const NEAR_HUE_VALUE_GAP = 0.32;

/**
 * The one hue band worth steering around.
 *
 * Dark yellow-green is the reliably least-liked region of colour space in the
 * preference literature, and it is easy to land in by accident: darkening any
 * yellow walks straight into olive. Where a partner would end up there, it goes
 * light instead — the same hue high is straw or gold, which is not disliked at
 * all. If the chupa is itself a pale gold and the partner has to go dark to
 * keep its distance in value, the hue is pulled toward amber instead, where
 * dark reads as bronze rather than as mud.
 */
const OLIVE_FROM = 85;
const OLIVE_TO = 130;

export function harmoniesFor(chupa: string): Harmony[] {
  const hsl = hexToHsl(chupa);
  const base = hexToOklch(chupa);

  // Which way the partner moves in value. Away from the chupa, and away from
  // whichever end of the scale the chupa is already near — a dark cloth cannot
  // be partnered by going darker still.
  const lighter = base.l < 0.55;

  /**
   * A partner at a hue, given how far it has to travel in value.
   *
   * Chroma tracks the chupa's, so a muted cloth gets muted partners and a vivid
   * one vivid partners — the floor only stops a nearly-grey chupa returning
   * partners too weak to see as colours at all. Anything sRGB cannot show is
   * given up as chroma by `oklchToHex`, never as lightness.
   */
  const at = (hue: number, gap = MIN_VALUE_GAP, chromaMul = 1): string => {
    const h = ((hue % 360) + 360) % 360;
    let l = lighter
      ? Math.min(0.93, base.l + gap)
      : Math.max(0.16, base.l - gap);
    let hOut = h;
    if (h >= OLIVE_FROM && h <= OLIVE_TO && l < 0.70) {
      // Out of the olive well: up if there is room, and if there is not, round
      // the hue to amber where a dark value is bronze.
      if (base.l < 0.62) l = 0.78; else hOut = 70;
    }
    return oklchToHex({ l, c: Math.max(0.055, base.c * chromaMul), h: hOut });
  };

  if (hsl.s < NEUTRAL_SATURATION) {
    // A neutral has no family to stay in and no hue worth taking angles from,
    // so it gets a spread of real colour rather than more grey. Hues chosen for
    // the dyes they name, spaced to be plainly different from each other.
    const l = lighter ? Math.min(0.90, base.l + 0.26) : Math.max(0.20, base.l - 0.30);
    const accent = (h: number) => oklchToHex({ l, c: 0.11, h });
    return [
      { name: 'Madder', note: 'a neutral carries a warm accent', hex: accent(28) },
      { name: 'Saffron', note: 'warm — it lifts a grey', hex: accent(76) },
      { name: 'Jade', note: 'cool accent', hex: accent(165) },
      { name: 'Indigo', note: 'cool and quiet', hex: accent(255) },
      { name: 'Plum', note: 'the least obvious of them', hex: accent(340) },
      {
        name: 'Undyed', note: 'bone — always works',
        hex: oklchToHex({ l: lighter ? 0.94 : 0.42, c: 0.018, h: 80 }),
      },
    ];
  }

  // Undyed wool under a dark cloth, indigo under a light one. The ground goes
  // opposite in weight, because its whole job is to be the place the eye rests.
  const ground = lighter
    ? { note: 'undyed wool — the ground under a dark cloth', hex: oklchToHex({ l: 0.93, c: 0.016, h: 85 }) }
    : { note: 'indigo — the ground under a light cloth', hex: oklchToHex({ l: 0.30, c: 0.085, h: 265 }) };

  return [
    // Shown against the chupa. Hue contrast is what makes a band at the collar
    // read as its own cloth, and this is the half the evidence supports for a
    // figure on a ground.
    { name: 'Complement', note: 'straight across — the strongest reading', hex: at(base.h + 180) },
    { name: 'Split', note: 'across, but softened', hex: at(base.h + 150) },
    { name: 'Split, other', note: 'the other side of the pair', hex: at(base.h + 210) },
    { name: 'Triad', note: 'a third of the way round · lively', hex: at(base.h + 120) },

    // Sat with the chupa rather than against it. These are the pairings that
    // rate as harmonious, and they live or die on the value gap, which is why
    // they are given the wider one.
    { name: 'Analogous', note: 'a neighbour · calm, cohesive', hex: at(base.h + 32, NEAR_HUE_VALUE_GAP) },
    { name: 'Monochrome', note: 'the same dye, a different depth', hex: at(base.h, NEAR_HUE_VALUE_GAP, 0.78) },

    // Neither, and the safest things on the list.
    { name: 'Ground', note: ground.note, hex: ground.hex },
    {
      name: 'Undyed', note: 'bone — always works',
      hex: oklchToHex({ l: lighter ? 0.94 : 0.40, c: 0.022, h: base.h }),
    },
  ];
}

/**
 * Named colours. Whatever colour is picked, the card names the nearest one — a
 * colour with a name is a thing, a hex code is not.
 *
 * The names are English and, where there is one, they are the DYE's name rather
 * than a decorator's: madder, indigo, lac, walnut, saffron are what the cloth
 * was actually coloured with, so they read to a wearer as well as to a designer.
 * (These replaced a list of traditional Japanese colours — right idea, wrong
 * culture for a chupa.)
 */
export type NamedColour = readonly [name: string, hex: string];

export const NAMED_COLOURS: readonly NamedColour[] = [
  ['Crimson', '#cb1b45'],
  ['Deep Crimson', '#d0104c'],
  ['Madder', '#b7282e'],
  ['Scarlet', '#d3381c'],
  ['Vermilion', '#eb6101'],
  ['Cochineal', '#9e3d3f'],
  ['Mulberry', '#a25768'],
  ['Blush', '#fedfe1'],
  ['Rose', '#eebbcb'],
  ['Peach', '#f09199'],
  ['Ash Rose', '#9e8b8e'],
  ['Persimmon', '#ed6d3d'],
  ['Marigold', '#ee7800'],
  ['Ochre', '#c39143'],
  ['Dry Leaf', '#917347'],
  ['Russet', '#95483f'],
  ['Chestnut', '#762f07'],
  ['Walnut', '#563f2e'],
  ['Saffron', '#f8b500'],
  ['Turmeric', '#fabf14'],
  ['Honey', '#fcd575'],
  ['Pale Lemon', '#f8e58c'],
  ['Mustard', '#d0af4c'],
  ['Young Grass', '#c3d825'],
  ['Fresh Green', '#aacf53'],
  ['Moss', '#69821b'],
  ['Sage', '#839b5c'],
  ['Evergreen', '#007b43'],
  ['Pine', '#00552e'],
  ['Bamboo', '#68be8d'],
  ['Celadon', '#7ebea5'],
  ['Turquoise', '#00a3af'],
  ['Teal', '#008899'],
  ['Cornflower', '#2792c3'],
  ['Sky', '#a0d8ef'],
  ['Indigo', '#165e83'],
  ['Lapis', '#1e50a2'],
  ['Ultramarine', '#4e4f97'],
  ['Midnight', '#181b39'],
  ['Wisteria', '#8b81c3'],
  ['Lavender', '#a69abd'],
  ['Mauve', '#a87ba0'],
  ['Purple', '#884898'],
  ['Iris', '#cc7eb1'],
  ['Wine', '#640125'],
  ['Undyed Silk', '#fbfaf5'],
  ['Ivory', '#f8f4e6'],
  ['Silver', '#91989f'],
  ['Grey', '#949495'],
  ['Ink', '#595857'],
  ['Black', '#180614'],
];

/**
 * Nearest named colour, measured in Oklab.
 *
 * It used to be a weighted sum of squared sRGB channel differences, and sRGB
 * distance is not perceptual distance: a mid green came back as "Ink", losing
 * to a warm grey by about two percent, and two plainly different pangden dyes
 * — a teal and a navy — both came back "Indigo", which is not a spec anyone can
 * dye from. Oklab was built for exactly this comparison and it is already in
 * the file.
 *
 * Chroma is weighted a little above lightness. A name is mostly a claim about
 * WHICH colour something is rather than how dark it is, and without this a
 * saturated hue keeps falling into the greys, which is the failure that started
 * this.
 */
/** Oklab a/b for a hex, alongside its L — the plane a hue lives in. */
function oklabOf(hex: string): [number, number, number] {
  const { l, c, h } = hexToOklch(hex);
  const rad = (h * Math.PI) / 180;
  return [l, Math.cos(rad) * c, Math.sin(rad) * c];
}

const NAMED_LAB: readonly (readonly [number, number, number])[] =
  NAMED_COLOURS.map((c) => oklabOf(c[1]));

export function nearestNamed(hex: string): NamedColour {
  const [l, a, b] = oklabOf(hex);
  let best = NAMED_COLOURS[0];
  let bestD = Infinity;
  for (let i = 0; i < NAMED_COLOURS.length; i++) {
    const [nl, na, nb] = NAMED_LAB[i];
    const dl = l - nl;
    const da = a - na;
    const db = b - nb;
    const d = dl * dl + 1.6 * (da * da + db * db);
    if (d < bestD) { bestD = d; best = NAMED_COLOURS[i]; }
  }
  return best;
}
