/**
 * The chupa, built directly as a shell around the mannequin.
 *
 * The cut is fixed and permanent, so it is authored once here rather than sewn
 * from panels. Shapes come from Thupten's reference photographs of real Ü-Tsang
 * chupas; the numbers live in `pattern/panels.json`.
 *
 * Pieces are of two kinds:
 *   - PINNED  (bodice, shoulder panels, collar, sash, sleeves) — held exactly
 *     where they are placed and never simulated. Pinning the fitted, belted part
 *     of the garment is what keeps the whole thing inside budget.
 *   - LIVE    (skirt, crossover flap, pangden) — real cloth, colliding with the
 *     body, responding to gravity and wind.
 *
 * ONLY THE FRONT IS SHOWN. The figure does not turn, so the back of the garment
 * is closed off plainly and no effort goes into the back wrap or its ties.
 *
 * Angles: the camera looks along +Z, so the figure's front is -Z.
 *   front = -PI/2 · wearer's left (+X) = 0 · back = +PI/2 · wearer's right (-X) = PI
 */

import type { Form } from '@chupa/body';
import type { GridCloth, Particles } from '@chupa/cloth';
import { captureRestShape, createGridCloth, setParticle } from '@chupa/cloth';
import type { FlatProfile } from './flat.js';
import { buildFlatChupa } from './flat.js';
import type { GarmentSpec } from './spec.js';
import { GARMENT_SPEC } from './spec.js';

export type PieceName =
  | 'bodice'
  | 'shoulderLeft'
  | 'shoulderRight'
  | 'collarLeft'
  | 'collarRight'
  | 'sash'
  | 'skirt'
  | 'wrap'
  | 'pangden'
  | 'sleeveLeft'
  | 'sleeveRight';

/** Which colour and material control a piece. */
export type PieceGarment = 'chupa' | 'honju' | 'pangden';

export interface Piece {
  readonly name: PieceName;
  readonly cloth: GridCloth;
  /** False for pinned pieces — they are geometry, not simulation. */
  readonly live: boolean;
  readonly garment: PieceGarment;
  /** Woven strip index per column, for the pangden. Null elsewhere. */
  readonly stripOfColumn: Int16Array | null;
}

export interface Chupa {
  readonly form: Form;
  readonly spec: GarmentSpec;
  readonly pieces: readonly Piece[];
  /** Total simulated particles — the number that has to stay inside budget. */
  readonly liveParticles: number;
  readonly waistY: number;
  readonly hemY: number;
  /** Height of the garment's top edge at a given bearing. */
  topEdgeY(theta: number): number;
}

const FRONT = -Math.PI / 2;

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Shortest signed angular difference, in (-PI, PI]. */
function angDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Body semi-axes at an arbitrary height, interpolated between measured rings. */
function ringAt(form: Form, y: number): { rx: number; rz: number } {
  const rings = form.rings;
  if (y <= rings[0].y) return { rx: rings[0].rx, rz: rings[0].rz };
  const last = rings[rings.length - 1];
  if (y >= last.y) return { rx: last.rx, rz: last.rz };
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    if (y <= b.y) {
      const e = smoothstep((y - a.y) / (b.y - a.y));
      return { rx: a.rx + (b.rx - a.rx) * e, rz: a.rz + (b.rz - a.rz) * e };
    }
  }
  return { rx: last.rx, rz: last.rz };
}

function ellipsePerimeter(rx: number, rz: number): number {
  return Math.PI * (3 * (rx + rz) - Math.sqrt((3 * rx + rz) * (rx + 3 * rz)));
}

/** Point on the body's surface at a bearing and height, pushed out by `ease`. */
function surfacePoint(form: Form, theta: number, y: number, ease: number): [number, number, number] {
  const r = ringAt(form, y);
  return [Math.cos(theta) * (r.rx + ease), y, Math.sin(theta) * (r.rz + ease)];
}

// ---------------------------------------------------------------------------
// Piece builders
// ---------------------------------------------------------------------------

/**
 * The bodice: a closed tube whose TOP EDGE varies with bearing. That one varying
 * edge is the whole neckline — a deep V at the front, broad low armholes at the
 * sides, a high back — and it is why no pattern pieces are needed to get the
 * recognisable shape.
 */
function buildBodice(
  ringAtY: (y: number) => { rx: number; rz: number },
  segments: number,
  rows: number,
  waistY: number,
  topEdgeY: (theta: number) => number,
): GridCloth {
  const cloth = createGridCloth({
    cols: segments, rows, spacing: 1, closed: true, pinTopRow: false, seedWave: 0,
  });
  const p = cloth.particles;
  for (let c = 0; c < segments; c++) {
    const th = -Math.PI + (c / segments) * Math.PI * 2;
    const top = topEdgeY(th);
    for (let r = 0; r < rows; r++) {
      const y = top + (waistY - top) * (r / (rows - 1));
      const ring = ringAtY(y);
      const i = r * segments + c;
      setParticle(p, i, Math.cos(th) * ring.rx, y, Math.sin(th) * ring.rz);
      p.pinned[i] = 1;
    }
  }
  return cloth;
}

/**
 * A shoulder panel: the broad yoke that carries the chupa over the shoulder from
 * the front edge to the back edge. The photographs show a wide panel covering
 * the shoulder from neck to arm, not a narrow strap.
 */
function buildShoulderPanel(
  form: Form,
  side: 1 | -1,
  shoulderY: number,
  innerHalf: number,
  outerHalf: number,
  frontY: number,
  backY: number,
  ease: number,
): GridCloth {
  const cols = 6;
  const rows = 14;
  const cloth = createGridCloth({ cols, rows, spacing: 1, pinTopRow: false, seedWave: 0 });
  const p = cloth.particles;
  const ring = ringAt(form, shoulderY);
  for (let c = 0; c < cols; c++) {
    const w = c / (cols - 1);
    const x = side * (innerHalf + (outerHalf - innerHalf) * w);
    // Half-depth of the body's ellipse at this x — how far front to back the
    // shoulder actually is here.
    const inside = Math.max(0, 1 - (x / (ring.rx + ease)) ** 2);
    const zHalf = (ring.rz + ease) * Math.sqrt(inside);
    for (let r = 0; r < rows; r++) {
      const s = r / (rows - 1);
      const drop = s < 0.5 ? shoulderY - frontY : shoulderY - backY;
      const y = shoulderY - (1 - Math.sin(Math.PI * s)) * drop;
      const z = -zHalf + 2 * zHalf * s;
      const i = r * cols + c;
      setParticle(p, i, x, y + ease * 0.5, z);
      p.pinned[i] = 1;
    }
  }
  return cloth;
}

/**
 * One arm of the honju's shawl collar: a wide band running from the neck at the
 * shoulder down to the point of the V, lying over the chupa. In the photographs
 * this is the single most recognisable feature of the outfit — a broad band in
 * the honju's own colour framing the chupa's V — and it reads at any distance.
 */
function buildCollarBand(
  form: Form,
  fromPhi: number,
  toPhi: number,
  edgeY: (phi: number) => number,
  width: number,
  ease: number,
): GridCloth {
  const cols = 5;
  const rows = 20;
  const cloth = createGridCloth({ cols, rows, spacing: 1, pinTopRow: false, seedWave: 0 });
  const p = cloth.particles;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const phi = fromPhi + (toPhi - fromPhi) * t;
    const centre = edgeY(phi);
    for (let c = 0; c < cols; c++) {
      // Straddle the edge: half the band stands above it against the neck, half
      // lies down over the chupa. That is what folding out means.
      const u = c / (cols - 1) - 0.5;
      const [x, , z] = surfacePoint(form, FRONT + phi, centre + u * width, ease);
      const i = r * cols + c;
      setParticle(p, i, x, centre + u * width, z);
      p.pinned[i] = 1;
    }
  }
  return cloth;
}

/**
 * The wrap panel: the wearer's left front, laid over the right.
 *
 * This is the front of the garment. Its top edge is the long diagonal that runs
 * from the strap on one shoulder, down through the point of the V at the centre,
 * and on across to the opposite side seam at the sash. The panel underneath —
 * the bodice tube — carries the mirrored edge, so what you see is the two of them
 * crossing: a steep short edge from one shoulder to the V, and a long shallow one
 * continuing away to the other hip.
 *
 * It is pinned. Nothing above the sash moves.
 */
function buildWrap(
  form: Form,
  segments: number,
  rows: number,
  waistY: number,
  ease: number,
  edgeY: (phi: number) => number,
): GridCloth {
  const cloth = createGridCloth({
    cols: segments, rows, spacing: 1, pinTopRow: false, seedWave: 0,
  });
  const p = cloth.particles;
  for (let c = 0; c < segments; c++) {
    // Right round the front, from one side seam to the other.
    const phi = -Math.PI / 2 + (c / (segments - 1)) * Math.PI;
    const top = edgeY(phi);
    for (let r = 0; r < rows; r++) {
      const y = top + (waistY - top) * (r / (rows - 1));
      const [x, , z] = surfacePoint(form, FRONT + phi, y, ease);
      const i = r * segments + c;
      setParticle(p, i, x, y, z);
      p.pinned[i] = 1;
    }
  }
  captureRestShape(cloth);
  return cloth;
}

/** The sash at the waist, in the chupa's own fabric. */
function buildSash(
  form: Form,
  segments: number,
  waistY: number,
  width: number,
  ease: number,
): GridCloth {
  const rows = 5;
  const cloth = createGridCloth({
    cols: segments, rows, spacing: 1, closed: true, pinTopRow: false, seedWave: 0,
  });
  const p = cloth.particles;
  for (let r = 0; r < rows; r++) {
    const y = waistY + width / 2 - width * (r / (rows - 1));
    for (let c = 0; c < segments; c++) {
      const th = -Math.PI + (c / segments) * Math.PI * 2;
      const [x, , z] = surfacePoint(form, th, y, ease);
      const i = r * segments + c;
      setParticle(p, i, x, y, z);
      p.pinned[i] = 1;
    }
  }
  return cloth;
}

/**
 * The skirt: an A-line cone. It leaves the waist at the body's own width and
 * opens steadily to `hemFlare` times that at the hem, on straight side edges.
 *
 * This is the shape traditional rectilinear tailoring produces: rectangles with
 * triangular gores let into the side seams. It is not a gathered skirt (surplus
 * fabric bunched at the waist) and not a straight column — those were the first
 * two builds, and the reference garment is neither. The flare is *cut in*, so
 * the cloth is smooth at the waist and still swings wide at the hem.
 *
 * A cone is not a shape a uniform lattice can hold, so this authors the cone and
 * `captureRestShape` makes it the cloth's zero-energy state.
 */
function buildSkirt(
  ringAtY: (y: number) => { rx: number; rz: number },
  segments: number,
  rows: number,
  waistY: number,
  hemY: number,
  gather: number,
): GridCloth {
  const cloth = createGridCloth({
    cols: segments, rows, spacing: 1, closed: true, pinTopRow: false, seedWave: 0,
  });
  const p = cloth.particles;
  // Radii come straight off the elevation, which has already solved how this
  // cloth hangs — the cone, the break over the seat, all of it. Recomputing any
  // of that here is how the shell and the drawing came apart.
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = waistY + (hemY - waistY) * t;
    const { rx, rz } = ringAtY(y);
    for (let c = 0; c < segments; c++) {
      const th = -Math.PI + (c / segments) * Math.PI * 2;
      const i = r * segments + c;
      setParticle(p, i, Math.cos(th) * rx, y, Math.sin(th) * rz);
      p.pinned[i] = r === 0 ? 1 : 0;
    }
  }
  // Slack is the gather, kept separate from the cut: at 1.0 the skirt is smooth
  // brocade, above it the same cone carries surplus and gravity pleats it.
  captureRestShape(cloth, gather);
  return cloth;
}

/** A panel hanging at the front from the waist: the crossover flap and the pangden. */
function buildFrontPanel(
  form: Form,
  opts: {
    cols: number; rows: number; topY: number; width: number; height: number;
    standoff: number; centreAngle: number;
  },
): GridCloth {
  const cloth = createGridCloth({
    cols: opts.cols, rows: opts.rows, spacing: 1, pinTopRow: true, seedWave: 0,
  });
  const p = cloth.particles;
  const body = ringAt(form, opts.topY);
  const arc = opts.width / Math.max(body.rx, 1e-3);
  for (let r = 0; r < opts.rows; r++) {
    const y = opts.topY - (opts.height * r) / Math.max(1, opts.rows - 1);
    const ring = ringAt(form, y);
    for (let c = 0; c < opts.cols; c++) {
      const f = opts.cols === 1 ? 0.5 : c / (opts.cols - 1);
      const th = opts.centreAngle + (f - 0.5) * arc;
      setParticle(
        p, r * opts.cols + c,
        Math.cos(th) * (ring.rx + opts.standoff),
        y,
        Math.sin(th) * (ring.rz + opts.standoff),
      );
    }
  }
  // The panel is authored curved around the body, not flat — that curve is its cut.
  captureRestShape(cloth);
  return cloth;
}

/** A tapered tube around a limb axis — the honju sleeve. */
function buildSleeve(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  rTop: number,
  rBottom: number,
  segments: number,
  rows: number,
): GridCloth {
  const cloth = createGridCloth({
    cols: segments, rows, spacing: 1, closed: true, pinTopRow: false, seedWave: 0,
  });
  const p = cloth.particles;
  let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  dx /= len; dy /= len; dz /= len;
  const helper = Math.abs(dy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let ux = helper[1] * dz - helper[2] * dy;
  let uy = helper[2] * dx - helper[0] * dz;
  let uz = helper[0] * dy - helper[1] * dx;
  const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy;
  const vy = dz * ux - dx * uz;
  const vz = dx * uy - dy * ux;

  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const rad = rTop + (rBottom - rTop) * t;
    const cx = a[0] + dx * len * t;
    const cy = a[1] + dy * len * t;
    const cz = a[2] + dz * len * t;
    for (let c = 0; c < segments; c++) {
      const th = (c / segments) * Math.PI * 2;
      const ca = Math.cos(th) * rad;
      const sa = Math.sin(th) * rad;
      const i = r * segments + c;
      setParticle(p, i, cx + ux * ca + vx * sa, cy + uy * ca + vy * sa, cz + uz * ca + vz * sa);
      p.pinned[i] = 1;
    }
  }
  return cloth;
}

// ---------------------------------------------------------------------------

export interface ChupaOptions {
  spec?: GarmentSpec;
  /** Include the pangden. Traditionally worn by married women. */
  pangden?: boolean;
}

export function buildChupa(form: Form, options: ChupaOptions = {}): Chupa {
  const spec = options.spec ?? GARMENT_SPEC;
  const cm = form.scale; // cm -> world units
  const { chupa: c, honju: h, pangden: pg } = spec;

  /**
   * THE SHELL IS THE ELEVATION, WRAPPED. Every width and every edge height comes
   * out of `buildFlatChupa` — the same drawing that gets approved on /dev/flat/.
   *
   * It used to describe the garment a second time here, and that is exactly how
   * the two drifted: a correction would be made to the drawing and then made
   * again, differently, to the shell. There is one description now.
   */
  const flat: FlatProfile = buildFlatChupa(form, spec).profile;
  /** Elevation half-width (cm) as a world-unit radius pair on the body's ellipse. */
  const shellRing = (y: number): { rx: number; rz: number } => {
    const rx = flat.halfAt(y / cm) * cm;
    const body = ringAt(form, y);
    // The elevation only knows width. Depth follows the body's own proportion at
    // that height, which is what keeps her a person and not a cylinder.
    const depth = body.rx > 1e-6 ? body.rz / body.rx : 0.8;
    return { rx, rz: rx * depth };
  };

  const waistY = form.levelOf('waist');
  const hemY = c.hemFromFloor * cm;
  const shoulderY = form.levelOf('shoulder');

  const vNeckY = shoulderY - c.vNeckDrop * cm;
  const backNeckY = shoulderY - c.backNeckDrop * cm;
  // A deep enough armhole would drop the underarm below the belt, leaving no
  // bodice between the two and inverting every piece built off that pair.
  const armholeY = Math.max(shoulderY - c.armholeDrop * cm, waistY + 0.5);
  const shoulderEdgeY = shoulderY - 1.5 * cm;
  const bodiceEase = c.bodiceEase * cm;

  /** Where along the front quarter the shoulder panel attaches. */
  const SHOULDER_AT = 0.55;

  /**
   * The armhole/back profile — everything the wrap edges do not decide. High at
   * the back, dipping into the armhole at the sides.
   */
  function baseTopEdgeY(theta: number): number {
    const t = Math.abs(angDiff(theta, FRONT)) / Math.PI; // 0 front, 0.5 side, 1 back
    if (t <= 0.5) {
      const u = t / 0.5;
      if (u <= SHOULDER_AT) {
        return shoulderEdgeY;
      }
      return shoulderEdgeY
        + (armholeY - shoulderEdgeY) * smoothstep((u - SHOULDER_AT) / (1 - SHOULDER_AT));
    }
    return armholeY + (backNeckY - armholeY) * smoothstep((t - 0.5) / 0.5);
  }

  /**
   * One wrap edge — READ OFF THE ELEVATION, not redescribed here.
   *
   * A bearing is turned into a horizontal position on the body, and the drawing
   * says how high the fold is there. Every property of that curve — where it
   * crosses centre front, how much it sags, where it dies out — lives in one
   * place. This used to be three hand-placed points that had to be corrected in
   * step with the drawing, and twice were not.
   */
  const STRAP_PHI = SHOULDER_AT * (Math.PI / 2);
  function wrapEdgeY(phi: number, side: 1 | -1): number {
    const theta = FRONT + phi;
    const y = Math.abs(phi) < 0.5 ? vNeckY : waistY;
    const r = ringAt(form, y);
    return flat.foldYAt((Math.cos(theta) * (r.rx + bodiceEase)) / cm, side) * cm;
  }

  /**
   * The bodice tube's own top edge: the armhole profile, cut down by the
   * underneath wrap edge across the front. Where the over panel covers it the
   * cut goes deep and is never seen; that is what being underneath means.
   */
  function topEdgeY(theta: number): number {
    const base = baseTopEdgeY(theta);
    const phi = angDiff(theta, FRONT);
    if (Math.abs(phi) > Math.PI / 2) return base;
    return Math.min(base, wrapEdgeY(phi, -1));
  }

  const waistRing = ringAt(form, waistY);
  const waistPerimeter = ellipsePerimeter(waistRing.rx, waistRing.rz);
  const bodySegments = Math.max(28, Math.round(waistPerimeter));
  // Segment count is resolution now, not silhouette — the gather moved to rest
  // slack and the flare to the cut. Split the difference between waist and hem
  // so neither end is coarse.
  const skirtSegments = Math.max(
    28, Math.round(waistPerimeter * (1 + c.hemFlare) / 2),
  );
  const skirtRows = Math.max(10, Math.round(waistY - hemY));

  const pieces: Piece[] = [];
  const add = (
    name: PieceName, cloth: GridCloth, live: boolean, garment: PieceGarment,
    stripOfColumn: Int16Array | null = null,
  ) => pieces.push({ name, cloth, live, garment, stripOfColumn });

  // --- Bodice, shoulders, collar, sash: all pinned.
  add('bodice', buildBodice(
    shellRing, bodySegments, Math.max(6, Math.round(shoulderY - waistY)),
    waistY, topEdgeY,
  ), false, 'chupa');

  const neckHalf = (c.necklineWidth / 2) * cm;
  const shoulderOuter = neckHalf + c.shoulderPanelWidth * cm;
  const attachTheta = SHOULDER_AT * (Math.PI / 2);
  for (const [name, side] of [['shoulderLeft', 1], ['shoulderRight', -1]] as const) {
    // Off the BASE edge, not the wrap-cut one: on the side the over panel covers,
    // the bodice's own edge is cut away to the sash, and a shoulder panel built
    // off that hung down as a slab past the armhole.
    add(name, buildShoulderPanel(
      form, side, shoulderY, neckHalf, shoulderOuter,
      baseTopEdgeY(FRONT + side * attachTheta),
      baseTopEdgeY(FRONT + side * attachTheta + Math.PI),
      bodiceEase,
    ), false, 'chupa');
  }

  // The shawl collar rides the two wrap edges, and the two are NOT mirror
  // images. The under side stops at the V, because past that it is beneath the
  // other panel. The over side turns at the V and runs on almost horizontally,
  // under the bust and out to the last rib at the side seam. Stopping it at the
  // V makes a symmetric V, which is exactly what the reference garment avoids.
  const collarEase = bodiceEase + 0.6;
  add('collarLeft', buildCollarBand(
    form, STRAP_PHI, -0.92 * (Math.PI / 2), (phi) => wrapEdgeY(phi, 1),
    h.collarWidth * cm, collarEase,
  ), false, 'honju');
  add('collarRight', buildCollarBand(
    form, -STRAP_PHI, 0, (phi) => wrapEdgeY(phi, -1),
    h.collarWidth * cm, collarEase,
  ), false, 'honju');

  add('sash', buildSash(
    form, bodySegments, waistY, c.sashWidth * cm, bodiceEase + 0.25,
  ), false, 'chupa');

  // --- Skirt: live, and an A-line.
  add('skirt', buildSkirt(
    shellRing, skirtSegments, skirtRows, waistY, hemY, c.waistGatherRatio,
  ), true, 'chupa');

  // --- The wrap: the wearer's left front laid over the right. Pinned, like the
  // rest of the bodice, and drawn proud of it so the crossing edge reads.
  add('wrap', buildWrap(
    form, bodySegments, Math.max(8, Math.round(shoulderY - waistY)),
    waistY, bodiceEase + 0.3,
    (phi) => Math.min(baseTopEdgeY(FRONT + phi), wrapEdgeY(phi, 1)),
  ), false, 'chupa');

  // --- Pangden: front only, woven as narrow vertical strips.
  if (options.pangden !== false) {
    const cols = Math.max(pg.strips * 3, Math.round(pg.width * cm));
    const stripOfColumn = new Int16Array(cols);
    for (let i = 0; i < cols; i++) {
      stripOfColumn[i] = Math.min(pg.strips - 1, Math.floor((i / cols) * pg.strips));
    }
    add('pangden', buildFrontPanel(form, {
      cols,
      rows: Math.max(10, Math.round(pg.length * cm)),
      topY: waistY,
      width: pg.width * cm,
      height: pg.length * cm,
      standoff: (c.skirtEase + 3.5) * cm,
      centreAngle: FRONT,
    }), true, 'pangden', stripOfColumn);
  }

  // --- Honju sleeves: the only sleeves in the design.
  for (const limb of form.limbs) {
    if (limb.name !== 'armLeft' && limb.name !== 'armRight') continue;
    const ease = h.sleeveEase * cm;
    add(
      limb.name === 'armLeft' ? 'sleeveLeft' : 'sleeveRight',
      buildSleeve(
        limb.a, limb.b,
        limb.r1 + ease,
        Math.max(limb.r2 + ease * 0.6, (h.cuffCircumference / (2 * Math.PI)) * cm),
        16, Math.max(8, Math.round(h.sleeveLength * cm)),
      ),
      false, 'honju',
    );
  }

  // Every piece is authored geometry, so every piece's authored pose is its rest
  // pose — including the pinned ones, so `resetGridCloth` puts the garment back
  // rather than collapsing it to a flat sheet at the origin.
  for (const piece of pieces) if (!piece.cloth.rest) captureRestShape(piece.cloth);

  let liveParticles = 0;
  for (const piece of pieces) if (piece.live) liveParticles += piece.cloth.particles.count;

  return { form, spec, pieces, liveParticles, waistY, hemY, topEdgeY };
}

/** Total particles across every piece, simulated or not. */
export function totalParticles(chupa: Chupa): number {
  let n = 0;
  for (const p of chupa.pieces) n += p.cloth.particles.count;
  return n;
}

/** Look up a piece by name. */
export function pieceNamed(chupa: Chupa, name: PieceName): Piece {
  const p = chupa.pieces.find((x) => x.name === name);
  if (!p) throw new Error(`no garment piece named "${name}"`);
  return p;
}

/** Every particle of a pinned piece stays put; used by tests and the renderer. */
export function isFullyPinned(p: Particles): boolean {
  for (let i = 0; i < p.count; i++) if (!p.pinned[i]) return false;
  return true;
}
