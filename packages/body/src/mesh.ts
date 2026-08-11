/**
 * A triangle mesh of the figure, for looking at it. The solver never touches
 * this — collision runs entirely off the SDF — so this exists purely so a human
 * can tell whether the mannequin looks like a woman.
 *
 * Normals come from the analytic SDF gradient rather than from face averaging,
 * which keeps the limb blends smooth exactly where a faceted union would show.
 */

import type { Form } from './form.js';

export interface FormMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint16Array;
}

export interface MeshOptions {
  /** Radial segments around the lathe. */
  segments?: number;
  /** Extra interpolated rings between measured levels. */
  subdivisions?: number;
}

function gradient(form: Form, x: number, y: number, z: number, h: number): [number, number, number] {
  const gx = form.sdf(x + h, y, z) - form.sdf(x - h, y, z);
  const gy = form.sdf(x, y + h, z) - form.sdf(x, y - h, z);
  const gz = form.sdf(x, y, z + h) - form.sdf(x, y, z - h);
  const len = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
  return [gx / len, gy / len, gz / len];
}

interface Part {
  /** Ring centres and radii in world space, plus the frame each ring lies in. */
  rings: { cx: number; cy: number; cz: number; ux: number; uy: number; uz: number; vx: number; vy: number; vz: number; rx: number; rz: number }[];
  /** Close the ends with a pole vertex rather than leaving a hole. */
  capStart: [number, number, number] | null;
  capEnd: [number, number, number] | null;
}

/** Round-cone limb as an oriented tube with hemispherical end caps. */
function limbPart(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  r1: number,
  r2: number,
  steps: number,
): Part {
  let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  dx /= len; dy /= len; dz /= len;
  // Any vector not parallel to the axis will do to start the frame.
  const helper = Math.abs(dy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let ux = helper[1] * dz - helper[2] * dy;
  let uy = helper[2] * dx - helper[0] * dz;
  let uz = helper[0] * dy - helper[1] * dx;
  const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy;
  const vy = dz * ux - dx * uz;
  const vz = dx * uy - dy * ux;

  const rings: Part['rings'] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const r = r1 + (r2 - r1) * t;
    rings.push({
      cx: a[0] + dx * len * t,
      cy: a[1] + dy * len * t,
      cz: a[2] + dz * len * t,
      ux, uy, uz, vx, vy, vz,
      rx: r, rz: r,
    });
  }
  return {
    rings,
    capStart: [a[0] - dx * r1, a[1] - dy * r1, a[2] - dz * r1],
    capEnd: [b[0] + dx * r2, b[1] + dy * r2, b[2] + dz * r2],
  };
}

/**
 * Lathe the torso rings into a tube, then add the arms and neck as oriented
 * round-cone tubes. The cloth feels all of this through the SDF regardless — the
 * limbs are meshed here so a human can see whether the figure reads as a woman,
 * and so the honju sleeves have something visible to hang against.
 */
export function buildFormMesh(form: Form, options: MeshOptions = {}): FormMesh {
  const segments = options.segments ?? 48;
  const sub = options.subdivisions ?? 4;
  const rings = form.rings;

  const levels: { y: number; rx: number; rz: number }[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    const steps = i === rings.length - 2 ? sub : sub;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // Smoothstep between measured levels: a body does not change radius in
      // straight lines, and linear rings read as a stack of cones.
      const e = t * t * (3 - 2 * t);
      levels.push({
        y: a.y + (b.y - a.y) * t,
        rx: a.rx + (b.rx - a.rx) * e,
        rz: a.rz + (b.rz - a.rz) * e,
      });
    }
  }
  levels.push({ y: rings[rings.length - 1].y, rx: rings[rings.length - 1].rx, rz: rings[rings.length - 1].rz });

  // The torso is a lathe: its rings sit in the world XZ plane.
  const torso: Part = {
    rings: levels.map((lv) => ({
      cx: 0, cy: lv.y, cz: 0,
      ux: 1, uy: 0, uz: 0,
      vx: 0, vy: 0, vz: 1,
      rx: lv.rx, rz: lv.rz,
    })),
    capStart: null,
    capEnd: null,
  };

  const limbSteps = Math.max(4, Math.round(sub * 2));
  const parts: Part[] = [
    torso,
    ...form.limbs.map((l) => limbPart(l.a, l.b, l.r1, l.r2, limbSteps)),
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const h = form.blend * 0.25 || 0.05;

  const pushVertex = (x: number, y: number, z: number): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    const n = gradient(form, x, y, z, h);
    normals.push(n[0], n[1], n[2]);
    return index;
  };

  for (const part of parts) {
    const base = positions.length / 3;
    const rowCount = part.rings.length;
    for (const ring of part.rings) {
      for (let c = 0; c < segments; c++) {
        const th = (c / segments) * Math.PI * 2;
        const ca = Math.cos(th) * ring.rx;
        const sa = Math.sin(th) * ring.rz;
        pushVertex(
          ring.cx + ring.ux * ca + ring.vx * sa,
          ring.cy + ring.uy * ca + ring.vy * sa,
          ring.cz + ring.uz * ca + ring.vz * sa,
        );
      }
    }
    for (let r = 0; r < rowCount - 1; r++) {
      for (let c = 0; c < segments; c++) {
        const c2 = (c + 1) % segments;
        const a = base + r * segments + c;
        const b = base + r * segments + c2;
        const d = base + (r + 1) * segments + c;
        const e = base + (r + 1) * segments + c2;
        indices.push(a, d, e, a, e, b);
      }
    }
    if (part.capStart) {
      const pole = pushVertex(part.capStart[0], part.capStart[1], part.capStart[2]);
      for (let c = 0; c < segments; c++) {
        indices.push(pole, base + ((c + 1) % segments), base + c);
      }
    }
    if (part.capEnd) {
      const pole = pushVertex(part.capEnd[0], part.capEnd[1], part.capEnd[2]);
      const last = base + (rowCount - 1) * segments;
      for (let c = 0; c < segments; c++) {
        indices.push(pole, last + c, last + ((c + 1) % segments));
      }
    }
  }

  if (positions.length / 3 > 65535) {
    throw new Error('form mesh exceeds a 16-bit index buffer; lower segments or subdivisions');
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

/** Line segments tracing each limb's axis, for a dev overlay. */
export function limbAxes(form: Form): Float32Array {
  const out = new Float32Array(form.limbs.length * 6);
  form.limbs.forEach((l, i) => {
    out[i * 6] = l.a[0]; out[i * 6 + 1] = l.a[1]; out[i * 6 + 2] = l.a[2];
    out[i * 6 + 3] = l.b[0]; out[i * 6 + 4] = l.b[1]; out[i * 6 + 5] = l.b[2];
  });
  return out;
}
