/**
 * Flat dev page — the chupa as a front elevation.
 *
 * Deliberately 2D. The 3D shell was being authored blind: every correction cost
 * a build-and-squint round trip and the result still did not look like the
 * garment. The figure never turns, so the front elevation is a complete
 * description of the chupa — settle the drawing here, then wrap it.
 *
 * Nothing on this page is hand-placed. Every point comes out of
 * `buildFlatChupa`, which reads `pattern/panels.json`, so what you see is what
 * the shell is being built from.
 */

import { buildForm } from '@chupa/body';
import {
  FABRICS, MATERIAL_KEYS, createGridCloth, createSolver, energy, stepFrame,
} from '@chupa/cloth';
import type { Fabric } from '@chupa/cloth';
import {
  GARMENT_SPEC, buildFlatChupa, harmoniesFor, hexToHsl, hslToHex, nearestNamed,
} from '@chupa/garment';
import type { FlatRegion, GarmentSpec } from '@chupa/garment';

const form = buildForm();
const HEIGHT_CM = form.measurements.height;

// ---------------------------------------------------------------------------
// Live numbers
//
// Every shape argument we have been going back and forth on is a slider here.
// Measuring a hand-drawn line off a screenshot is lossy and I kept getting it
// wrong; dialling it directly is exact. `save` writes them into panels.json,
// which is the same file the 3D shell reads.
// ---------------------------------------------------------------------------

interface Knob {
  group: 'chupa' | 'honju';
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

const KNOBS: Knob[] = [
  { group: 'chupa', key: 'vNeckDrop', label: 'fold at centre', min: 4, max: 34, step: 0.5 },
  { group: 'chupa', key: 'wrapEndX', label: 'fold ends across', min: 2, max: 20, step: 0.5 },
  { group: 'chupa', key: 'wrapEndDrop', label: 'fold ends down', min: 6, max: 34, step: 0.5 },
  { group: 'chupa', key: 'collarReach', label: 'collar reach', min: 0.2, max: 1, step: 0.02 },
  { group: 'chupa', key: 'collarUnderReach', label: 'under reach', min: 0, max: 0.6, step: 0.02 },
  { group: 'honju', key: 'collarWidth', label: 'collar width', min: 2, max: 14, step: 0.25 },
  { group: 'honju', key: 'sleeveEase', label: 'sleeve ease', min: 0.5, max: 8, step: 0.25 },
  { group: 'honju', key: 'armholeGap', label: 'sleeve starts', min: 0, max: 24, step: 0.5 },
  { group: 'honju', key: 'deltoidDrop', label: 'shoulder curve', min: 2, max: 30, step: 0.5 },
  { group: 'chupa', key: 'necklineWidth', label: 'neck opening', min: 6, max: 26, step: 0.5 },
  { group: 'chupa', key: 'shoulderPanelWidth', label: 'strap width', min: 1, max: 20, step: 0.25 },
  { group: 'chupa', key: 'wrapBandWidth', label: 'wrap band', min: 1, max: 10, step: 0.25 },
  { group: 'chupa', key: 'armholeDrop', label: 'armhole', min: 8, max: 42, step: 0.5 },
  { group: 'chupa', key: 'shoulderSlopeDeg', label: 'shoulder slope', min: 0, max: 40, step: 0.5 },
  { group: 'chupa', key: 'armholeScoop', label: 'armhole scoop', min: 0, max: 6, step: 0.25 },
  { group: 'chupa', key: 'sashWidth', label: 'sash', min: 2, max: 14, step: 0.5 },
  { group: 'chupa', key: 'hemFlare', label: 'hem flare', min: 1, max: 1.9, step: 0.01 },
];

const live: Record<string, Record<string, number>> = { chupa: {}, honju: {} };
for (const k of KNOBS) {
  live[k.group][k.key] = (GARMENT_SPEC[k.group] as unknown as Record<string, number>)[k.key];
}

function currentSpec(): GarmentSpec {
  return {
    ...GARMENT_SPEC,
    chupa: { ...GARMENT_SPEC.chupa, ...live.chupa },
    honju: { ...GARMENT_SPEC.honju, ...live.honju },
  };
}

// Lightest first: the list reads as a scale of weight, which is the thing that
// actually distinguishes these cloths.
void MATERIAL_KEYS;
let material: Fabric = FABRICS.silk;
// The honju is its own cloth. It only changes how the sleeves and collar CATCH
// THE LIGHT here — the chupa's cloth is the one that governs the cut.
let honjuMaterial: Fabric = FABRICS.charmeuse;

let flat = buildFlatChupa(form, currentSpec(), material);
function rebuild() {
  flat = buildFlatChupa(form, currentSpec(), material);
  measureSkirt();
  draw();
}

// ---------------------------------------------------------------------------
// A little real physics
//
// The page is a flat drawing, but the SOLVER IS REAL — this is `@chupa/cloth`
// from Phase 1, the same Verlet + PBD core the finished garment will run on,
// with the same fabric block driving it. What it simulates here is not the
// garment: it is one narrow hanging strip, pinned along the waist, whose sway
// is read back out and used to bend the drawing.
//
// That is the honest version of "a bit of physics" on a 2D page. Nothing about
// the cut is invented — the pattern is exactly what `buildFlatChupa` produced —
// but the skirt now hangs from a simulation rather than from nothing, so it
// breathes, and a colour lands on cloth that answers.
//
// The strip is 20 x 14; a couple of hundred particles against the 15k budget.
// ---------------------------------------------------------------------------

const SWAY_COLS = 12;
const SWAY_ROWS = 24;
/** Waist and hem of the skirt, in cm — the span the strip is mapped onto. */
let skirtTopCm = 0;
let skirtHemCm = 0;
let skirtMinXCm = 0;
let skirtWidthCm = 0;
function measureSkirt() {
  const skirt = flat.regions.find((r) => r.name === 'skirt');
  if (!skirt) return;
  let lo = Infinity, hi = -Infinity, xlo = Infinity, xhi = -Infinity;
  for (const [x, y] of skirt.outline) {
    lo = Math.min(lo, y); hi = Math.max(hi, y);
    xlo = Math.min(xlo, x); xhi = Math.max(xhi, x);
  }
  skirtHemCm = lo;
  skirtTopCm = hi;
  skirtMinXCm = xlo;
  skirtWidthCm = xhi - xlo;
}
measureSkirt();

/**
 * ONE WORLD UNIT IS ONE CENTIMETRE, on purpose. The strip is built at the
 * skirt's own drop, so a displacement the solver reports in world units is a
 * displacement in cm and the drawing can use it directly — no gain, no fudge
 * factor, nothing to tune away from the truth. It also fixes the first version,
 * which was wider than it was tall: a panel like that is stiff, and it barely
 * moved. A skirt is a long pendulum, and length is most of why cloth swings.
 */
const swaySpacing = Math.max(1, (skirtTopCm - skirtHemCm) / (SWAY_ROWS - 1));

const swayCloth = createGridCloth({
  cols: SWAY_COLS, rows: SWAY_ROWS, spacing: swaySpacing,
  orientation: 'hanging', pinTopRow: true, seedWave: 0.05,
});
const swaySolver = createSolver({ cloth: swayCloth, fabric: material, breeze: 0 });
/** Where every particle sits at rest, so displacement can be read as an offset. */
const swayRestX = Float32Array.from(swayCloth.particles.px);
const swayRestY = Float32Array.from(swayCloth.particles.py);

/**
 * The displacement field, in cm: how far every point of the strip has moved
 * from where it hangs at rest, ACROSS and DOWN.
 *
 * The first version read one number per row and shifted the whole drawing
 * sideways by it. That is a shear, not cloth — the folds slid across the skirt
 * like a picture being dragged, and the hem stayed a ruled line. Keeping both
 * axes per particle means the hem can fall, sag unevenly and settle, which is
 * the part that actually looks like fabric.
 */
const swayDx = new Float32Array(SWAY_COLS * SWAY_ROWS);
const swayDy = new Float32Array(SWAY_COLS * SWAY_ROWS);

function readSway() {
  const { px, py } = swayCloth.particles;
  for (let i = 0; i < swayDx.length; i++) {
    swayDx[i] = px[i] - swayRestX[i];
    swayDy[i] = py[i] - swayRestY[i];
  }
}

/**
 * The cloth's displacement under a point of the pattern, in cm, bilinearly
 * sampled. Zero at the waist and above it: the bodice is belted, and belted
 * cloth does not move — the same pinning that makes the real garment tractable.
 */
const offset: [number, number] = [0, 0];
function clothOffset(xCm: number, yCm: number): [number, number] {
  offset[0] = 0; offset[1] = 0;
  if (yCm >= skirtTopCm || skirtTopCm === skirtHemCm) return offset;

  const t = (skirtTopCm - yCm) / (skirtTopCm - skirtHemCm);
  const fr = Math.max(0, Math.min(SWAY_ROWS - 1.001, t * (SWAY_ROWS - 1)));
  const r = Math.floor(fr);
  const kr = fr - r;

  const u = skirtWidthCm > 0 ? (xCm - skirtMinXCm) / skirtWidthCm : 0.5;
  const fc = Math.max(0, Math.min(SWAY_COLS - 1.001, u * (SWAY_COLS - 1)));
  const c = Math.floor(fc);
  const kc = fc - c;

  const i00 = r * SWAY_COLS + c, i01 = i00 + 1;
  const i10 = i00 + SWAY_COLS, i11 = i10 + 1;
  const w00 = (1 - kr) * (1 - kc), w01 = (1 - kr) * kc;
  const w10 = kr * (1 - kc), w11 = kr * kc;

  offset[0] = swayDx[i00] * w00 + swayDx[i01] * w01 + swayDx[i10] * w10 + swayDx[i11] * w11;
  offset[1] = swayDy[i00] * w00 + swayDy[i01] * w01 + swayDy[i10] * w10 + swayDy[i11] * w11;
  return offset;
}

/**
 * The physics kiss. A colour lands and a ripple crosses the cloth and dies out
 * — Phase 5's idea, arriving early because the solver was already here. It is
 * an impulse, not an animation: the row under the waistband is displaced and
 * the solver decides everything after that, which is why heavy cloth will
 * swallow it and silk will carry it to the hem.
 */
/** A colour lands: the same release, a fraction of the angle. */
function kiss(strength = 1) {
  if (calm.matches) return;
  swingFrom(0.07 * strength);
}

/**
 * NO WIND. The room is still.
 *
 * An idle breeze meant the skirt never stopped moving, and cloth that never
 * stops asks to be watched. What it does instead is settle: it moves when
 * something happens to it and then it is quiet, the way a chupa dropped over a
 * hanger swings twice at the hem and hangs. The solver stops being stepped at
 * all once the energy falls away, so a still page costs nothing.
 */
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * The drop. Not a push and not a lift — a SWING, released.
 *
 * The first version raised the lower rows straight up and let go. That looked
 * like nothing at all, and the reason is worth keeping: raising a row stretches
 * the links above it, and PBD's whole job is to fix stretched links, so the
 * projection pass undid the entire drop inside one frame. It was never falling;
 * it was a constraint violation being corrected.
 *
 * Rotating the free rows about the pinned waist changes no distance between any
 * two particles, so the solver has nothing to correct — it is simply cloth held
 * out and let go. Gravity then swings it down, it overshoots, and it settles.
 * Every bit of that is the solver's, which is why the hem lands unevenly and
 * why a heavier fabric would land sooner.
 */
function swingFrom(angle: number) {
  const p = swayCloth.particles;
  const y0 = swayRestY[0];              // the pinned waist
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (let r = 1; r < SWAY_ROWS; r++) {
    for (let c = 0; c < SWAY_COLS; c++) {
      const i = r * SWAY_COLS + c;
      const dy = p.py[i] - y0;
      const dz = p.pz[i];
      // A hair of phase across the width, so it is a cloth and not a board.
      const a = 1 + Math.sin((c / SWAY_COLS) * Math.PI * 2) * 0.12;
      p.py[i] = y0 + dy * cos - dz * sin * a;
      p.pz[i] = dy * sin * a + dz * cos;
      // Released from rest: no velocity, only height.
      p.oy[i] = p.py[i];
      p.oz[i] = p.pz[i];
    }
  }
  wake();
}

function drop() {
  if (calm.matches) return;
  swingFrom(0.38);                       // ~22°, held out and dropped
}

let running = false;
/** Stop when the cloth is still: a sleeping page should not spin a rAF loop. */
function wake() {
  if (running) return;
  running = true;
  requestAnimationFrame(tick);
}

// A workshop page is allowed a window on its own machinery — and being able to
// replay the drop without reloading is how the amplitudes below got tuned.
(window as unknown as Record<string, unknown>).__cloth = {
  solver: swaySolver, swayDx, swayDy, drop: () => drop(), kiss: (s?: number) => kiss(s),
};

function tick() {
  stepFrame(swaySolver);
  readSway();
  draw();
  // Stop when it has come to rest. Threshold from the settle tests' own energy
  // proxy — below this the cloth is moving less than a pixel and the loop is
  // just burning a phone's battery to redraw the same picture.
  running = energy(swaySolver) > 2e-4;
  if (running) requestAnimationFrame(tick);
}


/**
 * Ready-made combinations.
 *
 * The "Layered" groups are the Heian court's system of layered colour (kasane
 * no irome), where a garment's beauty was in how one cloth showed against the
 * one beneath it. That is the same problem a chupa over a honju poses, and it
 * maps directly: the outermost robe is the chupa, the one beneath it is the
 * honju, which is exactly what shows at the collar and the cuffs.
 *
 * Pairs and seasons after sengokudaimyo.com/garb/kasane-no-irome. The source
 * is Japanese; the LABELS ARE NOT. Nothing on this page reads in a language the
 * garment does not belong to, so the names are translated and the notes give
 * the dye in English — safflower crimson, sappanwood, gromwell purple, red
 * plum, decayed leaf, new shoots, and the green the Heian sources call `ao`.
 *
 * The Tibetan group is the natural-dye range: madder, indigo, walnut, turmeric,
 * lac. Those are the colours the garment actually came in.
 *
 * cuff null means "the honju, a shade darker" — the usual case.
 */
interface Palette {
  readonly group: string;
  readonly name: string;
  readonly note: string;
  readonly chupa: string;
  readonly honju: string;
}

/**
 * The first three groups have something behind them; the rest are taste.
 *
 * REGIONAL is Buckley's fieldwork ("Local Colour", HALI c. 2014, textiles from
 * the Karun Thakar Collection), held as data with its tiers in the sibling
 * Khadog project — all seven areas he describes.
 *
 * APRONS is Khadog's image-derived plates 12–18, read from the Tibetan aprons
 * the V&A accessioned from that same collection in 2016. Each note is that
 * plate's own description of the object.
 *
 * NATURAL DYE is the dyestuff range Buckley records: madder with bangtsen
 * lichen, Bhutanese lac (gyasar), indigo from the fermentation vat, barberry
 * and a rhubarb-like root over-dyed on indigo for green, walnut husk for the
 * darks. There is no green dyestuff, which is why the greens here are all
 * over-dyes and none of them is clean.
 *
 * BUT: a description is not a measurement, and this is where the honesty has to
 * live. Buckley says "dark blue-green enlivened with narrow stripes of red"; he
 * does not say which dark blue-green, and nobody has put a spectrophotometer on
 * the cloth. Khadog's own plates snap to pigment entries, so their values are
 * pigment masstones and would come out muddier than dyed wool — using them raw
 * would be laundering one kind of measurement into a claim about another. Every
 * hex below is therefore an INTERPRETATION of a written description, and the
 * group labels say so. Nor is the mapping literal: an apron is a pangden, so
 * its dominant colour is offered as the chupa and a band colour as the honju.
 */
const PALETTES: Palette[] = [
  { group: 'Regional · after a description', name: 'Tingri', note: 'dark blue-green, red stripes',
    chupa: '#1f4a45', honju: '#c2544e' },
  { group: 'Regional · after a description', name: 'Sakya', note: 'the striped house walls',
    chupa: '#6e2a2a', honju: '#efe9dc' },
  { group: 'Regional · after a description', name: 'Panam', note: 'wide green and blue',
    chupa: '#2f6b4a', honju: '#8fb8d6' },
  { group: 'Regional · after a description', name: 'Nyalam', note: 'white stripes, indigo ground',
    chupa: '#2b3f63', honju: '#efe9dc' },
  { group: 'Regional · after a description', name: 'Dolpo', note: 'red and orange-yellow · stamped crosses',
    chupa: '#a8322b', honju: '#e0a33c' },
  { group: 'Regional · after a description', name: 'Near Kailash', note: 'red, green, orange · even bands',
    chupa: '#9d2f2c', honju: '#4f8a5c' },
  { group: 'Regional · after a description', name: 'Lhasa, mid-1990s', note: 'bought not woven · pastel silk',
    chupa: '#a08a78', honju: '#a9c0d4' },

  { group: 'Aprons · after a plate', name: 'Four panels', note: 'indigo ground, crimson bands',
    chupa: '#26374f', honju: '#b7333f' },
  { group: 'Aprons · after a plate', name: 'Three panels', note: 'pinks against browns and blues',
    chupa: '#7a4a3c', honju: '#e0899c' },
  { group: 'Aprons · after a plate', name: 'Fine stripes', note: 'dark ground, thin bright bands',
    chupa: '#1d2a3a', honju: '#d2566e' },
  { group: 'Aprons · after a plate', name: 'Misaligned', note: 'salmon banded with green and navy',
    chupa: '#e08a76', honju: '#2f5d4a' },
  { group: 'Aprons · after a plate', name: 'Dense banding', note: 'hot pink against teal and ochre',
    chupa: '#1f6f70', honju: '#ef7f9d' },
  { group: 'Aprons · after a plate', name: 'Synthetic dyes', note: 'the modern apron · electric',
    chupa: '#1f4fbf', honju: '#c9268f' },
  { group: 'Aprons · after a plate', name: 'Warm earths', note: 'mustard and crimson on cream',
    chupa: '#7d2f34', honju: '#d9b45c' },

  { group: 'Natural dye', name: 'Madder & bone', note: 'the everyday chupa',
    chupa: '#9e2124', honju: '#e8dfc9' },
  { group: 'Natural dye', name: 'Indigo & saffron', note: 'vat blue, turmeric',
    chupa: '#27406f', honju: '#e3b85c' },
  { group: 'Natural dye', name: 'Lac & cream', note: 'insect red, undyed wool',
    chupa: '#7e1f2b', honju: '#efe6d2' },
  { group: 'Natural dye', name: 'Lac & indigo', note: 'gyasar pink on vat blue',
    chupa: '#2b3f63', honju: '#e08fae' },
  { group: 'Natural dye', name: 'Madder & lichen', note: 'bangtsen turns it purplish',
    chupa: '#8c3a4e', honju: '#e5d3b8' },
  { group: 'Natural dye', name: 'Walnut & sky', note: 'husk brown, never quite black',
    chupa: '#2b2622', honju: '#9db4c4' },
  { group: 'Natural dye', name: 'Barberry green', note: 'indigo over yellow · muted, uneven',
    chupa: '#5c6b3a', honju: '#e8dcbe' },
  { group: 'Natural dye', name: 'Rhubarb root', note: 'deep orange-yellow, over-dyed',
    chupa: '#8a5a1f', honju: '#d8c79a' },
  { group: 'Natural dye', name: 'Walnut & turquoise', note: 'husk brown, gyu',
    chupa: '#5a3b2e', honju: '#7fc0be' },
  { group: 'Natural dye', name: 'Pine & old gold', note: 'deep green, brass',
    chupa: '#2e5c39', honju: '#d9b366' },

  { group: 'Layered · year round', name: 'Crimson on white', note: 'safflower crimson over white',
    chupa: '#c3384b', honju: '#f3efe6' },
  { group: 'Layered · year round', name: 'Crimson graded', note: 'deep crimson over red plum',
    chupa: '#a82238', honju: '#db7c90' },
  { group: 'Layered · year round', name: 'Pine', note: 'sappanwood over crimson',
    chupa: '#7b3b4a', honju: '#c3384b' },
  { group: 'Layered · year round', name: 'New shoots', note: 'young green over crimson',
    chupa: '#9bbe5a', honju: '#c3384b' },
  { group: 'Layered · year round', name: 'Red plum', note: 'pale plum over green',
    chupa: '#efa9b8', honju: '#3e7a62' },

  { group: 'Layered · spring', name: 'Plum blossom', note: 'pale plum over deep purple',
    chupa: '#efa9b8', honju: '#4a2e75' },
  { group: 'Layered · spring', name: 'Purple on white', note: 'gromwell purple over white',
    chupa: '#5b3e90', honju: '#f3efe6' },
  { group: 'Layered · spring', name: 'Mountain rose', note: 'decayed-leaf gold over green',
    chupa: '#b7702e', honju: '#3e7a62' },
  { group: 'Layered · spring', name: 'Under snow', note: 'white over green',
    chupa: '#f3efe6', honju: '#3e7a62' },
  { group: 'Layered · spring', name: 'Two colours', note: 'pale purple over crimson',
    chupa: '#c3a6d8', honju: '#c3384b' },

  { group: 'Layered · summer', name: 'Wisteria', note: 'pale purple over white',
    chupa: '#a88cc8', honju: '#f3efe6' },
  { group: 'Layered · summer', name: 'Iris', note: 'green over white',
    chupa: '#3e7a62', honju: '#f3efe6' },
  { group: 'Layered · summer', name: 'Wild pink', note: 'sappanwood over white',
    chupa: '#7b3b4a', honju: '#f3efe6' },
  { group: 'Layered · summer', name: 'Water iris', note: 'pale purple over crimson',
    chupa: '#a88cc8', honju: '#c3384b' },

  { group: 'Layered · autumn', name: 'Sumac leaves', note: 'yellow over crimson',
    chupa: '#e3b23c', honju: '#c3384b' },
  { group: 'Layered · autumn', name: 'Green maple', note: 'green over sappanwood',
    chupa: '#3e7a62', honju: '#7b3b4a' },
  { group: 'Layered · autumn', name: 'Maple turning', note: 'pale green over sappanwood',
    chupa: '#6fa084', honju: '#7b3b4a' },
  { group: 'Layered · autumn', name: 'Yellow chrysanthemum', note: 'sappanwood over green',
    chupa: '#8e3a48', honju: '#3e7a62' },

  { group: 'Indian', name: 'Haldi & kumkum', note: 'turmeric on vermilion',
    chupa: '#c1102e', honju: '#f3c531' },
  { group: 'Indian', name: 'Rani & tota', note: 'queen pink, parrot green',
    chupa: '#c2185b', honju: '#7cb342' },
  { group: 'Indian', name: 'Firozi & gulabi', note: 'turquoise, rose',
    chupa: '#128f8b', honju: '#efa6b4' },
  { group: 'Indian', name: 'Genda & neel', note: 'marigold on indigo',
    chupa: '#26418f', honju: '#f2a03d' },
  { group: 'Indian', name: 'Baingani & zari', note: 'aubergine, gold thread',
    chupa: '#5b2c6f', honju: '#d4af37' },
  { group: 'Indian', name: 'Mehendi & maroon', note: 'henna on deep red',
    chupa: '#6e1423', honju: '#8da750' },

  { group: 'Quiet', name: 'Ink & smoke', note: 'almost black, warm grey',
    chupa: '#22242a', honju: '#c9c6be' },
  { group: 'Quiet', name: 'Clay & sand', note: 'earth on earth',
    chupa: '#9c5b3f', honju: '#e8d7b8' },
  { group: 'Quiet', name: 'Slate & sky', note: 'cold, high altitude',
    chupa: '#3a4a5c', honju: '#afc6d8' },
];

let chupaColour = '#9e2124';
let honjuColour = '#e8dfc9';
// The collar and the sleeves toggle separately — the collar sits on the chupa's
// fold edge and the sleeves hang off the arms, so they are judged against
// different things and are rarely worth looking at at the same time.
let showCollar = true;
let showSleeves = true;
let showFigure = false;
let showGrid = false;
let showEdges = false;

// ---------------------------------------------------------------------------
// Figure silhouette, for checking the garment actually fits her
// ---------------------------------------------------------------------------

const figureOutline: [number, number][] = (() => {
  const pts: [number, number][] = [];
  const lo = form.bounds.min[1];
  const hi = form.bounds.max[1];
  const maxX = form.bounds.max[0] + 2;
  for (let s = 0; s <= 200; s++) {
    const y = lo + ((hi - lo) * s) / 200;
    if (form.sdf(0, y, 0) > 0) continue;
    let inside = 0;
    let out = maxX;
    for (let it = 0; it < 22; it++) {
      const mid = (inside + out) / 2;
      if (form.sdf(mid, y, 0) <= 0) inside = mid; else out = mid;
    }
    pts.push([inside / form.scale, y / form.scale]);
  }
  return pts;
})();

/**
 * The arms, drawn as their own limbs.
 *
 * In the SDF they are smooth-unioned into the torso, which is right for
 * collision and useless to look at: the figure comes out one slab from shoulder
 * to hip with no arms in it at all. The honju's sleeves hang on these, so they
 * have to be legible.
 */
function armPath(limb: { a: readonly number[]; b: readonly number[]; r1: number; r2: number }) {
  const s = form.scale;
  const ax = limb.a[0] / s, ay = limb.a[1] / s, r1 = limb.r1 / s;
  const bx = limb.b[0] / s, by = limb.b[1] / s, r2 = limb.r2 / s;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular to the limb's axis, so the outline is the capsule's silhouette.
  const nx = -dy / len, ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(sx(ax + nx * r1), sy(ay + ny * r1));
  ctx.lineTo(sx(bx + nx * r2), sy(by + ny * r2));
  ctx.arc(sx(bx), sy(by), r2 * pxPerCm, -Math.atan2(ny, nx), -Math.atan2(-ny, -nx));
  ctx.lineTo(sx(ax - nx * r1), sy(ay - ny * r1));
  ctx.arc(sx(ax), sy(ay), r1 * pxPerCm, -Math.atan2(-ny, -nx), -Math.atan2(ny, nx));
  ctx.closePath();
}

/**
 * A head, drawn rather than simulated. The form is a dress form — no head, which
 * is right for the solver and wrong for judging a garment: without one there is
 * no sense of scale and the neckline has nothing to be close to.
 *
 * Sized from the measurements, not by eye: chin to crown, at the measured head
 * breadth. That is stature/7.7 tall, the realistic adult figure.
 */


// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

const cv = document.getElementById('c') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
let W = 0, H = 0, DPR = 1, pxPerCm = 1, originX = 0, floorY = 0;

const sx = (cm: number) => originX + cm * pxPerCm;
const sy = (cm: number) => floorY - cm * pxPerCm;

function resize() {
  const stage = document.getElementById('stage') as HTMLElement;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = stage.clientWidth; H = stage.clientHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  pxPerCm = (H * 0.92) / HEIGHT_CM;
  originX = W / 2;
  floorY = H - (H - HEIGHT_CM * pxPerCm) / 2;
  draw();
}
window.addEventListener('resize', resize);

/** Screen position of a point on the garment, moved by the cloth under it. */
const gx = (xCm: number, yCm: number) => sx(xCm) + clothOffset(xCm, yCm)[0] * pxPerCm;
const gy = (xCm: number, yCm: number) => sy(yCm) - clothOffset(xCm, yCm)[1] * pxPerCm;

function tracePath(pts: readonly (readonly [number, number])[]) {
  ctx.beginPath();
  ctx.moveTo(gx(pts[0][0], pts[0][1]), gy(pts[0][0], pts[0][1]));
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(gx(pts[i][0], pts[i][1]), gy(pts[i][0], pts[i][1]));
  }
}

// ---------------------------------------------------------------------------
// Colour
//
// The honju is not chosen independently of the chupa — it is the cloth that
// shows AGAINST it, at the collar and the sleeves. So the useful move is to let
// the chupa be picked freely and then offer the honjus that actually work with
// it, by harmony rather than by taste.
//
// Every suggestion also comes out lighter and less saturated than the chupa.
// That is not decoration: on every reference garment the honju is the paler of
// the two, because it reads as the lining showing through.
// ---------------------------------------------------------------------------

/**
 * The card names the nearest colour in `NAMED_COLOURS`, which is what makes a
 * colour a THING rather than a hex code — "Madder" means something to a wearer,
 * #B7282E does not. The card shows the name and the code, nothing else.
 */
const HUE_NAMES: [number, string][] = [
  [8, 'red'], [20, 'vermilion'], [34, 'orange'], [46, 'amber'], [62, 'yellow'],
  [88, 'lime'], [140, 'green'], [168, 'jade'], [188, 'teal'], [206, 'sky'],
  [232, 'blue'], [256, 'indigo'], [282, 'violet'], [308, 'magenta'],
  [332, 'rose'], [352, 'crimson'], [361, 'red'],
];

/** A plain-language name, so the cards read to someone who is not a designer. */
function describe(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  if (s < 0.09) return l > 0.8 ? 'bone' : l > 0.5 ? 'grey' : l > 0.22 ? 'slate' : 'ink';
  const hue = HUE_NAMES.find(([to]) => h < to)![1];
  const tone = l < 0.24 ? 'deep ' : l < 0.44 ? '' : l < 0.66 ? 'soft ' : 'pale ';
  return `${tone}${hue}`;
}

/** Mix a hex colour toward white or black. `t` > 0 lightens. */
function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = t > 0 ? 255 : 0;
  const a = Math.abs(t);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - a) + to * a);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/**
 * A little cross-body shading so the elevation reads as a garment on a body
 * rather than a paper doll: lit from the left, falling off toward each edge.
 */
function clothFill(region: FlatRegion, base: string): CanvasGradient {
  const cloth = region.garment === 'chupa' ? material : honjuMaterial;
  let minX = Infinity, maxX = -Infinity;
  for (const [x] of region.outline) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const g = ctx.createLinearGradient(sx(minX), 0, sx(maxX), 0);
  // The highlight band is the material's sheen: charmeuse throws a hard bright
  // stripe, melton almost nothing.
  const lit = 0.06 + cloth.sheen * 0.30;
  g.addColorStop(0, shade(base, -0.28));
  g.addColorStop(0.34, shade(base, lit));
  g.addColorStop(0.48, shade(base, lit * 0.45));
  g.addColorStop(0.62, shade(base, -0.04));
  g.addColorStop(1, shade(base, -0.34));
  return g;
}


/**
 * A real backdrop, not a full-bleed gradient: a roll of seamless paper hung on a
 * stand, edges visible, sweeping off the wall onto the floor. The dark room
 * shows around it, which is what makes it read as a studio rather than as a
 * background colour.
 *
 * Warm grey rather than the photographer's green — green is for keying, and here
 * the backdrop has to flatter cloth instead of being removed from behind it.
 *
 * Daylit, not a darkroom: the room was near-black under a dark interface, which
 * made the whole page read as a tool. A bright room shows cloth the way a shop
 * mirror does, and the paper stays a shade deeper than the page so the garment
 * still sits on something rather than floating on the background.
 */
const PAPER = '#e2d6c4';

function drawStudio() {
  // The room.
  ctx.fillStyle = '#efe7db';
  ctx.fillRect(0, 0, W, H);

  const hangY = H * 0.02;
  const sweepY = H * 0.66;   // where the paper leaves the wall
  const floorY = H * 0.965;  // the front edge of the paper on the floor
  const half = Math.min(W * 0.30, 330);
  const flare = 1.34;        // the floor spreads towards the viewer

  // Cloth does not hang perfectly straight — a few centimetres of sag on each
  // edge is the difference between a backdrop and a rectangle.
  const edge = (t: number) => Math.sin(t * 5.2 + 1.1) * 4 + Math.sin(t * 11.3) * 1.8;

  ctx.beginPath();
  ctx.moveTo(W / 2 - half, hangY);
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const y = hangY + (floorY - hangY) * t;
    const spread = y < sweepY ? 1 : 1 + (flare - 1) * ((y - sweepY) / (floorY - sweepY)) ** 1.6;
    ctx.lineTo(W / 2 - half * spread + edge(t), y);
  }
  for (let i = 40; i >= 0; i--) {
    const t = i / 40;
    const y = hangY + (floorY - hangY) * t;
    const spread = y < sweepY ? 1 : 1 + (flare - 1) * ((y - sweepY) / (floorY - sweepY)) ** 1.6;
    ctx.lineTo(W / 2 + half * spread - edge(t + 0.37), y);
  }
  ctx.closePath();
  ctx.save();
  ctx.clip();

  // Key light pooled behind where she stands, falling away to the corners.
  const pool = ctx.createRadialGradient(
    W / 2, sweepY * 0.62, 20, W / 2, sweepY * 0.62, Math.max(W, H) * 0.58,
  );
  pool.addColorStop(0, shade(PAPER, 0.20));
  pool.addColorStop(0.5, shade(PAPER, -0.05));
  pool.addColorStop(1, shade(PAPER, -0.26));
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, W, H);

  // The sweep itself: paper curves rather than creasing, so the wall-to-floor
  // join is a soft band of shadow and never a line.
  const curve = ctx.createLinearGradient(0, sweepY - H * 0.13, 0, sweepY + H * 0.10);
  // Gentler than it was in the dark room: on pale paper the same alpha reads as
  // a dirty smudge rather than as a fold of light.
  curve.addColorStop(0, 'rgba(90,70,45,0)');
  curve.addColorStop(0.55, 'rgba(90,70,45,0.16)');
  curve.addColorStop(1, 'rgba(90,70,45,0.03)');
  ctx.fillStyle = curve;
  ctx.fillRect(0, sweepY - H * 0.13, W, H * 0.23);

  // Contact shadow under the hem.
  const hemPx = sy(GARMENT_SPEC.chupa.hemFromFloor);
  const rx = 42 * pxPerCm;
  const sh = ctx.createRadialGradient(originX + 8, hemPx, 2, originX + 8, hemPx, rx);
  sh.addColorStop(0, 'rgba(80,62,40,0.34)');
  sh.addColorStop(0.5, 'rgba(80,62,40,0.13)');
  sh.addColorStop(1, 'rgba(80,62,40,0)');
  ctx.save();
  ctx.translate(originX + 8, hemPx);
  ctx.scale(1, 0.16);
  ctx.translate(-(originX + 8), -hemPx);
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(originX + 8, hemPx, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Making a flat shape read as cloth
//
// Not 3D. The garment stays exactly the flat construction `buildFlatChupa`
// produces — what changes is how it is LIT. Three passes do nearly all of it:
//
//   A CAST SHADOW, so she is standing on the paper rather than stuck to it.
//   FOLD SHADING, a fan of soft ridges converging at the waist, which is how a
//     gathered skirt actually hangs — the single thing a flat fill cannot fake.
//   A WEAVE, so the surface is cloth rather than paint.
//
// All of it is driven by the fabric's own numbers, so this is not decoration
// that lies: a fluid silk gets many fine folds, a stiff heavy nambu gets few
// broad ones, and `crease` decides whether they are crisp or soft. When the
// solver takes over in Phase 3 this pass comes out; until then it is the
// honest look of the cloth it claims to be.
// ---------------------------------------------------------------------------

function visibleRegions(): FlatRegion[] {
  return flat.regions.filter((region) => {
    const isSleeve = region.name.startsWith('sleeve') || region.name.startsWith('cuff');
    if (isSleeve && !showSleeves) return false;
    if (region.name.startsWith('collar') && !showCollar) return false;
    return true;
  });
}

/** Every visible panel as ONE path, for shadowing and for clipping. */
function silhouettePath() {
  ctx.beginPath();
  for (const region of visibleRegions()) {
    const pts = region.outline;
    ctx.moveTo(gx(pts[0][0], pts[0][1]), gy(pts[0][0], pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(gx(pts[i][0], pts[i][1]), gy(pts[i][0], pts[i][1]));
    }
    ctx.closePath();
  }
}

const CAN_BLUR = typeof ctx.filter === 'string';

function castShadow() {
  ctx.save();
  // Thrown down and to the right, because the key light is up and to the left.
  ctx.translate(9, 11);
  if (CAN_BLUR) ctx.filter = 'blur(13px)';
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = 'rgb(74,56,36)';
  silhouettePath();
  ctx.fill();
  ctx.restore();
}

/**
 * A tile of woven noise, built once. Warp and weft are drawn as two crossing
 * sets of lines rather than as random pixels — random noise reads as film
 * grain, and cloth is a grid.
 */
const weave = (() => {
  const t = document.createElement('canvas');
  t.width = 64; t.height = 64;
  const g = t.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) {
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(i, 0, 1, 64);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0, i, 64, 1);
  }
  // A little irregularity, so it is a hand loom and not a screen door.
  for (let i = 0; i < 900; i++) {
    const x = (i * 37) % 64, y = (i * 61) % 64;
    g.fillStyle = i % 3 === 0 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    g.fillRect(x, y, 1, 1);
  }
  return t;
})();

/**
 * Deterministic per-fold variation. Not `Math.random`: the pattern has to be
 * identical on every redraw, or the folds crawl about whenever a colour changes.
 */
function jitter(i: number, k: number): number {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The shading layer, painted off-screen then dropped over the garment. */
const foldLayer = document.createElement('canvas');
const fctx = foldLayer.getContext('2d')!;

function drawCloth() {
  const cloth = material;
  if (foldLayer.width !== cv.width || foldLayer.height !== cv.height) {
    foldLayer.width = cv.width;
    foldLayer.height = cv.height;
  }
  fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fctx.clearRect(0, 0, W, H);
  // Mid grey is the do-nothing value under `overlay`, so anything left untouched
  // leaves the colour underneath exactly as it was.
  fctx.fillStyle = '#808080';
  fctx.fillRect(0, 0, W, H);

  // Weave first, under the folds.
  const pat = fctx.createPattern(weave, 'repeat')!;
  fctx.save();
  fctx.globalAlpha = 0.15 + cloth.thickness * 0.06;
  fctx.fillStyle = pat;
  fctx.fillRect(0, 0, W, H);
  fctx.restore();

  // Folds, per panel. A fluid cloth breaks into many fine ones; a heavy stiff
  // one into a few broad ones.
  for (const region of visibleRegions()) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of region.outline) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const wCm = maxX - minX;
    const hCm = maxY - minY;
    if (wCm < 6 || hCm < 6) continue;   // collars and cuffs are too small to fold

    const c = region.garment === 'chupa' ? material : honjuMaterial;
    const gathered = region.name === 'skirt';
    const n = Math.max(3, Math.round((gathered ? 7 : 3) + c.fluidity * 7 - c.gsm / 90));
    // Quiet, then quieter. Cloth in a still room is mostly one colour with a
    // few soft ridges in it. This started at 0.22 and was ribbed like corduroy;
    // 0.11 still read as a pleated skirt rather than a hanging one. The shading
    // is meant to be something you notice second, if at all.
    const depth = (gathered ? 0.055 : 0.03) * (0.55 + c.crease * 0.9);

    const left = sx(minX), right = sx(maxX);
    const top = sy(maxY);
    // Softness is a FRACTION OF THE FOLD PITCH, never a fixed number of pixels.
    // At a fixed 8px the blur was wider than the gap between folds on a skirt
    // 120px across, so the whole pass averaged out to nothing and the cloth
    // looked flat again — the bug that makes soft shading quietly do nothing.
    const pitch = (right - left) / n;
    const blurPx = Math.max(0.6, pitch * (0.08 + (1 - c.crease) * 0.20));
    // Gathers converge at the waist and open toward the hem; a sleeve's folds
    // run more or less straight.
    const pinch = gathered ? 0.34 : 0.86;

    fctx.save();
    if (CAN_BLUR) fctx.filter = `blur(${blurPx}px)`;
    for (let i = 0; i < n; i++) {
      // Evenly spaced folds of equal depth read as corduroy, not as cloth. Each
      // one gets its own width, depth, offset and starting height — from a hash
      // of its index, so it is the same every frame and does not shimmer.
      const j1 = jitter(i, 1), j2 = jitter(i, 2), j3 = jitter(i, 3), j4 = jitter(i, 4);
      const t = (i + 0.5) / n;
      // Each fold is placed in CENTIMETRES and then moved by the cloth under
      // its own two ends — so when the hem falls, the folds fall with it and
      // stretch, instead of the whole fan sliding across as one picture.
      const xHemCm = minX + t * wCm + (j1 - 0.5) * (wCm / n) * 0.5;
      const xTopCm = (minX + maxX) / 2 + (xHemCm - (minX + maxX) / 2) * pinch;
      const xHem = gx(xHemCm, minY);
      const xTop = gx(xTopCm, maxY);
      const halfHem = pitch * (0.38 + j2 * 0.42);
      const halfTop = halfHem * pinch;
      const hemY = gy(xHemCm, minY);
      // Some folds do not run the whole drop — they open out partway down.
      const foldTop = top + (hemY - top) * j3 * 0.34;
      const g = fctx.createLinearGradient(xHem - halfHem, 0, xHem + halfHem, 0);
      // Ridge lit on its left flank, shadow falling away to the right — the
      // same direction as the key light on the backdrop.
      const d = depth * (0.55 + j4 * 0.9);
      const lift = Math.round(255 * Math.min(1, 0.5 + d * (1 + c.sheen)));
      const dark = Math.round(255 * Math.max(0, 0.5 - d));
      g.addColorStop(0, 'rgba(128,128,128,0)');
      g.addColorStop(0.34, `rgb(${lift},${lift},${lift})`);
      g.addColorStop(0.62, `rgb(${dark},${dark},${dark})`);
      g.addColorStop(1, 'rgba(128,128,128,0)');
      fctx.fillStyle = g;
      fctx.beginPath();
      fctx.moveTo(xTop - halfTop, foldTop);
      fctx.lineTo(xTop + halfTop, foldTop);
      fctx.lineTo(xHem + halfHem, hemY);
      fctx.lineTo(xHem - halfHem, hemY);
      fctx.closePath();
      fctx.fill();
    }
    fctx.restore();
  }

  // Fade the whole layer in from the waist down: cloth is pulled flat where it
  // is belted and free where it hangs.
  fctx.save();
  fctx.globalCompositeOperation = 'destination-in';
  const mask = fctx.createLinearGradient(0, sy(GARMENT_SPEC.chupa.hemFromFloor + 4), 0, 0);
  mask.addColorStop(0, 'rgba(0,0,0,0.25)');
  mask.addColorStop(0.06, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,1)');
  fctx.fillStyle = mask;
  fctx.fillRect(0, 0, W, H);
  fctx.restore();

  // Over the garment only.
  ctx.save();
  silhouettePath();
  ctx.clip();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.7;
  ctx.drawImage(foldLayer, 0, 0, W, H);
  ctx.restore();
}

/** A breath of falloff at the corners, so the eye goes to her and not the wall. */
function drawVignette() {
  const v = ctx.createRadialGradient(
    W / 2, H * 0.42, Math.min(W, H) * 0.30, W / 2, H * 0.42, Math.max(W, H) * 0.72,
  );
  v.addColorStop(0, 'rgba(60,44,26,0)');
  v.addColorStop(1, 'rgba(60,44,26,0.16)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawStudio();

  if (showGrid) {
    ctx.lineWidth = 1;
    for (let cm = 0; cm <= HEIGHT_CM; cm += 10) {
      ctx.strokeStyle = 'rgba(60,48,34,0.09)';
      ctx.beginPath(); ctx.moveTo(0, sy(cm)); ctx.lineTo(W, sy(cm)); ctx.stroke();
      if (cm % 20 === 0) {
        ctx.fillStyle = 'rgba(60,48,34,0.45)';
        ctx.font = '11px "Nunito Sans", sans-serif';
        ctx.fillText(`${cm}`, 8, sy(cm) - 3);
      }
    }
    for (let cm = -60; cm <= 60; cm += 10) {
      ctx.strokeStyle = cm === 0 ? 'rgba(60,48,34,0.18)' : 'rgba(60,48,34,0.07)';
      ctx.beginPath(); ctx.moveTo(sx(cm), 0); ctx.lineTo(sx(cm), H); ctx.stroke();
    }
  }

  if (showFigure) {
    // Head and body as ONE path, filled once. Two translucent fills that overlap
    // at the neck double up and draw a seam across her throat.
    ctx.beginPath();
    for (let i = 0; i < figureOutline.length; i++) {
      const [x, y] = figureOutline[i];
      if (i === 0) ctx.moveTo(sx(x), sy(y)); else ctx.lineTo(sx(x), sy(y));
    }
    for (let i = figureOutline.length - 1; i >= 0; i--) {
      ctx.lineTo(sx(-figureOutline[i][0]), sy(figureOutline[i][1]));
    }
    ctx.closePath();
    const chin = form.measurements.floorToChin;
    ctx.ellipse(
      sx(0), sy((chin + HEIGHT_CM) / 2),
      (form.measurements.headWidth / 2) * pxPerCm,
      ((HEIGHT_CM - chin) / 2) * pxPerCm,
      0, 0, Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(60,48,34,0.13)';
    ctx.fill();
    // Arms over the top, a shade lighter and outlined, so they read as limbs
    // rather than disappearing into the torso they are blended into.
    for (const limb of form.limbs) {
      if (limb.name !== 'armLeft' && limb.name !== 'armRight') continue;
      armPath(limb);
      ctx.fillStyle = 'rgba(60,48,34,0.09)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,48,34,0.20)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // She throws a shadow onto the paper before she is drawn on it. Without this
  // the garment is a sticker on a photograph — the single biggest reason the
  // stage read as flat.
  castShadow();

  for (const region of visibleRegions()) {
    const base = region.garment === 'honju' ? honjuColour : chupaColour;
    tracePath(region.outline);
    ctx.closePath();
    ctx.fillStyle = clothFill(region, base);
    ctx.fill();
    // A darker line on every silhouette edge: it separates pieces of the same
    // cloth, which flat fills alone cannot do. Its weight is the cloth's own —
    // a cut edge in melton reads heavier than one in georgette. Kept lighter
    // than it was: at -0.55 every panel was outlined like a colouring book.
    const cloth2 = region.garment === 'chupa' ? material : honjuMaterial;
    ctx.strokeStyle = shade(base, -0.40);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.9 + cloth2.thickness * 0.85;
    ctx.stroke();
    if (showEdges) {
      ctx.strokeStyle = '#4fb0c6';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Cloth pass goes over the flat fills but UNDER the seams — a seam is a real
  // edge and should stay crisp, not get soft-focused with everything else.
  drawCloth();

  for (const seam of flat.seams) {
    tracePath(seam.path);
    if (seam.stitch) {
      // Topstitching: a fine dashed line, lighter than the cloth so it catches
      // the way real thread does against a dark brocade.
      ctx.setLineDash([3, 2.5]);
      ctx.strokeStyle = shade(chupaColour, 0.34);
      ctx.lineWidth = 1;
    } else {
      ctx.setLineDash([]);
      ctx.strokeStyle = shade(chupaColour, -0.55);
      ctx.lineWidth = 1.4;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawVignette();
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------


const toggle = (id: string, get: () => boolean, set: (v: boolean) => void) => {
  const b = document.getElementById(id) as HTMLButtonElement;
  b.classList.toggle('on', get());
  b.onclick = () => { set(!get()); b.classList.toggle('on', get()); draw(); };
};
// --- Cloth ----------------------------------------------------------------
// FIXED, not offered. Silk brocade over silk charmeuse is the pairing that
// looks right, and until the material list actually changes the drape — folds,
// not just sheen and edge weight — offering thirteen of them is a menu of
// choices that barely differ. The data stays; the picker does not.

// --- Ready-made combinations, in a dropdown -------------------------------
//
// These were a column of swatch tiles down the right of the room. Fifty-one
// pairs is a lot of the widest space on the page for something you touch once,
// at the start — so they are a <select> now and the room has the column back.
//
// The grid's one real advantage was that a pairing was a thing you SAW. Two
// things carry that over: the chip beside the control always shows the two
// cloths, and the arrows either side step through the list without opening it.
// Holding an arrow down and watching the garment change is a better way through
// fifty-one combinations than reading fifty-one names anyway.
const comboEl = document.getElementById('combo') as HTMLSelectElement;
const comboDuo = document.getElementById('comboDuo') as HTMLElement;
const comboNote = document.getElementById('comboNote') as HTMLElement;

// Value "" is where a hand-mixed colour lands. It is a real option rather than
// a blank, so the control always says what state it is in.
const CUSTOM_LABEL = 'Your own mix';
{
  const own = document.createElement('option');
  own.value = '';
  own.textContent = CUSTOM_LABEL;
  comboEl.appendChild(own);

  let lastGroup = '';
  let optGroup: HTMLOptGroupElement | null = null;
  PALETTES.forEach((pal, i) => {
    if (pal.group !== lastGroup) {
      lastGroup = pal.group;
      optGroup = document.createElement('optgroup');
      optGroup.label = pal.group;
      comboEl.appendChild(optGroup);
    }
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = pal.name;
    optGroup!.appendChild(o);
  });
}

const comboBands = comboDuo.querySelectorAll('i');

/** The chip alone. Cheap enough to run on every sample of a wheel drag. */
function paintComboChip() {
  const i = comboEl.value === '' ? -1 : Number(comboEl.value);
  const [top, bottom] = i < 0
    ? [chupaColour, honjuColour]
    : [PALETTES[i].chupa, PALETTES[i].honju];
  (comboBands[0] as HTMLElement).style.background = top;
  (comboBands[1] as HTMLElement).style.background = bottom;
}

/** The chip and the note, for whatever the control is currently showing. */
function paintCombo() {
  paintComboChip();
  const i = comboEl.value === '' ? -1 : Number(comboEl.value);
  comboNote.innerHTML = i < 0
    ? '<span class="g">mixed by hand</span>the wheel, or a suggestion below'
    : `<span class="g">${PALETTES[i].group}</span>${PALETTES[i].note}`;
}

function applyCombo(i: number) {
  markPicked();
  chupaColour = PALETTES[i].chupa;
  honjuColour = PALETTES[i].honju;
  comboEl.value = String(i);
  paintCombo();
  refreshCards();
  draw();
  kiss();
}

/** Wraps, so the arrows never dead-end. From a hand mix, start at the top. */
function stepCombo(by: number) {
  const at = comboEl.value === '' ? (by > 0 ? -1 : 0) : Number(comboEl.value);
  applyCombo((at + by + PALETTES.length) % PALETTES.length);
}

comboEl.addEventListener('change', () => {
  if (comboEl.value === '') paintCombo(); else applyCombo(Number(comboEl.value));
});
(document.getElementById('comboPrev') as HTMLButtonElement).onclick = () => stepCombo(-1);
(document.getElementById('comboNext') as HTMLButtonElement).onclick = () => stepCombo(1);

// The page opens on madder over bone, which is itself one of the pairs. Found
// rather than hardcoded, so reordering PALETTES cannot desync the two.
comboEl.value = String(
  PALETTES.findIndex((p) => p.chupa === chupaColour && p.honju === honjuColour),
);
paintCombo();

// --- Colour cards, the wheel, and the harmonies ---------------------------
type Slot = 'chupa' | 'honju';
let activeSlot: Slot = 'chupa';

const cardEls: Record<Slot, HTMLElement> = {
  chupa: document.getElementById('cardChupa') as HTMLElement,
  honju: document.getElementById('cardHonju') as HTMLElement,
};
const harmonyHost = document.getElementById('harmony') as HTMLElement;
const harmonyLabel = document.getElementById('harmonyLabel') as HTMLElement;
const pickerEl = document.getElementById('picker') as HTMLElement;
/** The wheel belongs to a card, and only while that card is open. */
let pickerOpen = false;
const pickHint = document.getElementById('pickhint') as HTMLElement;
const wheelEl = document.getElementById('wheel') as HTMLCanvasElement;
const wctx = wheelEl.getContext('2d')!;
const lightEl = document.getElementById('lightness') as HTMLInputElement;

const colourOf = (slot: Slot) => (slot === 'chupa' ? chupaColour : honjuColour);
function setColour(slot: Slot, hex: string) {
  if (slot === 'chupa') chupaColour = hex; else honjuColour = hex;
}

/**
 * The wheel: hue round, saturation out from the middle, lightness on the slider.
 *
 * Drawn at device resolution. It used to be a 176-pixel image stretched across
 * 176 CSS pixels, which on any retina screen is a half-resolution image blown up
 * — the wheel looked smeared and faintly broken while everything around it was
 * sharp. It also had no marker, so after picking a palette, or coming back to a
 * card, nothing on it said where your colour actually was.
 */
const WHEEL_CSS = 176;
let wheelDpr = 1;

/** Saturation reaches 1 just inside the rim, so the outer edge is not clipped. */
const wheelMax = () => wheelEl.width / 2 - 2 * wheelDpr;

/**
 * The hue disc is painted ONCE per lightness and kept.
 *
 * It used to be recomputed pixel by pixel on every pointermove — 124,000
 * iterations of a JS loop per sample, while the garment redrew underneath it.
 * The disc only depends on lightness, and lightness does not change while you
 * are turning the wheel, so during a drag this now costs one drawImage.
 */
const wheelBase = document.createElement('canvas');
let wheelBaseKey = '';

function paintWheelBase(l: number) {
  wheelDpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(WHEEL_CSS * wheelDpr);
  if (wheelEl.width !== px) { wheelEl.width = px; wheelEl.height = px; }
  const key = `${px}:${l.toFixed(4)}`;
  if (wheelBaseKey === key) return;
  wheelBaseKey = key;
  if (wheelBase.width !== px) { wheelBase.width = px; wheelBase.height = px; }
  const bctx = wheelBase.getContext('2d')!;

  const R = px / 2;
  const rMax = wheelMax();
  const img = bctx.createImageData(px, px);
  const chroma = 1 - Math.abs(2 * l - 1);
  const feather = 1.5 * wheelDpr;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const dx = x - R + 0.5, dy = y - R + 0.5;
      const r = Math.hypot(dx, dy);
      const i = (y * px + x) * 4;
      if (r > R) { img.data[i + 3] = 0; continue; }
      const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
      // HSL to RGB inline: a hex string per pixel is ~124k allocations at 2x.
      const c = chroma * Math.min(1, r / rMax);
      const t = h / 60;
      const xx = c * (1 - Math.abs((t % 2) - 1));
      const m = l - c / 2;
      const [rr, gg, bb] =
        t < 1 ? [c, xx, 0] : t < 2 ? [xx, c, 0] : t < 3 ? [0, c, xx]
        : t < 4 ? [0, xx, c] : t < 5 ? [xx, 0, c] : [c, 0, xx];
      img.data[i] = (rr + m) * 255;
      img.data[i + 1] = (gg + m) * 255;
      img.data[i + 2] = (bb + m) * 255;
      // Feather the rim so it does not alias into a cog.
      img.data[i + 3] = r > R - feather ? Math.round(255 * (R - r) / feather) : 255;
    }
  }
  bctx.putImageData(img, 0, 0);
}

function drawWheel(l: number) {
  paintWheelBase(l);
  const px = wheelEl.width;
  const R = px / 2;
  const rMax = wheelMax();
  wctx.clearRect(0, 0, px, px);
  wctx.drawImage(wheelBase, 0, 0);

  // Where you are: a white ring with a dark keyline, so it holds against both a
  // pale wheel and a deep one.
  const cur = hexToHsl(colourOf(activeSlot));
  const a = ((cur.h - 90) * Math.PI) / 180;
  const mx = R + Math.cos(a) * cur.s * rMax;
  const my = R + Math.sin(a) * cur.s * rMax;
  wctx.lineWidth = 2.5 * wheelDpr;
  wctx.strokeStyle = 'rgba(255,255,255,0.95)';
  wctx.beginPath();
  wctx.arc(mx, my, 7 * wheelDpr, 0, Math.PI * 2);
  wctx.stroke();
  wctx.lineWidth = 1 * wheelDpr;
  wctx.strokeStyle = 'rgba(47,42,37,0.5)';
  wctx.beginPath();
  wctx.arc(mx, my, 8.6 * wheelDpr, 0, Math.PI * 2);
  wctx.stroke();
}

/**
 * The cloth each garment is cut from. Fixed, not chosen — see the note above
 * the palettes. It used to be readable only on the footer plates; now that
 * those are gone it belongs on the card, which is the one place the garment is
 * described.
 */
const CLOTH_LABEL: Record<Slot, string> = {
  chupa: 'Silk brocade · 180 gsm',
  honju: 'Silk charmeuse · 85 gsm',
};

/**
 * Just the colour: swatches, names, codes, and the wheel's marker.
 *
 * This is what a drag runs. Everything in the full refresh below either moves
 * DOM around or rebuilds the suggestion list, and neither can happen while a
 * finger is down — see the note on pointer capture at `pickFromWheel`.
 */
function paintCards() {
  for (const slot of ['chupa', 'honju'] as Slot[]) {
    const el = cardEls[slot];
    const hex = colourOf(slot);
    (el.querySelector('.swatch') as HTMLElement).style.background = hex;
    (el.querySelector('.cname') as HTMLElement).textContent = nearestNamed(hex)[0];
    (el.querySelector('.ctone') as HTMLElement).textContent = describe(hex);
    (el.querySelector('.cloth-line') as HTMLElement).textContent = CLOTH_LABEL[slot];
    (el.querySelector('.hex') as HTMLElement).textContent = hex.toUpperCase();
    el.classList.toggle('on', slot === activeSlot);
    el.classList.toggle('open', slot === activeSlot && pickerOpen);
  }
}

function refreshCards() {
  paintCards();
  // The wheel sits under the card it belongs to, and says which cloth it is
  // about to change — once it can appear in two places, "picking chupa" in a
  // fixed panel is no longer enough to tell you where you are.
  //
  // Only when it is not already there. `after()` is a remove-and-reinsert even
  // when the node is a no-op away from where it already is, and taking the
  // canvas out of the document drops any pointer capture on it.
  if (pickerEl.previousElementSibling !== cardEls[activeSlot]) {
    cardEls[activeSlot].after(pickerEl);
  }
  pickerEl.hidden = !pickerOpen;
  pickHint.textContent = activeSlot === 'chupa'
    ? 'turn the wheel to colour the chupa' : 'turn the wheel to colour the honju';
  // Not while it is the thing being dragged: the value written back is the
  // round-trip through hex, which lands a hair off where the thumb is and
  // fights it.
  if (document.activeElement !== lightEl) {
    lightEl.value = String(Math.round(hexToHsl(colourOf(activeSlot)).l * 100));
  }
  drawWheel(hexToHsl(colourOf(activeSlot)).l);

  refreshHarmonies();
}

// --- Working out the honju -------------------------------------------------
//
// Suggestions are PARTNERS for the cloth you just picked, and they dress the
// other garment. Pick a chupa, get honjus; pick a honju, get chupas. The rule
// is symmetric, and the heading names the cloth that is about to change, since
// it is not the card you are holding.
//
// What the panel was not saying is that the list is an ANSWER. It changed
// silently, in the same instant as everything else, so it read as more
// furniture rather than as the reply to what you had just done. Now it takes a
// visible beat and says whose colour it is working from.
//
// Be honest about that beat: `harmoniesFor` is a page of hue arithmetic and
// returns in well under a millisecond. The pause is staged. It is not hiding
// slow code — it is there so the sequence reads as a sequence: you chose a
// chupa, and THEN the honjus were worked out from it. Cause and effect with no
// elapsed time between them does not read as cause and effect. Short enough to
// register and too short to wait for, and skipped entirely under
// prefers-reduced-motion, where a spinner is noise rather than narration.
const THINK_MS = 520;
let harmonyKey = '';
let thinkTimer = 0;

/**
 * Nothing is suggested until something is chosen.
 *
 * The page opens dressed — it has to, there is a figure standing there — but
 * that outfit is not a choice the user made, and answering a question nobody
 * asked is how the list came to read as furniture. So the box states its
 * promise instead, and the first pick redeems it.
 */
let userHasPicked = false;
function markPicked() {
  if (userHasPicked) return;
  userHasPicked = true;
  harmonyKey = '';                 // force the next refresh to actually compute
}

const partnerSlot = (): Slot => (activeSlot === 'chupa' ? 'honju' : 'chupa');

/** Naming the cloth it works FROM is what ties the list to your choice. */
function harmonyHeading(thinking: boolean): string {
  const from = nearestNamed(colourOf(activeSlot))[0];
  const partner = partnerSlot();
  return thinking
    ? `<span class="think"><i class="spin"></i>Working out the ${partner} for ${from}…</span>`
    : `Now the ${partner} <span class="hint">— what goes with ${from}. Tap to try one.</span>`;
}

function refreshHarmonies() {
  if (!userHasPicked) {
    if (harmonyKey === 'idle') return;
    harmonyKey = 'idle';
    clearTimeout(thinkTimer);
    harmonyLabel.textContent = 'What goes with it';
    harmonyHost.innerHTML =
      '<div class="empty">Pick a colour for the <b>chupa</b> or the <b>honju</b> — ' +
      'the cloths that go with it are worked out here.</div>';
    return;
  }
  // Same cloth, same colour: the list already answers it. Without this the beat
  // replays every time the wheel is opened or shut.
  const key = `${activeSlot}:${colourOf(activeSlot)}`;
  if (key === harmonyKey) return;
  harmonyKey = key;
  clearTimeout(thinkTimer);
  if (calm.matches) { paintHarmonies(); return; }
  paintThinking();
  thinkTimer = window.setTimeout(paintHarmonies, THINK_MS);
}

/**
 * Ghost rows, one per suggestion on its way.
 *
 * An empty box would collapse the panel and then shove the page open again
 * half a second later. The skeleton holds exactly the height the answer needs,
 * so nothing moves when it lands.
 */
function paintThinking() {
  harmonyLabel.innerHTML = harmonyHeading(true);
  const n = harmoniesFor(colourOf(activeSlot)).length;
  harmonyHost.innerHTML =
    ('<span class="harm ghost"><span class="hc"></span>' +
     '<span class="hn"></span><span class="hnote"></span></span>').repeat(n);
}

function paintHarmonies() {
  const partner = partnerSlot();
  harmonyLabel.innerHTML = harmonyHeading(false);
  harmonyHost.innerHTML = '';
  harmoniesFor(colourOf(activeSlot)).forEach((h, i) => {
    const b = document.createElement('button');
    b.className = 'harm';
    // Down the list rather than all at once: it reads as an answer being
    // written out, where a block arriving at once reads as a redraw.
    b.style.animationDelay = `${i * 45}ms`;
    b.innerHTML =
      `<span class="hc" style="background:${h.hex}"></span>` +
      `<span class="hn">${h.name}</span><span class="hnote">${h.note}</span>`;
    b.onclick = () => {
      setColour(partner, h.hex);
      clearPalettePicks();
      refreshCards();
      kiss();
    };
    harmonyHost.appendChild(b);
  });
}

/**
 * A hand-picked colour is no longer any of the ready-made pairs, and the
 * control has to stop claiming it is. The note is only rewritten on the way
 * out of a combination — this runs on every sample of a wheel drag.
 */
function clearPalettePicks() {
  if (comboEl.value === '') { paintComboChip(); return; }
  comboEl.value = '';
  paintCombo();
}

// Tap a cloth to open the wheel under it; tap the same one again to put the
// wheel away. Tapping the OTHER cloth moves the wheel rather than closing it,
// which is what you want when you are going back and forth between the two.
for (const slot of ['chupa', 'honju'] as Slot[]) {
  cardEls[slot].onclick = () => {
    // Opening a cloth IS the pick, as far as the right column is concerned —
    // it should start working before the wheel has been touched, so the answer
    // is already there when you look up from it.
    markPicked();
    pickerOpen = slot === activeSlot ? !pickerOpen : true;
    activeSlot = slot;
    refreshCards();
    if (pickerOpen) pickerEl.scrollIntoView({ block: 'nearest' });
  };
}

/**
 * Turning the wheel.
 *
 * Three things made this finicky, and all three are the same shape of mistake —
 * treating a drag as a series of unrelated taps:
 *
 * 1. Every sample called the full `refreshCards`, which re-inserted the picker
 *    into the DOM. Taking the canvas out of the document RELEASES ITS POINTER
 *    CAPTURE, so the drag died on the first move and you were back to tapping.
 * 2. A sample outside the rim returned without doing anything, so swinging
 *    round the outside — the natural way to run through hues at full
 *    saturation — kept dropping the colour. A drag now CLAMPS to the rim
 *    instead; only the initial press has to land on the disc.
 * 3. Lightness was re-read from the slider each sample, and the slider was
 *    being rewritten from the round-trip through hex each sample, so lightness
 *    walked while you turned. It is now fixed at the press.
 */
let dragId: number | null = null;
let dragL = 0;
let dragPoint: { x: number; y: number } | null = null;
let dragRaf = 0;

/** Hue from the angle, saturation from the radius. Clamped once a drag is on. */
function pickFromWheel(clientX: number, clientY: number, clamp: boolean) {
  const r = wheelEl.getBoundingClientRect();
  const R = wheelEl.width / 2;
  const dx = ((clientX - r.left) / r.width) * wheelEl.width - R;
  const dy = ((clientY - r.top) / r.height) * wheelEl.height - R;
  const rad = Math.hypot(dx, dy);
  if (!clamp && rad > R) return false;
  const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
  // Same rMax the wheel is painted with — if these two drift apart the marker
  // lands somewhere other than the colour you tapped.
  setColour(activeSlot, hslToHex({ h, s: Math.min(1, rad / wheelMax()), l: dragL }));
  clearPalettePicks();
  return true;
}

/**
 * One repaint per frame, not one per pointer sample.
 *
 * A trackpad emits pointermoves faster than the display refreshes; coalescing
 * to the frame is why the garment keeps up with the wheel.
 */
function flushDrag() {
  dragRaf = 0;
  if (!dragPoint) return;
  const { x, y } = dragPoint;
  dragPoint = null;
  pickFromWheel(x, y, true);
  paintCards();
  drawWheel(dragL);
  draw();
}

wheelEl.addEventListener('pointerdown', (ev) => {
  markPicked();
  dragL = Number(lightEl.value) / 100;
  if (!pickFromWheel(ev.clientX, ev.clientY, false)) return;   // missed the disc
  dragId = ev.pointerId;
  // Capture keeps the moves coming once the pointer leaves the canvas, which is
  // most of a drag. It throws for a pointer id the browser does not know about
  // (a synthetic event), and that must not take the drag down with it.
  try { wheelEl.setPointerCapture(ev.pointerId); } catch { /* not a live pointer */ }
  ev.preventDefault();
  paintCards();
  drawWheel(dragL);
  draw();
});

wheelEl.addEventListener('pointermove', (ev) => {
  if (ev.pointerId !== dragId) return;
  dragPoint = { x: ev.clientX, y: ev.clientY };
  if (!dragRaf) dragRaf = requestAnimationFrame(flushDrag);
});

function endDrag(ev: PointerEvent, landed: boolean) {
  if (ev.pointerId !== dragId) return;
  dragId = null;
  if (dragRaf) { cancelAnimationFrame(dragRaf); flushDrag(); }
  // The suggestions and the lightness slider catch up now that nothing is being
  // held — this is the pass that was tearing the capture out mid-drag.
  refreshCards();
  draw();
  // The kiss lands when you LET GO, not on every sample of a drag — a ripple per
  // pointermove would be a vibration, not a garment.
  if (landed) kiss(0.7);
}
wheelEl.addEventListener('pointerup', (ev) => endDrag(ev, true));
wheelEl.addEventListener('pointercancel', (ev) => endDrag(ev, false));

lightEl.addEventListener('input', () => {
  markPicked();
  const c = hexToHsl(colourOf(activeSlot));
  setColour(activeSlot, hslToHex({ ...c, l: Number(lightEl.value) / 100 }));
  clearPalettePicks();
  refreshCards();
  draw();
});

const knobHost = document.getElementById('knobs') as HTMLElement;
for (const k of KNOBS) {
  const row = document.createElement('label');
  row.className = 'knob';
  const val = document.createElement('span');
  val.className = 'v';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(k.min); input.max = String(k.max); input.step = String(k.step);
  input.value = String(live[k.group][k.key]);
  const show = () => { val.textContent = Number(input.value).toFixed(k.step < 0.1 ? 2 : 1); };
  show();
  input.addEventListener('input', () => {
    live[k.group][k.key] = Number(input.value);
    show();
    rebuild();
  });
  const name = document.createElement('span');
  name.className = 'n';
  name.textContent = k.label;
  row.append(name, input, val);
  knobHost.appendChild(row);
}

const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
saveBtn.onclick = async () => {
  saveBtn.textContent = 'saving…';
  try {
    const res = await fetch('/__spec', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(live),
    });
    if (!res.ok) throw new Error(await res.text());
    saveBtn.textContent = 'saved ✓';
  } catch (err) {
    saveBtn.textContent = 'save failed';
    console.error(err);
  }
  setTimeout(() => { saveBtn.textContent = 'save numbers'; }, 2000);
};

const advanced = document.getElementById('advanced') as HTMLElement;
const advancedBtn = document.getElementById('advancedBtn') as HTMLButtonElement;
advancedBtn.onclick = () => {
  const open = advanced.hasAttribute('hidden');
  if (open) advanced.removeAttribute('hidden'); else advanced.setAttribute('hidden', '');
  advancedBtn.classList.toggle('on', open);
  advancedBtn.textContent = open ? 'done' : 'adjust the cut';
  refreshCards();
resize();
};

toggle('collarBtn', () => showCollar, (v) => { showCollar = v; });
toggle('sleeveBtn', () => showSleeves, (v) => { showSleeves = v; });
toggle('figureBtn', () => showFigure, (v) => { showFigure = v; });
toggle('gridBtn', () => showGrid, (v) => { showGrid = v; });
toggle('edgeBtn', () => showEdges, (v) => { showEdges = v; });

refreshCards();
resize();
// Laid over the hanger, let go, and left to settle.
drop();
