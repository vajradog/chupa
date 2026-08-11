/**
 * The skirt's silhouette is solved, not authored — a length of cloth pinned at
 * the sash, pulled down, resisting the fold over the seat by its own stiffness.
 * These check the solve says what cloth says.
 */

import { describe, expect, it } from 'vitest';
import { buildForm } from '@chupa/body';
import { FABRICS } from '@chupa/cloth';
import { solveHang } from '@chupa/garment';

const form = buildForm();
const m = form.measurements;

const bodyHalfAt = (y: number) => {
  const rings = form.rings;
  const yy = y * form.scale;
  for (let i = 0; i < rings.length - 1; i++) {
    if (yy <= rings[i + 1].y) {
      const t = (yy - rings[i].y) / (rings[i + 1].y - rings[i].y);
      return (rings[i].rx + (rings[i + 1].rx - rings[i].rx) * t) / form.scale;
    }
  }
  return 0;
};

const hangOf = (key: string) => solveHang(FABRICS[key], {
  topY: m.floorToWaist - 2,
  topHalf: 14,
  hemY: 8,
  hemHalf: 14 * 1.5,
  bodyHalfAt,
  ease: 2,
});

describe('how the skirt hangs', () => {
  it('never lets the cloth inside the body', () => {
    for (const key of ['georgette', 'silk', 'wool', 'melton']) {
      const h = hangOf(key);
      for (const [x, y] of h.points) {
        if (y < 10) continue;
        expect(x).toBeGreaterThan(0);
      }
    }
  });

  it('stays between the body and the cut, whatever the cloth', () => {
    // The two hard bounds: cloth cannot pass through her, and cannot stretch
    // wider than the pattern it was cut to.
    //
    // NOT an ordering claim about fabrics. An earlier version asserted that
    // georgette hangs closer in than melton, and it does not — at this length
    // the two settle within a millimetre of each other and the sign flips with
    // the damping. The model does not resolve fabric weight at this scale, and
    // pretending otherwise in a test would have hidden that.
    for (const key of ['georgette', 'silk', 'wool', 'melton']) {
      const h = hangOf(key);
      for (const [x, y] of h.points) {
        expect(x).toBeGreaterThan(0);
        // The ceiling is the cut OR the body, whichever is wider — the body can
        // legitimately push the cloth out past the pattern over the seat.
        const t = Math.max(0, Math.min(1, (m.floorToWaist - 2 - y) / (m.floorToWaist - 10)));
        const cut = 14 + (14 * 1.5 - 14) * t;
        const body = bodyHalfAt(y) + 2;
        expect(x).toBeLessThanOrEqual(Math.max(cut, body) + 0.01);
      }
    }
  });

  it('settles — running it longer does not move the answer', () => {
    // The claim is that the solve reaches REST, not that some step count happens
    // to look settled. Giving it twice the budget must produce the same skirt.
    // Fixed counts were the bug this replaces: at 400 steps georgette was still
    // swinging outward and read as stiffer than melton.
    for (const key of ['georgette', 'silk', 'wool']) {
      const base = { topY: 97, topHalf: 14, hemY: 8, hemHalf: 21,
        bodyHalfAt: () => 0, ease: 0 };
      const a = solveHang(FABRICS[key], base);
      const b = solveHang(FABRICS[key], { ...base, steps: 12000 });
      const aHem = a.points[a.points.length - 1];
      const bHem = b.points[b.points.length - 1];
      expect(Math.hypot(aHem[0] - bHem[0], aHem[1] - bHem[1])).toBeLessThan(0.25);
    }
  });

  it('hangs from the sash and reaches the hem', () => {
    const h = hangOf('cotton');
    expect(h.points[0][1]).toBeCloseTo(m.floorToWaist - 2, 6);
    expect(h.points[h.points.length - 1][1]).toBeLessThan(30);
  });
});
