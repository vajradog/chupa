/**
 * Colour matching. These exist because the suggestions were wrong in a way that
 * only showed on one kind of input — a grey chupa produced nothing but greys —
 * and nothing in the app would have caught it.
 */

import { describe, expect, it } from 'vitest';
import {
  NAMED_COLOURS, NEUTRAL_SATURATION, harmoniesFor, hexToHsl, hslToHex,
  hexToOklch, oklchToHex, nearestNamed,
} from '@chupa/garment';

const SAMPLES = [
  '#9e2124', '#27406f', '#2e5c39', '#d4941f', '#5b2c6f', '#128f8b',
  '#f3efe6', '#22242a', '#8f8f8f', '#4a4a68', '#c3384b', '#a0d8ef',
];

describe('hsl round trip', () => {
  it('survives a round trip within a rounding step', () => {
    for (const hex of SAMPLES) {
      const back = hslToHex(hexToHsl(hex));
      for (let i = 1; i < 7; i += 2) {
        const a = parseInt(hex.slice(i, i + 2), 16);
        const b = parseInt(back.slice(i, i + 2), 16);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('normalises hues past the end of the wheel', () => {
    expect(hslToHex({ h: 380, s: 0.5, l: 0.5 })).toBe(hslToHex({ h: 20, s: 0.5, l: 0.5 }));
    expect(hslToHex({ h: -40, s: 0.5, l: 0.5 })).toBe(hslToHex({ h: 320, s: 0.5, l: 0.5 }));
  });
});

describe('oklch round trip', () => {
  it('survives a round trip within a rounding step', () => {
    for (const hex of SAMPLES) {
      const back = oklchToHex(hexToOklch(hex));
      for (let i = 1; i < 7; i += 2) {
        const a = parseInt(hex.slice(i, i + 2), 16);
        const b = parseInt(back.slice(i, i + 2), 16);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives up chroma, never lightness, for a colour sRGB cannot show', () => {
    // The whole design rests on the value gap between two cloths. Clipping the
    // channels would shift lightness and hue together and the gap would quietly
    // stop holding, so out-of-gamut chroma is bisected away instead.
    for (const h of [0, 60, 140, 210, 300]) {
      for (const l of [0.25, 0.5, 0.8]) {
        const got = hexToOklch(oklchToHex({ l, c: 0.6, h }));   // far outside sRGB
        const dh = ((got.h - h + 540) % 360) - 180;             // to [-180, 180)
        expect(Math.abs(got.l - l)).toBeLessThan(0.02);
        expect(Math.abs(dh)).toBeLessThan(2);
        expect(got.c).toBeLessThan(0.6);
      }
    }
  });
});

describe('honju suggestions', () => {
  it('always contrasts in perceived lightness — otherwise the collar disappears', () => {
    // The honju shows as a narrow band. Hue relationships do nothing on their
    // own; value is what makes two cloths read as two cloths. Measured in Oklab
    // L, where the number is perceptual and so means what it says.
    for (const hex of SAMPLES) {
      const base = hexToOklch(hex).l;
      for (const h of harmoniesFor(hex)) {
        expect(Math.abs(hexToOklch(h.hex).l - base)).toBeGreaterThan(0.15);
      }
    }
  });

  it('gives the near-hue partners a wider value gap than the contrasting ones', () => {
    // Ou & Luo: equal hue with UNEQUAL lightness is the pairing that predicts
    // harmony best. Where hue does none of the separating, value does all of it.
    for (const hex of ['#9e2124', '#27406f', '#2e5c39', '#5b2c6f']) {
      const base = hexToOklch(hex).l;
      const gap = (name: string) => {
        const h = harmoniesFor(hex).find((x) => x.name === name)!;
        return Math.abs(hexToOklch(h.hex).l - base);
      };
      expect(gap('Monochrome')).toBeGreaterThan(gap('Complement'));
      expect(gap('Analogous')).toBeGreaterThan(gap('Complement'));
    }
  });

  it('never lands a partner in the dark olive well', () => {
    // The reliably least-liked region of colour space, and easy to walk into by
    // accident: darkening any yellow goes straight there.
    for (const hex of [...SAMPLES, '#d4941f', '#8a7a1f', '#c9c24a', '#6b6b2a']) {
      for (const h of harmoniesFor(hex)) {
        const o = hexToOklch(h.hex);
        const olive = o.h >= 85 && o.h <= 130 && o.l < 0.62 && o.c > 0.05;
        expect(olive, `${hex} → ${h.name} ${h.hex}`).toBe(false);
      }
    }
  });

  it('gives a GREY chupa real colour, not more grey', () => {
    // The bug Thupten found. Saturation used to be derived from the chupa's, so
    // a neutral produced a list of neutrals — the one case that most wants a
    // colour, because a neutral has no family to stay in.
    for (const grey of ['#8f8f8f', '#3a3a3c', '#e6e4e0', '#4a4a68']) {
      const out = harmoniesFor(grey).filter((h) => h.name !== 'Undyed');
      const coloured = out.filter((h) => hexToHsl(h.hex).s > 0.3);
      expect(coloured.length).toBeGreaterThanOrEqual(out.length - 1);
      // And they must be genuinely different hues, not one hue at five values.
      const hues = new Set(out.map((h) => Math.round(hexToHsl(h.hex).h / 40)));
      expect(hues.size).toBeGreaterThanOrEqual(4);
    }
  });

  it('stays in the colour family for a coloured chupa', () => {
    // Jewel with jewel, muted with muted — chroma tracks the chupa's. `Ground`
    // and `Undyed` are exempt by design: a neutral is meant to sit outside the
    // family, that is its job. `Monochrome` is deliberately quieter.
    for (const hex of ['#9e2124', '#128f8b', '#5b2c6f', '#9c5b3f']) {
      const c = hexToOklch(hex).c;
      for (const h of harmoniesFor(hex)) {
        if (h.name === 'Undyed' || h.name === 'Monochrome' || h.name === 'Ground') continue;
        // The lower bound is the floor in `at`; the upper says a partner is
        // never MORE vivid than the cloth it is answering.
        expect(hexToOklch(h.hex).c).toBeGreaterThan(Math.min(0.05, c * 0.4));
        expect(hexToOklch(h.hex).c).toBeLessThan(Math.max(0.06, c * 1.05));
      }
    }
    // A muted chupa gets muted partners, a vivid one vivid partners.
    //
    // Compared at one hue and one lightness, varying ONLY chroma. Comparing two
    // arbitrary cloths does not test this: sRGB holds far more chroma in some
    // hues than others, so gamut mapping alone can make a vivid crimson's
    // partners measure duller than a muted russet's, and the comparison ends up
    // measuring the shape of the gamut rather than the rule.
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const chromaOf = (hex: string) => harmoniesFor(hex).map((h) => hexToOklch(h.hex).c);
    const muted = oklchToHex({ l: 0.5, c: 0.05, h: 25 });
    const vivid = oklchToHex({ l: 0.5, c: 0.14, h: 25 });
    expect(mean(chromaOf(muted))).toBeLessThan(mean(chromaOf(vivid)));
  });

  it('leads with what shows against the cloth, then what sits with it', () => {
    // The honju is a figure on a ground, and figural preference rises with hue
    // contrast (Schloss & Palmer) — so the contrasting partners come first. The
    // near-hue ones follow: they are the pairings that rate as harmonious, and
    // they are the alternative rather than the lead.
    const names = harmoniesFor('#9e2124').map((h) => h.name);
    expect(names[0]).toBe('Complement');
    for (const near of ['Analogous', 'Monochrome']) {
      expect(names.indexOf(near)).toBeGreaterThan(names.indexOf('Triad'));
    }
    // And the safe neutrals sit at the bottom, not in the middle of the argument.
    expect(names.indexOf('Ground')).toBeGreaterThan(names.indexOf('Monochrome'));
  });

  it('offers a neutral ground, opposite the chupa in weight', () => {
    // A ground at the chupa's own value would not ground anything. Dark chupa
    // gets the undyed wool, light chupa the indigo.
    const dark = harmoniesFor('#9e2124').find((h) => h.name === 'Ground')!;
    expect(hexToOklch(dark.hex).l).toBeGreaterThan(0.85);
    expect(hexToOklch(dark.hex).c).toBeLessThan(0.03);
    const light = harmoniesFor('#efa9b8').find((h) => h.name === 'Ground')!;
    expect(hexToOklch(light.hex).l).toBeLessThan(0.4);
  });

  it('places each scheme where it claims to be — on the perceptual wheel', () => {
    // The angles are Oklab's, not HSL's. This is the point of the rebuild: 180°
    // in HSL is not the colour that looks opposite, because HSL's wheel is not
    // perceptually spaced.
    for (const chupa of ['#27406f', '#9e2124', '#2e5c39']) {
      const base = hexToOklch(chupa).h;
      const away = (name: string) => {
        const hex = harmoniesFor(chupa).find((h) => h.name === name)!.hex;
        return (((hexToOklch(hex).h - base) % 360) + 360) % 360;
      };
      // Two degrees: chroma is bisected to fit sRGB, which moves hue a hair.
      expect(Math.abs(away('Complement') - 180)).toBeLessThan(2);
      expect(Math.abs(away('Triad') - 120)).toBeLessThan(2);
      expect(Math.abs(away('Split') - 150)).toBeLessThan(2);
    }
  });

  it('never returns an empty list', () => {
    for (const hex of SAMPLES) expect(harmoniesFor(hex).length).toBeGreaterThan(3);
  });

  it('treats anything under the neutral threshold as neutral', () => {
    const justUnder = hslToHex({ h: 200, s: NEUTRAL_SATURATION - 0.02, l: 0.4 });
    expect(harmoniesFor(justUnder)[0].name).toBe('Madder');
    const justOver = hslToHex({ h: 200, s: NEUTRAL_SATURATION + 0.05, l: 0.4 });
    expect(harmoniesFor(justOver)[0].name).toBe('Complement');
  });
});

describe('naming a colour', () => {
  it('finds the named colour a hex is nearest to', () => {
    expect(nearestNamed('#b7282e')[0]).toBe('Madder');
    expect(nearestNamed('#1e50a2')[0]).toBe('Lapis');
    expect(nearestNamed('#ffffff')[0]).toBe('Undyed Silk');
    expect(nearestNamed('#000000')[0]).toBe('Black');
  });

  it('names every colour it is given', () => {
    for (const hex of SAMPLES) {
      const [name, hexOfName] = nearestNamed(hex);
      expect(name.length).toBeGreaterThan(0);
      expect(hexOfName).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('carries no non-Latin text — the card is English and a hex code', () => {
    for (const [name] of NAMED_COLOURS) expect(name).toMatch(/^[A-Za-z ]+$/);
  });
});
