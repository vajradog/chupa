/**
 * Cloth-vs-body collision: project particles out to the surface, then kill the
 * normal velocity and damp the tangential.
 *
 * Position projection alone makes cloth skate around on the form forever, which
 * is what a chupa must not do — the skirt has to grip the hip and hang from it.
 * Friction is the difference between fabric on a body and fabric on ice.
 */

import type { Particles } from '@chupa/cloth';
import type { SdfGrid } from './sdf.js';
import { gradientSdf, sampleSdf } from './sdf.js';

export interface ColliderOptions {
  /**
   * Standoff from the surface, world units. Cloth sits on skin, not in it, and a
   * margin also keeps the particle out of the region where the baked gradient
   * gets mushy. Defaults to half a voxel.
   */
  margin?: number;
  /**
   * Coulomb friction coefficient. Cloth sticks on any slope shallower than
   * atan(friction) and slides on anything steeper — so 0.6 grips up to about 31
   * degrees. Not a velocity damping factor: viscous friction cannot hold cloth on
   * an incline at all, it only slows the creep, and a chupa that slowly slides off
   * its own hips over ten seconds is worse than one that never caught.
   */
  friction?: number;
}

export type Collider = (p: Particles) => void;

export function createSdfCollider(grid: SdfGrid, options: ColliderOptions = {}): Collider {
  const margin = options.margin ?? grid.cell * 0.5;
  const mu = Math.max(0, options.friction ?? 0.6);
  const n: [number, number, number] = [0, 0, 0];

  return function collide(p: Particles): void {
    const { px, py, pz, ox, oy, oz, pinned, count } = p;
    for (let i = 0; i < count; i++) {
      if (pinned[i]) continue;
      const x = px[i], y = py[i], z = pz[i];
      const d = sampleSdf(grid, x, y, z);
      if (d >= margin) continue;
      if (!gradientSdf(grid, x, y, z, n)) continue;

      const push = margin - d;
      const nx = px[i] + n[0] * push;
      const ny = py[i] + n[1] * push;
      const nz = pz[i] + n[2] * push;
      px[i] = nx; py[i] = ny; pz[i] = nz;

      // Rebuild the previous position so the contact is inelastic in the normal
      // direction (no bounce off the body) and Coulomb-limited tangentially.
      const vx = nx - ox[i];
      const vy = ny - oy[i];
      const vz = nz - oz[i];
      const vn = vx * n[0] + vy * n[1] + vz * n[2];
      let tx = vx - vn * n[0];
      let ty = vy - vn * n[1];
      let tz = vz - vn * n[2];
      const tlen = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (tlen > 1e-12) {
        // Friction can absorb at most mu * (penetration depth) of sliding — the
        // depth standing in for normal force. Below that the particle sticks
        // outright, which is what stops creep on a slope.
        const s = Math.max(0, tlen - mu * push) / tlen;
        tx *= s; ty *= s; tz *= s;
      }
      ox[i] = nx - tx;
      oy[i] = ny - ty;
      oz[i] = nz - tz;
    }
  };
}

/** Deepest penetration below the collider margin. Test instrument. */
export function maxPenetration(p: Particles, grid: SdfGrid, margin = grid.cell * 0.5): number {
  let worst = 0;
  for (let i = 0; i < p.count; i++) {
    const d = sampleSdf(grid, p.px[i], p.py[i], p.pz[i]);
    if (margin - d > worst) worst = margin - d;
  }
  return worst;
}
