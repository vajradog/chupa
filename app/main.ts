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
  GARMENT_SPEC, PANGDEN_REGIONS, buildFlatChupa, harmoniesFor, hexToHsl, hslToHex,
  nearestNamed, dyesInProgram, hexToOklch, pangdenHex, pangdenRegion, tuneDyes,
  weavePangden,
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

/**
 * The pangden is its own garment, and optional.
 *
 * Not a detail of the chupa — a separate thing, woven by different people from
 * different wool, tied on last. It also carries a meaning the other two do not:
 * traditionally the apron is worn by married women. That is stated where it is
 * useful and it gates nothing — the toggle is a toggle, labelled for the
 * garment rather than for the wearer's marital status.
 *
 * Declared up here with the rest of the module's state, and not down beside its
 * card, because `currentSpec` reads it and `currentSpec` runs while this file is
 * still evaluating. Below the first call it is a temporal dead zone and the
 * whole page dies on load — which `tsc` will not tell you, since using a `let`
 * before its declaration is only an error at runtime.
 */
/**
 * OFF to begin with. The page opens on the chupa and the honju, which are the
 * two cloths the game is actually about; the apron is a third thing you add.
 * It also means the first thing anyone sees is the garment itself rather than
 * a striped panel covering most of it.
 *
 * And when it does go on, it goes on as Towns — narrow even stripes across many
 * colours, which is the best-looking of the seven and so the right one to be
 * met by. The others are a step away, not hidden.
 */
let showPangden = false;
let pangdenStyle = 'Towns';
/**
 * Letter to hex, holding only the dyes that have been moved off their plant.
 *
 * Up here with the other early state for the same reason as the two above it:
 * the first `buildFlatChupa` runs while this file is still evaluating, and a
 * `let` read before its declaration is a dead page that `tsc` will not warn
 * about.
 */
let pangdenDyes: Record<string, string> = {};

function currentSpec(): GarmentSpec {
  // The chosen region's weave replaces the one in panels.json. That file keeps
  // a single stripe program because the shell needs one to build from; which
  // apron she is wearing is a choice, not a property of the pattern.
  const region = pangdenRegion(pangdenStyle);
  return {
    ...GARMENT_SPEC,
    chupa: { ...GARMENT_SPEC.chupa, ...live.chupa },
    honju: { ...GARMENT_SPEC.honju, ...live.honju },
    pangden: {
      ...GARMENT_SPEC.pangden,
      ...(region ? { stripeProgram: region.stripeProgram } : {}),
    },
  };
}

void MATERIAL_KEYS;
/**
 * The three cloths, fixed. Not offered, and the reason is worth keeping.
 *
 * A picker was built for the chupa and the honju and then removed (Thupten,
 * 2026-08-11) because it was confusing rather than useful. The honju's cloth is
 * the clearer half of the argument: nothing of the honju is simulated — it
 * shows at the collar and the cuffs, where material changes only how it catches
 * the light — so a control offering four cloths that visibly do nothing is
 * worse than no control.
 *
 * The chupa's cloth did do something, once `setFabric` was actually called on
 * the solver: swing amplitude tracks weight cleanly, about 2× from charmeuse to
 * nambu. But the only place it shows is during the second or two after a drop,
 * and you have to be watching. That is not enough surface for a choice.
 *
 * WHAT THIS COSTS. The brief's decision 5 says material change is a live
 * physics event and the single most shareable moment in the product. There is
 * now nowhere in the app that moment can happen. The fabric presets, the
 * solver's response to them, and the settle tests are all still here and all
 * still right — what is missing is a garment whose SHAPE answers to weight, and
 * this one cannot: `waistGatherRatio` is 1, so there is no surplus to fold and
 * no silhouette for weight to change. The moment needs the 3D turntable, or a
 * gathered garment, not another dropdown.
 */
const material: Fabric = FABRICS.silk;
const honjuMaterial: Fabric = FABRICS.charmeuse;
// The pangden is not silk and never was: it is hand-woven wool, from the finer
// valley fleece (yulphel) rather than the highland rug wool. It catches the
// light quite differently from the cloths either side of it, which is part of
// why an apron reads as a separate thing tied on rather than as part of the
// dress.
const pangdenMaterial: Fabric = FABRICS.wool;

/** Which cloth a region is cut from — they shade differently. */
function materialFor(region: FlatRegion): Fabric {
  if (region.garment === 'pangden') return pangdenMaterial;
  return region.garment === 'chupa' ? material : honjuMaterial;
}

let flat = buildFlatChupa(form, currentSpec(), material, { pangdenDyes });
function rebuild() {
  flat = buildFlatChupa(form, currentSpec(), material, { pangdenDyes });
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

const stageEl = document.getElementById('stage') as HTMLElement;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = stageEl.clientWidth; H = stageEl.clientHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  pxPerCm = (H * 0.92) / HEIGHT_CM;
  originX = W / 2;
  floorY = H - (H - HEIGHT_CM * pxPerCm) / 2;
  draw();
}
window.addEventListener('resize', resize);

/**
 * A page that loads with no size has to notice when it gets one.
 *
 * Opened in a background tab the stage measures 0×0, so the canvas is 0×0, so
 * the off-screen shading layer is too — and `drawImage` from a zero-sized
 * canvas throws, which killed the whole draw. Switching to the tab fires no
 * resize event, so it stayed dead: a blank room, and a thrown exception as the
 * only clue. Observing the stage catches the 0 → real transition that `resize`
 * alone never hears about.
 */
new ResizeObserver(() => { if (stageEl.clientWidth > 0) resize(); }).observe(stageEl);

// Touching her puts everything away. The room is the one part of the screen
// that is not a control, so it is the natural place to mean "I am done with
// that" — and on a phone it is also the largest target on the page by far.
stageEl.addEventListener('pointerdown', () => closeSheet());

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
  const cloth = materialFor(region);
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
    if (region.garment === 'pangden' && !showPangden) return false;
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
  // Nothing to shade, and `drawImage` from a zero-sized canvas throws.
  if (cv.width === 0 || cv.height === 0) return;
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

    const c = materialFor(region);
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
    // A pangden band carries its own dye. Every other region takes the
    // colour chosen for its garment.
    const base = region.colour ?? (region.garment === 'honju' ? honjuColour : chupaColour);
    tracePath(region.outline);
    ctx.closePath();
    ctx.fillStyle = clothFill(region, base);
    ctx.fill();
    // A darker line on every silhouette edge: it separates pieces of the same
    // cloth, which flat fills alone cannot do. Its weight is the cloth's own —
    // a cut edge in melton reads heavier than one in georgette. Kept lighter
    // than it was: at -0.55 every panel was outlined like a colouring book.
    // NOT on a pangden band. That edge is for separating pieces of cloth from
    // each other, and a band is not a piece — it is a stripe woven into one. An
    // outline around each of them turned the apron into brickwork. The apron
    // gets a single edge of its own, below.
    if (region.garment !== 'pangden') {
      const cloth2 = materialFor(region);
      ctx.strokeStyle = shade(base, -0.40);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.9 + cloth2.thickness * 0.85;
      ctx.stroke();
    }
    if (showEdges) {
      ctx.strokeStyle = '#4fb0c6';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // One edge around the whole apron, now that its bands do not each carry one.
  // Traced as the union of the bands rather than as a rectangle, because the
  // apron narrows with the skirt it hangs on.
  if (showPangden) {
    const bands = flat.regions.filter((r) => r.garment === 'pangden');
    if (bands.length > 0) {
      const ys = bands.flatMap((r) => r.outline.map((p) => p[1]));
      const top = Math.max(...ys);
      const bot = Math.min(...ys);
      const halfAt = (y: number) => Math.max(
        ...bands.filter((r) => {
          const rys = r.outline.map((p) => p[1]);
          return Math.min(...rys) <= y + 1e-6 && Math.max(...rys) >= y - 1e-6;
        }).flatMap((r) => r.outline.map((p) => Math.abs(p[0]))),
        0,
      );
      const left: [number, number][] = [];
      const right: [number, number][] = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const y = bot + ((top - bot) * i) / steps;
        const h = halfAt(y);
        left.push([-h, y]);
        right.push([h, y]);
      }
      tracePath([...right, ...left.reverse()]);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(38,28,18,0.34)';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1.1 + pangdenMaterial.thickness * 0.85;
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

/**
 * The same pairs as the dropdown, as cloth, as a ribbon under it in the sheet.
 *
 * Phone only — it is hidden by CSS on a wide screen, where the named list has
 * room to be read. Built once; only the mark on the current one moves.
 */
const combRail = document.getElementById('combrail') as HTMLElement;
const railPairs: HTMLElement[] = PALETTES.map((pal, i) => {
  const b = document.createElement('button');
  b.className = 'cpair';
  b.title = `${pal.name} — ${pal.note}`;
  b.innerHTML = `<i style="background:${pal.chupa}"></i>`
    + `<i class="b" style="background:${pal.honju}"></i>`;
  b.onclick = () => applyCombo(i);
  combRail.appendChild(b);
  return b;
});

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
  railPairs.forEach((b, k) => b.classList.toggle('on', k === i));
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

// --- The pangden ----------------------------------------------------------
//
// Its own panel, behind its own tab, because it is its own garment: woven by
// other people from other wool on another loom, and tied on last. The chupa and
// the honju share a tab because they are chosen against each other; the apron
// is not chosen against either.
const pgOn = document.getElementById('pgOn') as HTMLInputElement;
const pgWeaveEl = document.getElementById('pgweave') as HTMLCanvasElement;
const pgStyleEl = document.getElementById('pgStyle') as HTMLSelectElement;
const dyeHost = document.getElementById('dyes') as HTMLElement;
const dyeLabel = document.getElementById('dyeLabel') as HTMLElement;
const tabCloth = document.getElementById('tabCloth') as HTMLButtonElement;
const tabPangden = document.getElementById('tabPangden') as HTMLButtonElement;
const paneCloth = document.getElementById('paneCloth') as HTMLElement;
const panePangden = document.getElementById('panePangden') as HTMLElement;


const dyeEls = new Map<string, HTMLElement>();

for (const r of PANGDEN_REGIONS) {
  const o = document.createElement('option');
  o.value = r.name;
  o.textContent = r.name;
  pgStyleEl.appendChild(o);
}
pgStyleEl.value = pangdenStyle;

const dyeHex = (letter: string): string => pangdenDyes[letter] ?? pangdenHex(letter);

/**
 * Which colour sits at which place in the weave.
 *
 * The apron's colours come from matching it to the outfit, and its ORDER comes
 * from you — drag a chip and that colour moves along the cloth. Those are two
 * separate things, so they are stored separately: `dyeOrder` is a permutation
 * that says slot i wears the colour originally worked out for slot `dyeOrder[i]`,
 * and it survives every re-match. Otherwise picking a new chupa colour would
 * silently undo an arrangement you had just made.
 *
 * `dyeAuto` is what matching produced, by letter. `dyeByHand` is anything you
 * turned the wheel on, keyed by ORIGINAL index so that a hand-picked colour
 * travels with its chip when you drag it rather than staying put.
 */
let dyeOrder: number[] = [];
let dyeAuto: Record<string, string> = {};
let dyeByHand: Record<number, string> = {};

const dyeLetters = (): string[] => dyesInProgram(currentSpec().pangden.stripeProgram);

/** A different apron has different dyes, so the old arrangement means nothing. */
function resetDyeOrder(n: number) {
  dyeOrder = Array.from({ length: n }, (_, i) => i);
  dyeByHand = {};
}

/** Fold order, matching and hand-picks into the one map the weave reads. */
function composeDyes() {
  const letters = dyeLetters();
  if (dyeOrder.length !== letters.length) resetDyeOrder(letters.length);
  const base = letters.map((l) => dyeAuto[l] ?? pangdenHex(l));
  const out: Record<string, string> = {};
  letters.forEach((l, i) => {
    const from = dyeOrder[i];
    out[l] = dyeByHand[from] ?? base[from];
  });
  pangdenDyes = out;
}

function setDye(letter: string, hex: string) {
  const i = dyeLetters().indexOf(letter);
  if (i >= 0) dyeByHand[dyeOrder[i]] = hex;
  composeDyes();
  refreshDyes();
  rebuild();
}

/**
 * Move the colour at one slot to another, and let the cloth follow.
 *
 * `rerender` is false while a drag is in progress, and that is not an
 * optimisation. `refreshDyes` empties the container and builds the chips again,
 * which DESTROYS THE ELEMENT UNDER THE FINGER — the drag then had nothing to
 * hold, so the lift disappeared and no second swap could ever land. Nothing
 * needs rebuilding anyway: the chip that was dragged into a slot is already
 * showing the colour that slot now takes, so the DOM is correct without being
 * thrown away. The chips are rebuilt once, when the hand comes off.
 */
function moveDye(from: number, to: number, rerender = true) {
  if (from === to || from < 0 || to < 0 || to >= dyeOrder.length) return;
  const [held] = dyeOrder.splice(from, 1);
  dyeOrder.splice(to, 0, held);
  composeDyes();
  if (rerender) refreshDyes();
  rebuild();
}

/** The apron as cloth, on the chip: hem at the bottom, waist at the top. */
function drawPangdenChip() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round((pgWeaveEl.clientWidth || 42) * dpr);
  const h = Math.round((pgWeaveEl.clientHeight || 24) * dpr);
  if (pgWeaveEl.width !== w || pgWeaveEl.height !== h) {
    pgWeaveEl.width = w; pgWeaveEl.height = h;
  }
  const c = pgWeaveEl.getContext('2d')!;
  const spec = currentSpec().pangden;
  // Rows are the chip's pixels, so a band is never thinner than a line.
  const rows = Math.max(12, Math.round(h / (2 * dpr)));
  const weave = weavePangden(spec, rows, pangdenDyes);
  const panelW = w / weave.panels.length;
  c.clearRect(0, 0, w, h);
  weave.bands.forEach((bands, k) => {
    for (const b of bands) {
      // Hem-first rows, drawn bottom-up.
      const y0 = h - (b.to / rows) * h;
      c.fillStyle = b.hex;
      c.fillRect(Math.round(k * panelW), y0, Math.ceil(panelW) + 1,
        ((b.to - b.from) / rows) * h + 1);
    }
  });
}

/**
 * Working the dyes out, with the same visible beat the honju gets.
 *
 * Same argument as there, and the same honesty: `tuneDyes` is a hue rotation
 * and returns instantly. The pause is staged so that ticking the box and
 * getting an apron back reads as one thing causing the other.
 */
let dyeThinking = false;
let dyeTimer = 0;

/** One chip per dye the current apron actually uses, in the weaver's order. */
function refreshDyes() {
  const letters = dyesInProgram(currentSpec().pangden.stripeProgram);
  // A dye no longer in the cloth cannot still be the one being edited.
  if (activeDye && !letters.includes(activeDye)) closeDyePicker();
  dyeHost.innerHTML = '';
  dyeEls.clear();

  if (dyeThinking) {
    dyeLabel.innerHTML = '<span class="think"><i class="spin"></i>Working out an apron'
      + ' for this outfit…</span>';
    dyeHost.innerHTML = ('<span class="dye ghost"><i></i><span class="dn"></span>'
      + '<span class="dhex"></span></span>').repeat(letters.length);
    return;
  }

  dyeLabel.innerHTML = 'Its dyes <span class="hint">— tap one to change it</span>';
  for (const letter of letters) {
    const hex = dyeHex(letter);
    const b = document.createElement('button');
    b.className = `dye${activeDye === letter ? ' on' : ''}`;
    b.innerHTML = `<i style="background:${hex}"></i>`
      + `<span class="dn">${nearestNamed(hex)[0]}</span>`
      + `<span class="dhex">${hex.toUpperCase()}</span>`;
    b.onclick = () => openDyePicker(letter);
    dyeHost.appendChild(b);
    dyeEls.set(letter, b);
  }
  drawPangdenChip();
}

/**
 * Match the apron to what she has on. Not asked for — just done.
 *
 * There was a "tune to the outfit" button and a "the dyes it was woven with"
 * button beside it. Both are gone (Thupten, 2026-08-11): the first was a step
 * between wanting the thing and having it, and the second offered to restore
 * dyestuffs this project cannot actually claim to know. The apron simply
 * follows the outfit now.
 */
function applyTune() {
  dyeThinking = false;
  clearTimeout(dyeTimer);
  matchedTo = '';
  matchPangdenToOutfit();
  kiss(0.7);
}

/**
 * Re-match whenever the outfit or the apron has changed under it.
 *
 * Keyed, so it runs once per actual change rather than on every repaint — and
 * so a dye you tapped by hand survives until the thing it was matched TO moves.
 * Called from `refreshCards`, which runs on release rather than on every sample
 * of a wheel drag, so the apron settles when your hand stops.
 */
let matchedTo = '';
function matchPangdenToOutfit() {
  if (!showPangden || dyeThinking) return;
  const key = `${pangdenStyle}:${chupaColour}:${honjuColour}`;
  if (key === matchedTo) return;
  matchedTo = key;
  dyeAuto = tuneDyes(currentSpec().pangden.stripeProgram, chupaColour, honjuColour);
  composeDyes();
  refreshDyes();
  rebuild();
}

function tuneWithBeat() {
  clearTimeout(dyeTimer);
  if (calm.matches) { applyTune(); return; }
  dyeThinking = true;
  refreshDyes();
  dyeTimer = window.setTimeout(applyTune, THINK_MS);
}

function openDyePicker(letter: string) {
  markPicked();
  // Tapping the same chip again puts the wheel away, exactly as a garment card
  // does — the gesture must not mean two different things in two panels.
  pickerOpen = !(activeDye === letter && pickerOpen);
  activeDye = pickerOpen ? letter : null;
  refreshDyes();
  refreshCards();
}

function closeDyePicker() {
  if (!activeDye) return;
  activeDye = null;
  pickerOpen = false;
}


/**
 * One sheet on a small screen, two floating panels on a large one.
 *
 * On a phone the room takes what is left of the screen and everything else is a
 * single sheet under it, so only one of the three panes can be up at a time —
 * `wearing` is the left panel, the other two are the right panel's. On a wide
 * screen both panels are visible at once and `wearing` means nothing, so the
 * bar is hidden and only the cloth/pangden half applies.
 *
 * Both live here rather than in two places because the same events drive them:
 * ticking the pangden has to open the pangden, on either layout.
 */
const sheet = matchMedia('(max-width: 1080px)');
const cardsPanel = document.querySelector('.panel.cards') as HTMLElement;
const combosPanel = document.querySelector('.panel.combos') as HTMLElement;
const mtabs = document.getElementById('mtabs') as HTMLElement;
const mtabPangden = document.getElementById('mtabPangden') as HTMLButtonElement;
type Pane = 'cloth' | 'pangden';
let pane: Pane = 'cloth';

function showPane(which: Pane) {
  if (which === 'pangden' && !showPangden) which = 'cloth';
  pane = which;
  // The wardrobe is beside the figure on a phone and in its own panel on a
  // wide screen, but it is never hidden either way — only the sheet's contents
  // change.
  cardsPanel.hidden = false;
  combosPanel.hidden = false;
  for (const b of Array.from(mtabs.querySelectorAll('.mtab'))) {
    const on = (b as HTMLElement).dataset.pane === which;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  }
  showTab(which);
  // The wheel belongs to whatever opened it, and that may have just left.
  if (which !== 'pangden' && activeDye) { closeDyePicker(); refreshDyes(); refreshCards(); }
}

for (const b of Array.from(mtabs.querySelectorAll('.mtab'))) {
  b.addEventListener('click', () => {
    showPane((b as HTMLElement).dataset.pane as Pane);
    openSheet();
  });
}
// Turning the phone, or resizing a window past the breakpoint, changes which
// layout is in force — reapply rather than leaving a panel hidden on a wide
// screen where nothing can bring it back.
sheet.addEventListener('change', () => {
  // A sheet is a phone idea. Carried onto a wide screen the class would leave
  // the room permanently short for a panel that is floating there anyway.
  if (!sheet.matches) { sheetShown = false; mainEl.classList.remove('open'); }
  // Coming the other way, a wheel that was open under its card is now parked in
  // the sheet — so the sheet has to be out, or it is open somewhere nobody can
  // see and the next tap on that card shuts it.
  else if (pickerOpen) openSheet();
  showPane(pane);
  // The wheel is parked in the sheet on one layout and under its card on the
  // other, so crossing the line has to re-park it — otherwise it is left in a
  // panel that layout does not put it in.
  refreshCards();
});

/**
 * The sheet, on a phone: summoned, then dismissed.
 *
 * The room is the whole screen and she is drawn as large as it will take, so
 * every control has to be something that COMES UP over her and goes away again
 * — a dock along the foot for what she has on, and this for whatever you are
 * changing. Opening it also lifts the room's floor by its height, which is the
 * part that matters: the sheet never covers the garment it is editing.
 *
 * `#main.open` is the whole of the state. The sheet's transform, the room's
 * floor and the direction it all travels are CSS, so a phone turned sideways
 * slides the same panel in from the side with nothing here changing.
 */
const mainEl = document.getElementById('main') as HTMLElement;
const sheetEl = document.getElementById('sheet') as HTMLElement;
const grabEl = document.getElementById('grab') as HTMLElement;
/** Sideways, the sheet comes from the right — so the gesture is horizontal. */
const sideways = matchMedia(
  '(max-width: 1080px) and (max-height: 560px) and (orientation: landscape)',
);
let sheetShown = false;

function openSheet() {
  if (!sheet.matches || sheetShown) return;
  sheetShown = true;
  mainEl.classList.add('open');
}

function closeSheet() {
  if (!sheetShown) return;
  sheetShown = false;
  mainEl.classList.remove('open');
  // The wheel lives in the sheet, and a wheel that is still "open" while the
  // sheet is away means the next tap on that card shuts it instead of showing
  // it. Putting the sheet away puts away what was in it.
  if (pickerOpen) closePicker();
}

/**
 * Pulling it down.
 *
 * A grabber that only accepted a tap would be a button drawn as a handle. It
 * follows the finger instead, and lets go past a threshold — which is also why
 * the transition is turned off for the duration: the transform is being set
 * frame by frame, and easing it would put the sheet behind the finger.
 */
let grabFrom = 0;
let grabBy = 0;
let grabbing = false;

grabEl.addEventListener('pointerdown', (ev) => {
  if (!sheet.matches || !sheetShown) return;
  grabbing = true;
  grabBy = 0;
  grabFrom = sideways.matches ? ev.clientX : ev.clientY;
  grabEl.setPointerCapture(ev.pointerId);
  sheetEl.style.transition = 'none';
});

grabEl.addEventListener('pointermove', (ev) => {
  if (!grabbing) return;
  const side = sideways.matches;
  // Only the way it is allowed to go. Dragging it further open would show the
  // gap it came out of.
  grabBy = Math.max(0, (side ? ev.clientX : ev.clientY) - grabFrom);
  sheetEl.style.transform = side ? `translateX(${grabBy}px)` : `translateY(${grabBy}px)`;
});

/**
 * Let go, and it either carries on or springs back — in that order, because
 * dropping the class first means the transform it eases back to is the closed
 * one. Clearing the inline transform first would snap it home and then animate
 * from there.
 */
function endGrab() {
  if (!grabbing) return;
  grabbing = false;
  if (grabBy > 56) closeSheet();
  sheetEl.style.transition = '';
  sheetEl.style.transform = '';
}
grabEl.addEventListener('pointerup', endGrab);
grabEl.addEventListener('pointercancel', endGrab);
// A tap on it is the same instruction as a short pull.
grabEl.addEventListener('click', () => { if (grabBy <= 6) closeSheet(); });

function showTab(which: 'cloth' | 'pangden') {
  const pangden = which === 'pangden' && showPangden;
  paneCloth.hidden = pangden;
  panePangden.hidden = !pangden;
  tabCloth.classList.toggle('on', !pangden);
  tabPangden.classList.toggle('on', pangden);
  tabCloth.setAttribute('aria-selected', String(!pangden));
  tabPangden.setAttribute('aria-selected', String(pangden));
  if (!pangden && activeDye) { closeDyePicker(); refreshDyes(); refreshCards(); }
}

function refreshPangden() {
  pgOn.checked = showPangden;
  // Not disabled — absent. She is not wearing one, so there is nothing to
  // choose, and a greyed-out tab is a promise the page cannot keep.
  tabPangden.hidden = !showPangden;
  mtabPangden.hidden = !showPangden;
  // A bar with one tab in it is a label pretending to be a choice.
  mtabs.classList.toggle('lone', !showPangden);
  // The regional note and the dyepot explanation used to print under these two
  // controls. Both are gone from the page at Thupten's call — the panel reads
  // as a wardrobe, not a catalogue entry. The sourcing is not lost with them:
  // every region still carries Buckley's characterisation in `PANGDEN_REGIONS`,
  // and the tests still hold each program to it.
  refreshDyes();
}

tabCloth.onclick = () => showPane('cloth');
tabPangden.onclick = () => showPane('pangden');

function setPangdenStyle(name: string) {
  pangdenStyle = name;
  pgStyleEl.value = name;
  resetDyeOrder(dyeLetters().length);
  refreshPangden();
  matchPangdenToOutfit();
  rebuild();
  kiss(0.6);
}

pgStyleEl.addEventListener('change', () => setPangdenStyle(pgStyleEl.value));
const stepPangden = (by: number) => {
  const i = PANGDEN_REGIONS.findIndex((r) => r.name === pangdenStyle);
  const n = PANGDEN_REGIONS.length;
  setPangdenStyle(PANGDEN_REGIONS[((i + by) % n + n) % n].name);
};
(document.getElementById('pgPrev') as HTMLButtonElement).onclick = () => stepPangden(-1);
(document.getElementById('pgNext') as HTMLButtonElement).onclick = () => stepPangden(1);

pgOn.addEventListener('change', () => {
  showPangden = pgOn.checked;
  refreshPangden();
  // Ticking it is a choice about the apron, so it opens the apron — and on a
  // phone that means bringing the sheet out with the apron in it. Unticking it
  // is the end of that conversation, so the sheet goes away.
  showPane(showPangden ? 'pangden' : 'cloth');
  if (showPangden) openSheet(); else closeSheet();
  draw();
  kiss(0.6);
  // And it arrives already tuned to what she has on, rather than as a regional
  // apron that happens to clash with the chupa you just chose. The weave stays
  // whichever region is selected — only the dyepots move — and one button puts
  // them back to what that region was actually woven with.
  if (showPangden) tuneWithBeat(); else { dyeThinking = false; clearTimeout(dyeTimer); }
});

/**
 * The apron's tile in the dock, once she is wearing one.
 *
 * The dock is the only thing on screen when the sheet is away, so everything in
 * the sheet has to be reachable from it. The two cloths are: tapping one brings
 * the wheel up. The apron was not — its tile is a checkbox, so tapping it took
 * the apron OFF, and the pane of dyes and regions behind it could only be got
 * back by untying the apron and tying it on again.
 * So once it is on, the tile is a way in like the other two, and the box in it
 * is the only thing that still unties it.
 */
const pgTile = document.querySelector('.pgcheck') as HTMLElement;
pgTile.addEventListener('click', (ev) => {
  if (!sheet.matches || !showPangden) return;
  if (ev.target === pgOn) return;
  // The tile is a <label>, so without this the tap would reach the box anyway.
  ev.preventDefault();
  showPane('pangden');
  openSheet();
});

// --- Colour cards, the wheel, and the harmonies ---------------------------
type Slot = 'chupa' | 'honju';
let activeSlot: Slot = 'chupa';

const cardEls: Record<Slot, HTMLElement> = {
  chupa: document.getElementById('cardChupa') as HTMLElement,
  honju: document.getElementById('cardHonju') as HTMLElement,
};
const harmonyHost = document.getElementById('harmony') as HTMLElement;
const harmonyLabel = document.getElementById('harmonyLabel') as HTMLElement;
/** The animatable wrapper. It is what moves; the wheel just rides in it. */
const pickerSlot = document.getElementById('pickerslot') as HTMLElement;
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
 * What the wheel is pointed at.
 *
 * Usually one of the two garments. But the pangden panel lets you re-dye the
 * apron, and a dye is a third kind of target — so the wheel takes an aim rather
 * than a slot, and everything that reads or writes "the colour being edited"
 * goes through this pair. `activeDye` set means the wheel has been carried over
 * to the pangden panel and belongs to a chip there.
 */
let activeDye: string | null = null;

const targetHex = (): string =>
  (activeDye ? dyeHex(activeDye) : colourOf(activeSlot));

function setTarget(hex: string) {
  if (activeDye) setDye(activeDye, hex); else setColour(activeSlot, hex);
}

/**
 * What the wheel is pointing at — a garment card, or the dye grid.
 *
 * The slot is MOVED to sit after this, so the wheel drops out of the thing it
 * belongs to and pushes whatever is below it down. `activeDye` and `activeSlot`
 * are separate pieces of state, and the two must never disagree: opening a
 * garment card while a dye was still active used to leave the wheel aimed at
 * the dye and quietly re-dye the apron. Both the anchor and the target come
 * from these two lines, so they cannot.
 *
 * After the whole dye GRID rather than the chip you tapped — the chips wrap,
 * and a full-width wheel between two of them forces a new row, which pushed the
 * third chip below the wheel and out of sight.
 */
function pickerAnchor(): HTMLElement {
  return activeDye ? dyeHost : cardEls[activeSlot];
}

/**
 * On a phone the wheel cannot drop out of the card it belongs to, because that
 * card is sitting on the room beside her — a 150px wheel there would cover the
 * garment you are colouring. So it goes to the top of the sheet instead, which
 * is the one place with room and the one place already in view.
 */
function pickerParent(): HTMLElement | null {
  if (!sheet.matches || activeDye) return null;
  return pane === 'pangden' ? panePangden : paneCloth;
}

/** Park the wheel under whatever opened it, and open or shut the slot. */
function placePicker() {
  const into = pickerParent();
  if (into) {
    // First thing in the sheet, so it is what you see when it opens.
    if (pickerSlot.parentElement !== into || pickerSlot.previousElementSibling) {
      into.prepend(pickerSlot);
    }
  } else {
    const anchor = pickerAnchor();
    // Only when it is not already there. Re-inserting a node drops any pointer
    // capture on the canvas inside it, which killed drags mid-turn.
    if (pickerSlot.previousElementSibling !== anchor) anchor.after(pickerSlot);
  }
  pickerSlot.classList.toggle('open', pickerOpen);
  pickerSlot.setAttribute('aria-hidden', String(!pickerOpen));
}

/** Anywhere else, and it goes away. */
addEventListener('pointerdown', (ev) => {
  if (!pickerOpen) return;
  const t = ev.target as Node;
  if (pickerSlot.contains(t)) return;
  if (cardEls.chupa.contains(t) || cardEls.honju.contains(t) || dyeHost.contains(t)) return;
  closePicker();
}, true);

addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (pickerOpen) closePicker();
  closeSheet();
});

function closePicker() {
  pickerOpen = false;
  activeDye = null;
  refreshDyes();
  refreshCards();
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
  const cur = hexToHsl(targetHex());
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
    // Anything written ON the cloth has to stay legible against whatever that
    // cloth is. Oklab L is perceived lightness, so one threshold works for
    // every hue — a 0.62 madder takes bone, a 0.90 blush takes ink. Published
    // on the card so the name can use it too, which it does on a phone where
    // both sit inside the swatch.
    const onCloth = hexToOklch(hex).l > 0.62;
    el.style.setProperty('--on-cloth', onCloth ? 'rgba(47,42,37,0.78)' : 'rgba(255,253,249,0.92)');
    el.style.setProperty('--on-cloth-dim', onCloth ? 'rgba(47,42,37,0.55)' : 'rgba(255,253,249,0.68)');
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
  placePicker();
  pickHint.textContent = activeDye
    ? `turn the wheel to re-dye the ${nearestNamed(dyeHex(activeDye))[0].toLowerCase()} bands`
    : (activeSlot === 'chupa'
      ? 'turn the wheel to colour the chupa' : 'turn the wheel to colour the honju');
  // Not while it is the thing being dragged: the value written back is the
  // round-trip through hex, which lands a hair off where the thumb is and
  // fights it.
  if (document.activeElement !== lightEl) {
    lightEl.value = String(Math.round(hexToHsl(targetHex()).l * 100));
  }
  drawWheel(hexToHsl(targetHex()).l);

  refreshHarmonies();
  matchPangdenToOutfit();
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
    // THE BUG THIS FIXES: `activeDye` and `activeSlot` are separate, and this
    // handler used to set one without clearing the other. Opening the chupa
    // while a pangden dye was still active left the wheel aimed at the dye, so
    // it appeared over the apron chips and re-dyed the apron. Whichever of the
    // two you touch last owns the wheel, and the other must let go.
    const wasDye = activeDye !== null;
    activeDye = null;
    pickerOpen = (slot === activeSlot && !wasDye) ? !pickerOpen : true;
    activeSlot = slot;
    if (wasDye) refreshDyes();
    // The sheet is where the wheel appears on a phone, so it has to be the
    // cloth pane rather than whatever was last open — and the sheet has to be
    // out, since tapping a cloth is the whole way in. Tapping it again shuts
    // the wheel, and an empty sheet standing open over the room is furniture,
    // so that goes too.
    if (sheet.matches) {
      if (pickerOpen) { if (pane !== 'cloth') showPane('cloth'); openSheet(); }
      else closeSheet();
    }
    refreshCards();
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
  setTarget(hslToHex({ h, s: Math.min(1, rad / wheelMax()), l: dragL }));
  // Re-dyeing the apron does not un-choose the chupa-and-honju pairing.
  if (!activeDye) clearPalettePicks();
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
  const c = hexToHsl(targetHex());
  setTarget(hslToHex({ ...c, l: Number(lightEl.value) / 100 }));
  if (!activeDye) clearPalettePicks();
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

/**
 * Saving writes `pattern/panels.json` through a Vite middleware that only runs
 * under `vite dev`. On a static host the POST is a 404, so the button is not
 * offered there at all — a control that cannot work is worse than a missing
 * one, and this page is published now.
 */
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
if (!import.meta.env.DEV) saveBtn.remove();
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

// --- Dragging a dye along the apron ----------------------------------------
//
// Not cosmetic. The chips are the colours of the weave in the order they run up
// the cloth, so dropping one somewhere else moves that colour on her.
//
// THE DOM DOES NOT CHANGE WHILE YOU DRAG. That is the whole design, and the
// first two attempts got it wrong. They reordered the chips on every swap and
// then animated from the old layout to the new one, which meant each swap
// re-measured every chip, restarted animations that were already running, and —
// worst — rebuilt the element under the finger. Constants were tuned against
// the symptoms: a lock so swaps could not fire too often, an inset so they
// could not fire at the edges. All of it was working around a moving floor.
//
// So: measure every chip's resting place ONCE, when the drag starts. From then
// on the held chip follows the pointer, and the others are translated into the
// gaps with a plain CSS transition — the compositor does that, and it cannot
// stutter. Where the chip would land is a pure function of where the pointer is
// (the nearest resting place), so it cannot oscillate and needs no hysteresis
// and no lock. The order is committed once, on release.
const EASE = 'cubic-bezier(.22,.61,.36,1)';
/** Far enough to mean a drag rather than a shaky tap. */
const DRAG_SLOP = 6;
/** A held chip is drawn slightly larger. */
const LIFT = 1.045;
/** How long a displaced chip takes to slide out of the way. */
const SLIDE_MS = 200;

const chips = (): HTMLElement[] => Array.from(dyeHost.querySelectorAll('.dye')) as HTMLElement[];

/** Where each chip rests, measured once at the start of a drag. */
interface Resting { el: HTMLElement; left: number; top: number; cx: number; cy: number; }

let slots: Resting[] = [];
let heldIndex = -1;
let landsAt = -1;
let chipPointer = -1;
let chipFrom = { x: 0, y: 0 };
let chipDelta = { x: 0, y: 0 };
let chipDragging = false;
/** Set when a drag happened, so the click that follows does not open the wheel. */
let suppressClick = false;

const place = (el: HTMLElement, x: number, y: number) => {
  el.style.transform = `translate(${x}px, ${y}px) scale(${LIFT})`;
};

/**
 * Which resting place the pointer is nearest.
 *
 * Nearest-centre rather than "which chip am I over": it is defined everywhere,
 * including in the gaps and past the end of the row, and it depends only on the
 * pointer — so the answer never depends on what the last answer was. That is
 * what makes the shuffling impossible rather than merely unlikely.
 */
function nearestSlot(x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < slots.length; i++) {
    const dx = x - slots[i].cx;
    const dy = y - slots[i].cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Shift everything between the chip's old place and where it would land. */
function openTheGap() {
  for (let i = 0; i < slots.length; i++) {
    if (i === heldIndex) continue;
    let goesTo = i;
    if (landsAt > heldIndex && i > heldIndex && i <= landsAt) goesTo = i - 1;
    else if (landsAt < heldIndex && i >= landsAt && i < heldIndex) goesTo = i + 1;
    const dx = slots[goesTo].left - slots[i].left;
    const dy = slots[goesTo].top - slots[i].top;
    slots[i].el.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
  }
}

dyeHost.addEventListener('pointerdown', (ev) => {
  const chip = (ev.target as HTMLElement).closest('.dye') as HTMLElement | null;
  if (!chip || chip.classList.contains('ghost')) return;
  const list = chips();
  heldIndex = list.indexOf(chip);
  if (heldIndex < 0) return;
  slots = list.map((el) => {
    const b = el.getBoundingClientRect();
    return { el, left: b.left, top: b.top, cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
  });
  landsAt = heldIndex;
  chipPointer = ev.pointerId;
  chipFrom = { x: ev.clientX, y: ev.clientY };
  chipDelta = { x: 0, y: 0 };
  chipDragging = false;
});

addEventListener('pointermove', (ev) => {
  if (heldIndex < 0 || ev.pointerId !== chipPointer) return;
  chipDelta = { x: ev.clientX - chipFrom.x, y: ev.clientY - chipFrom.y };
  const held = slots[heldIndex].el;

  if (!chipDragging) {
    if (Math.hypot(chipDelta.x, chipDelta.y) < DRAG_SLOP) return;
    chipDragging = true;
    held.classList.add('lifted');
    // Throws for a pointer id the browser does not know about, and that must
    // not take the drag down with it.
    try { held.setPointerCapture(chipPointer); } catch { /* not a live pointer */ }
    // Only the others glide. The held one is placed directly, every frame.
    for (const s of slots) {
      if (s.el !== held) s.el.style.transition = `transform ${SLIDE_MS}ms ${EASE}`;
    }
  }
  ev.preventDefault();
  place(held, chipDelta.x, chipDelta.y);

  const want = nearestSlot(ev.clientX, ev.clientY);
  if (want !== landsAt) { landsAt = want; openTheGap(); }
}, { passive: false });

function endChipDrag(ev: PointerEvent) {
  if (heldIndex < 0 || ev.pointerId !== chipPointer) return;
  const held = slots[heldIndex].el;
  const from = heldIndex;
  const to = landsAt;
  const dragged = { ...chipDelta };
  const wasDragging = chipDragging;
  heldIndex = -1;
  chipPointer = -1;
  chipDragging = false;
  if (!wasDragging) { slots = []; return; }
  suppressClick = true;

  // Where it looked like it was, the instant before letting go.
  const startLeft = slots[from].left + dragged.x;
  const startTop = slots[from].top + dragged.y;

  for (const s of slots) { s.el.style.transition = ''; s.el.style.transform = ''; }
  slots = [];

  if (to !== from) {
    const rest = chips().filter((c) => c !== held);
    if (to >= rest.length) dyeHost.appendChild(held);
    else dyeHost.insertBefore(held, rest[to]);
    moveDye(from, to, false);
  }

  // Land it: from where it appeared to be, to where it now belongs.
  const now = held.getBoundingClientRect();
  const settle = held.animate(
    [
      {
        transform: `translate(${startLeft - now.left}px, ${startTop - now.top}px) scale(${LIFT})`,
      },
      { transform: 'none' },
    ],
    { duration: 240, easing: EASE },
  );
  settle.addEventListener('finish', () => {
    held.classList.remove('lifted');
    // Rebuilt once, now that there is no hand on it.
    refreshDyes();
  });
}
addEventListener('pointerup', endChipDrag);
addEventListener('pointercancel', endChipDrag);

// A drag that ends where no click follows would leave the flag armed and eat
// the next real one. The press that starts the NEXT gesture always comes after
// the click this is meant to swallow, so clearing it here makes it last exactly
// one gesture.
addEventListener('pointerdown', () => { suppressClick = false; }, true);

/** A drag is not a click: dropping a dye must not also open the wheel on it. */
addEventListener('click', (ev) => {
  if (!suppressClick) return;
  suppressClick = false;
  ev.preventDefault();
  ev.stopPropagation();
}, true);

refreshCards();
resize();
// After resize, so the weave chip has a width to be drawn at. The page opens on
// the cloth tab: the apron is the second question, not the first.
refreshPangden();
showPane('cloth');
// Laid over the hanger, let go, and left to settle.
drop();
