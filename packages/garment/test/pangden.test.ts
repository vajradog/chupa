/**
 * The pangden's construction, as a set of checkable predictions.
 *
 * Khadog's account of how the apron is made — one woven strip, cut into three
 * lengths, middle one turned upside down, sewn edge to edge — is practitioner
 * testimony rather than published fact. What makes it usable anyway is that it
 * predicts things you can look for in a photograph of a real apron. Those
 * predictions are the tests below, so if the account is ever corrected, what
 * has to change here is obvious.
 */

import { describe, expect, it } from 'vitest';
import { buildForm } from '@chupa/body';
import {
  GARMENT_SPEC, PANGDEN_PALETTE, PANGDEN_REGIONS, buildFlatChupa, dyesInProgram,
  expandStripe, hexToOklch, lettersUsed, pangdenHex, pangdenRegion,
  programIsPaintable, tuneDyes, weavePangden,
} from '@chupa/garment';

const spec = GARMENT_SPEC.pangden;

/** Runs of one colour, in row order: `[letter, height]`. */
function runs(rows: readonly string[]): [string, number][] {
  const out: [string, number][] = [];
  let from = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i === rows.length || rows[i] !== rows[from]) {
      out.push([rows[from], i - from]);
      from = i;
    }
  }
  return out;
}

/**
 * The runs a panel shows in full.
 *
 * The first and last run in ROW ORDER are the two the cut passes through, so
 * they are shortened by the cut and say nothing about the weaving. Everything
 * between them is a whole band.
 */
function wholeBands(rows: readonly string[]): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const [letter, height] of runs(rows).slice(1, -1)) {
    const set = out.get(letter) ?? new Set<number>();
    set.add(height);
    out.set(letter, set);
  }
  return out;
}

describe('the stripe program', () => {
  it('gives one letter per row', () => {
    for (const rows of [8, 25, 62, 100]) {
      expect(expandStripe('R3 K1 Y2', rows).length).toBe(rows);
    }
  });

  it('repeats with the program, and winds forward by the offset', () => {
    const p = 'R3 K1 Y2';                       // period 6
    expect(expandStripe(p, 6, 0)).toEqual(['R', 'R', 'R', 'K', 'Y', 'Y']);
    expect(expandStripe(p, 6, 3)).toEqual(['K', 'Y', 'Y', 'R', 'R', 'R']);
    // A whole period of offset is no offset at all.
    expect(expandStripe(p, 12, 6)).toEqual(expandStripe(p, 12, 0));
    // And it winds backwards too, rather than throwing or emptying.
    expect(expandStripe(p, 6, -6)).toEqual(expandStripe(p, 6, 0));
  });

  it('refuses an empty program rather than drawing nothing', () => {
    expect(() => expandStripe('   ', 10)).toThrow(/empty/);
  });
});

describe('one strip, cut into panels', () => {
  const weave = weavePangden(spec, 62);

  it('cuts as many panels as the spec asks for', () => {
    expect(weave.panels.length).toBe(spec.strips);
    for (const p of weave.panels) expect(p.rows.length).toBe(62);
  });

  it('cuts them consecutively from ONE strip', () => {
    // Panel k begins where panel k-1 ended. This is the claim the other two
    // predictions rest on, so it is asserted directly rather than inferred.
    weave.panels.forEach((p, k) => expect(p.cutAt).toBe(k * 62));
  });

  it('gives every panel the same band HEIGHTS — same weaving, same cloth', () => {
    // "Where a render shows the same colour thick in one panel and thin in
    // another, suspect the measurement before the cloth."  A run can be cut
    // short at either end of a panel, so full-height runs are what is compared.
    //
    // Checked against the PROGRAM rather than against panel zero: a panel only
    // shows the stretch of weaving it was cut from, so two panels need not have
    // any colour in common, and comparing them to each other passes vacuously
    // whenever they do not.
    const declared = new Map<string, Set<number>>();
    for (const word of spec.stripeProgram.trim().split(/\s+/)) {
      const set = declared.get(word[0]) ?? new Set<number>();
      set.add(Number(word.slice(1)));
      declared.set(word[0], set);
    }
    let checked = 0;
    for (const p of weave.panels) {
      for (const [letter, heights] of wholeBands(p.rows)) {
        for (const h of heights) {
          expect(declared.get(letter)?.has(h), `${letter}${h}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('does NOT line the panels up with each other', () => {
    // Buckley records that the bands are not aligned between panels, and this
    // is the published half of the account.
    for (let k = 1; k < weave.panels.length; k++) {
      expect(weave.panels[k].rows).not.toEqual(weave.panels[0].rows);
    }
  });

  it('turns the middle panel upside down and leaves the outer pair alike', () => {
    // The part that gives a way to check a render against a photograph: if
    // panels one and three disagree in direction, the render is wrong.
    expect(weave.panels[0].inverted).toBe(false);
    expect(weave.panels[1].inverted).toBe(true);
    expect(weave.panels[2].inverted).toBe(false);
  });

  it('reverses the middle panel rather than re-weaving it', () => {
    const middle = weave.panels[1];
    const asWoven = expandStripe(spec.stripeProgram, 62, middle.cutAt);
    expect([...middle.rows].reverse()).toEqual(asWoven);
  });

  it('merges rows into bands that tile the panel with no gaps', () => {
    weave.bands.forEach((bands, k) => {
      expect(bands[0].from).toBe(0);
      expect(bands[bands.length - 1].to).toBe(62);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].from).toBe(bands[i - 1].to);
        // A merged band is a run of ONE colour, so neighbours differ.
        expect(bands[i].letter).not.toBe(bands[i - 1].letter);
      }
      expect(bands.every((b) => b.letter === weave.panels[k].rows[b.from])).toBe(true);
    });
  });
});

describe('the regional styles', () => {
  it('covers all seven areas Buckley describes', () => {
    expect(PANGDEN_REGIONS.length).toBe(7);
    for (const name of ['Tingri', 'Sakya', 'Panam', 'Nyalam', 'Dolpo', 'Near Kailash', 'Towns']) {
      expect(pangdenRegion(name), name).toBeDefined();
    }
  });

  it('only uses letters the palette can actually paint', () => {
    for (const r of PANGDEN_REGIONS) {
      expect(programIsPaintable(r.stripeProgram), `${r.name}: ${lettersUsed(r.stripeProgram)}`)
        .toBe(true);
    }
    expect(programIsPaintable(GARMENT_SPEC.pangden.stripeProgram)).toBe(true);
  });

  it('keeps each description’s character — what dominates and what accents', () => {
    const share = (program: string, letters: string) => {
      const rows = expandStripe(program, 400);
      return rows.filter((c) => letters.includes(c)).length / rows.length;
    };
    const of = (name: string) => pangdenRegion(name)!.stripeProgram;

    // "dark blue-green OVERALL, enlivened with NARROW stripes of red or purple"
    expect(share(of('Tingri'), 'T')).toBeGreaterThan(0.75);
    expect(share(of('Tingri'), 'RM')).toBeLessThan(0.2);

    // "dark red, white and brown" — and nothing else.
    expect(share(of('Sakya'), 'RWN')).toBe(1);

    // "WIDE stripes of green and blue, highlighted by NARROWER red, white, brown"
    expect(share(of('Panam'), 'GB')).toBeGreaterThan(0.75);

    // "white stripes are typical of the area" — more white than any one other.
    const nyalam = of('Nyalam');
    for (const other of ['B', 'R', 'G', 'K']) {
      expect(share(nyalam, 'W')).toBeGreaterThan(share(nyalam, other));
    }

    // "very large, with WIDE stripes of red and orange-yellow"
    expect(share(of('Dolpo'), 'RYO')).toBe(1);
  });

  it('bands of even width where the description says even width', () => {
    // Kailash: "bands of red, green and orange of approximately even width".
    // Towns: "narrow stripes of approximately even width".
    for (const name of ['Near Kailash', 'Towns']) {
      const widths = pangdenRegion(name)!.stripeProgram.trim().split(/\s+/)
        .map((s) => Number(s.slice(1)));
      expect(new Set(widths).size, name).toBe(1);
    }
  });
});

describe('tuning an apron to the outfit', () => {
  const program = pangdenRegion('Tingri')!.stripeProgram;
  const groundOf = (p: string) => {
    // The dye covering most of the cloth.
    const share = new Map<string, number>();
    for (const c of expandStripe(p, 360)) share.set(c, (share.get(c) ?? 0) + 1);
    return [...share.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  it('puts the ground opposite the chupa', () => {
    const chupa = '#2f6b4a';                        // a green
    const tuned = tuneDyes(program, chupa, '#8fb8d6');
    const ground = groundOf(program);
    const want = (hexToOklch(chupa).h + 180) % 360;
    const got = hexToOklch(tuned[ground] ?? pangdenHex(ground)).h;
    expect(Math.abs(((got - want + 540) % 360) - 180)).toBeLessThan(2);
  });

  it('moves TWO dyes and leaves the rest of the region alone', () => {
    // The correction that matters. Rotating every dye through the same angle
    // preserved the structure and destroyed the identity — the turn that puts a
    // madder ground opposite a madder chupa is 180°, which is exactly the
    // operation that turns every warm dye cool. Sakya came back teal and navy.
    const sakya = pangdenRegion('Sakya')!.stripeProgram;
    const tuned = tuneDyes(sakya, '#9e2124', '#8fb8d6');
    expect(Object.keys(tuned).length).toBeLessThanOrEqual(2);
    // Its brown is still walnut, so it still reads as Sakya.
    expect(tuned).not.toHaveProperty('N');
    expect(tuned).not.toHaveProperty('W');
  });

  it('holds lightness, and never makes a dye MORE vivid than it was', () => {
    for (const chupa of ['#2f6b4a', '#9e2124', '#27406f', '#d4941f']) {
      const tuned = tuneDyes(program, chupa, '#8fb8d6');
      for (const [letter, hex] of Object.entries(tuned)) {
        const a = hexToOklch(hex);
        const b = hexToOklch(pangdenHex(letter));
        // Lightness is held — it is what the drawing depends on, and
        // `oklchToHex` gives up chroma rather than lightness to stay in gamut.
        expect(Math.abs(a.l - b.l)).toBeLessThan(0.02);
        // Chroma can only fall, and only because sRGB holds less of some hues
        // than others. Preserving chroma as a fraction of each hue's ceiling
        // was tried to avoid that and turned a muted ground into vivid magenta,
        // so the absolute ask stands and the gamut takes what it must.
        expect(a.c, `${letter} ${hex}`).toBeLessThan(b.c + 0.005);
      }
    }
  });

  it('echoes the honju in one accent, but not when the honju is a neutral', () => {
    const honjuHue = hexToOklch('#8fb8d6').h;
    const near = (h: number) => Math.abs(((h - honjuHue + 540) % 360) - 180) < 2;

    const withColour = tuneDyes(program, '#2f6b4a', '#8fb8d6');
    expect(Object.values(withColour).map((h) => hexToOklch(h).h).some(near)).toBe(true);

    // Bone has no hue worth echoing, so only the ground moves.
    const neutral = tuneDyes(program, '#2f6b4a', '#efe9dc');
    expect(Object.keys(neutral).length).toBe(1);
  });

  it('always leaves one coloured dye on its own plant', () => {
    // Or there is nothing of the region left to have re-dyed. Sakya forces it:
    // two coloured dyes, so the echo has to stand down.
    for (const region of PANGDEN_REGIONS) {
      const chromatic = dyesInProgram(region.stripeProgram)
        .filter((l) => hexToOklch(pangdenHex(l)).c >= 0.04);
      const tuned = tuneDyes(region.stripeProgram, '#9e2124', '#8fb8d6');
      const movedChromatic = chromatic.filter((l) => l in tuned);
      expect(movedChromatic.length, region.name).toBeLessThan(chromatic.length);
    }
  });

  it('leaves the undyed and near-black bands alone', () => {
    // Nobody dyes their undyed wool to go with a chupa.
    const tuned = tuneDyes(pangdenRegion('Nyalam')!.stripeProgram, '#9e2124', '#8fb8d6');
    expect(tuned).not.toHaveProperty('W');
    expect(tuned).not.toHaveProperty('K');
  });

  it('records nothing when the apron is already where it would be put', () => {
    // Tingri's ground sits almost exactly opposite madder, so tuning it to a
    // madder chupa is a rotation of about two degrees. Recording that would
    // mark every chip "moved" over a change nobody can see.
    const tuned = tuneDyes(program, '#9e2124', '#e8dfc9');
    expect(Object.keys(tuned).length).toBe(0);
  });
});

describe('on the flat elevation', () => {
  const form = buildForm();
  const flat = buildFlatChupa(form);
  const pangden = flat.regions.filter((r) => r.garment === 'pangden');

  it('is drawn at all', () => {
    expect(pangden.length).toBeGreaterThan(10);
  });

  it('carries its own dyed colours rather than taking a swatch', () => {
    const hexes = new Set(Object.keys(PANGDEN_PALETTE)
      .map((k) => `#${PANGDEN_PALETTE[k].map((v) => v.toString(16).padStart(2, '0')).join('')}`));
    for (const r of pangden) {
      expect(r.colour).toBeDefined();
      expect(hexes.has(r.colour!), r.colour).toBe(true);
    }
  });

  it('covers the lower half of the sash and stops above the chupa hem', () => {
    const ys = pangden.flatMap((r) => r.outline.map((p) => p[1]));
    const top = Math.max(...ys);
    const bottom = Math.min(...ys);
    // Top edge at the middle of the sash, so half the band is covered.
    expect(top).toBeCloseTo(flat.landmarks.sashMidY, 4);
    expect(top).toBeLessThan(flat.landmarks.sashTopY);
    expect(top).toBeGreaterThan(flat.landmarks.sashBotY);
    // And the drop you see is the length that was asked for.
    expect(top - bottom).toBeCloseTo(GARMENT_SPEC.pangden.length, 4);
    expect(bottom).toBeGreaterThan(flat.landmarks.hemY);
  });

  it('is narrower on screen than its flat width — it is wrapped round her', () => {
    // 42 cm of cloth laid on a body does not read 42 cm wide from the front.
    // Drawn flat it was wider than the skirt and stuck out past the silhouette.
    const xs = pangden.flatMap((r) => r.outline.map((p) => p[0]));
    const halfOnScreen = Math.max(...xs);
    expect(halfOnScreen).toBeLessThan(GARMENT_SPEC.pangden.width / 2);
    expect(halfOnScreen).toBeGreaterThan(GARMENT_SPEC.pangden.width / 3);
  });

  it('never spills outside the garment it hangs on', () => {
    for (const r of pangden) {
      for (const [x, y] of r.outline) {
        expect(Math.abs(x)).toBeLessThanOrEqual(flat.profile.halfAt(y) + 1e-6);
      }
    }
  });

  it('sews the panels edge to edge — a gutter would be an invented feature', () => {
    // Every panel boundary should be shared exactly: no gap, no overlap.
    //
    // Measured ACROSS one height. A band's outline spans a range of heights and
    // the panel tapers over that range, so the min and max x of the outline are
    // not the panel's edges at any single y — they have to be interpolated.
    const atY = flat.landmarks.sashMidY - 10;
    const spanAt = (r: typeof pangden[number]): [number, number] | null => {
      // outline is [ left@lo, right@lo, right@hi, left@hi ].
      const lo = r.outline[0][1];
      const hi = r.outline[2][1];
      if (atY < Math.min(lo, hi) || atY > Math.max(lo, hi)) return null;
      const t = (atY - lo) / ((hi - lo) || 1);
      return [
        r.outline[0][0] + (r.outline[3][0] - r.outline[0][0]) * t,
        r.outline[1][0] + (r.outline[2][0] - r.outline[1][0]) * t,
      ];
    };
    const spans = new Set<string>();
    for (const r of pangden) {
      const s = spanAt(r);
      if (s) spans.add(`${s[0].toFixed(6)}|${s[1].toFixed(6)}`);
    }
    const edges = [...spans]
      .map((s) => s.split('|').map(Number) as [number, number])
      .sort((a, b) => a[0] - b[0]);
    expect(edges.length).toBe(GARMENT_SPEC.pangden.strips);
    for (let i = 1; i < edges.length; i++) {
      // To a hundredth of a centimetre, not to floating point. The panel edge
      // is a curve — the apron narrows with the skirt — and each band draws it
      // as one straight segment between its own two heights. Neighbouring bands
      // in different panels break that curve at different places, so the two
      // sides of a seam disagree by the sagitta of a band-height of arc: about
      // seven microns here, and no gutter anyone could see.
      expect(edges[i][0]).toBeCloseTo(edges[i - 1][1], 2);
    }
  });

  it('is drawn over both the skirt and the sash — it is tied on over them', () => {
    const layerOf = (name: string) => flat.regions.find((r) => r.name === name)!.layer;
    expect(pangden[0].layer).toBeGreaterThan(layerOf('skirt'));
    expect(pangden[0].layer).toBeGreaterThan(layerOf('sash'));
  });
});
