/**
 * A collider shaped like the skirt.
 *
 * The solver has no cloth-vs-cloth collision, so the pangden and the crossover
 * flap would otherwise sink straight through the skirt they are supposed to hang
 * in front of. Rather than pay for general self-collision — which the fixed
 * silhouette does not need — the skirt's own rest surface is handed to the front
 * panels as something solid to ride on.
 *
 * The silhouette is re-read from the skirt's live particles on every call, not
 * baked once at rest: a settling skirt swings well outside the shape it was
 * built at, and panels riding the rest shape simply disappear behind it. The
 * approximation that remains is that the skirt is treated as a surface of
 * revolution — one radius per height — so a pleat that opens on one side lifts
 * the panel everywhere at that height. At these standoffs it is not visible.
 */

import type { Particles } from '@chupa/cloth';
import type { Chupa } from './chupa.js';

export interface SkirtColliderOptions {
  /** Clearance held outside the skirt surface, world units. */
  margin?: number;
  /**
   * Fraction of the correction applied per substep, 0..1. Pushing all the way out
   * in one step moves a deep particle much further than its neighbours and tears
   * a visible spike in the panel; easing it out lets the distance constraints
   * carry the neighbours along.
   */
  relax?: number;
}

export type Collide = (p: Particles) => void;

export function createSkirtCollider(chupa: Chupa, options: SkirtColliderOptions = {}): Collide {
  const margin = options.margin ?? 0.6;
  const relax = Math.min(1, Math.max(0.05, options.relax ?? 0.45));
  const skirt = chupa.pieces.find((p) => p.name === 'skirt');
  if (!skirt) return () => {};

  const { cols, rows } = skirt.cloth;
  const q = skirt.cloth.particles;
  const ys = new Float64Array(rows);
  const rxs = new Float64Array(rows);
  const rzs = new Float64Array(rows);

  /** Re-read the skirt's current silhouette: one radius per row. */
  function sampleSkirt(): void {
    for (let r = 0; r < rows; r++) {
      let rx = 0;
      let rz = 0;
      let ySum = 0;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        rx = Math.max(rx, Math.abs(q.px[i]));
        rz = Math.max(rz, Math.abs(q.pz[i]));
        ySum += q.py[i];
      }
      ys[r] = ySum / cols;
      rxs[r] = rx;
      rzs[r] = rz;
    }
  }

  return function collide(p: Particles): void {
    sampleSkirt();
    // Rows run waist to hem, so ys descends.
    const yTop = ys[0];
    const yBottom = ys[rows - 1];
    if (!(yTop > yBottom)) return;

    for (let i = 0; i < p.count; i++) {
      if (p.pinned[i]) continue;
      const y = p.py[i];
      if (y > yTop || y < yBottom) continue;
      // Locate the row band containing y.
      const f = ((yTop - y) / (yTop - yBottom)) * (rows - 1);
      const r0 = Math.min(rows - 2, Math.max(0, Math.floor(f)));
      const t = f - r0;
      const rx = (rxs[r0] + (rxs[r0 + 1] - rxs[r0]) * t) + margin;
      const rz = (rzs[r0] + (rzs[r0 + 1] - rzs[r0]) * t) + margin;

      const u = p.px[i] / rx;
      const v = p.pz[i] / rz;
      const d = Math.sqrt(u * u + v * v);
      if (d >= 1 || d < 1e-9) continue;

      // Push out along the ellipse's radial direction and cancel the inward
      // motion, so the panel rests against the skirt instead of oscillating.
      const s = 1 + (1 / d - 1) * relax;
      const nx = p.px[i] * (s - 1);
      const nz = p.pz[i] * (s - 1);
      p.px[i] += nx;
      p.pz[i] += nz;
      const vx = p.px[i] - p.ox[i];
      const vz = p.pz[i] - p.oz[i];
      const len = Math.sqrt(u * u + v * v) || 1;
      const ndx = u / len;
      const ndz = v / len;
      const vn = vx * ndx + vz * ndz;
      if (vn < 0) {
        p.ox[i] = p.px[i] - (vx - vn * ndx);
        p.oz[i] = p.pz[i] - (vz - vn * ndz);
      }
    }
  };
}

/** Run several colliders in order. */
export function composeColliders(...colliders: Collide[]): Collide {
  return (p: Particles) => {
    for (const c of colliders) c(p);
  };
}
