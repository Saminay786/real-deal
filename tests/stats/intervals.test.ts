import { describe, expect, it } from 'vitest';
import { newcombe, standardizedDiff, wilson } from '../../src/stats/intervals';

const Z = 1.96; // hand calculations below use z = 1.96

describe('wilson', () => {
  it('k = 0, n = 10', () => {
    // p̂ = 0, z² = 3.8416, z²/n = 0.38416, denom = 1.38416
    // centre = (0 + 3.8416/20) / 1.38416 = 0.19208 / 1.38416 = 0.138770
    // half   = 1.96·√(0 + 3.8416/400) / 1.38416 = 1.96·0.098 / 1.38416 = 0.138770
    // → [0, 0.277540]
    const [lo, hi] = wilson(0, 10, Z);
    expect(lo).toBeCloseTo(0, 10);
    expect(hi).toBeCloseTo(0.27754, 5);
  });

  it('k = 5, n = 10 is symmetric about 0.5', () => {
    // centre = (0.5 + 0.19208)/1.38416 = 0.5
    // half = 1.96·√(0.025 + 0.009604)/1.38416 = 1.96·0.186021/1.38416 = 0.263410
    const [lo, hi] = wilson(5, 10, Z);
    expect(lo).toBeCloseTo(0.23659, 5);
    expect(hi).toBeCloseTo(0.76341, 5);
  });

  it('81/263 matches Newcombe (1998), Table I: 0.2553–0.3662', () => {
    // p̂ = 0.307985; z²/n = 0.014607; denom = 1.014607
    // centre = (0.307985 + 0.007303)/1.014607 = 0.310744
    // half = 1.96·√(0.00081037 + 0.0000138848)/1.014607 = 1.96·0.028710/1.014607 = 0.055462
    const [lo, hi] = wilson(81, 263, Z);
    expect(lo).toBeCloseTo(0.2553, 4);
    expect(hi).toBeCloseTo(0.3662, 4);
  });

  it('n = 0 is uninformative', () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});

describe('newcombe', () => {
  it('56/70 − 48/80 matches Newcombe (1998), method 10: 0.0524–0.3339', () => {
    // before 48/80 = 0.6: Wilson [0.490460, 0.700387]; after 56/70 = 0.8: Wilson [0.691833, 0.876953]
    // d = 0.8 − 0.6 = 0.2
    // lower = 0.2 − √((0.8 − 0.691833)² + (0.700387 − 0.6)²) = 0.2 − √(0.011700 + 0.010078) = 0.2 − 0.147575 = 0.052425
    // upper = 0.2 + √((0.876953 − 0.8)² + (0.6 − 0.490460)²) = 0.2 + √(0.005922 + 0.011999) = 0.2 + 0.133868 = 0.333868
    const r = newcombe(48, 80, 56, 70, Z);
    expect(r.diff).toBeCloseTo(0.2, 12);
    expect(r.ci[0]).toBeCloseTo(0.0524, 4);
    expect(r.ci[1]).toBeCloseTo(0.3339, 4);
  });

  it('a decrease gives a negative difference', () => {
    const r = newcombe(56, 70, 48, 80, Z);
    expect(r.diff).toBeCloseTo(-0.2, 12);
    expect(r.ci[0]).toBeCloseTo(-0.3339, 4);
    expect(r.ci[1]).toBeCloseTo(-0.0524, 4);
  });
});

describe('standardizedDiff', () => {
  it('weights per-star differences by star-level size (Agresti–Caffo adjusted)', () => {
    // Adjusted p̃ = (k + 1)/(n + 2)
    // Stratum 1★: before 10/50 → 11/52 = 0.211538; after 20/50 → 21/52 = 0.403846 (n = 100)
    // Stratum 5★: before 5/100 → 6/102 = 0.058824; after the same (n = 200)
    // w₁ = 100/300 = 1/3, w₅ = 2/3
    // d = (1/3)(0.403846 − 0.211538) + (2/3)(0) = 0.064103
    // Var = (1/9)(0.403846·0.596154/52 + 0.211538·0.788462/52) + (4/9)(2 · 0.058824·0.941176/102)
    //     = (1/9)(0.0046299 + 0.0032075) + (4/9)(0.0010856) = 0.00087082 + 0.00048247 = 0.00135329
    // half = 1.96·√0.00135329 = 1.96·0.036787 = 0.072103 → [−0.008000, 0.136205]
    const r = standardizedDiff(
      [
        { stratum: 1, kBefore: 10, nBefore: 50, kAfter: 20, nAfter: 50 },
        { stratum: 5, kBefore: 5, nBefore: 100, kAfter: 5, nAfter: 100 },
      ],
      Z,
    );
    expect(r?.diff).toBeCloseTo(0.064103, 5);
    expect(r?.ci[0]).toBeCloseTo(-0.008, 5);
    expect(r?.ci[1]).toBeCloseTo(0.136205, 5);
    expect(r?.strataUsed).toBe(2);
  });

  it('ignores tiny strata that used to dominate the estimate (boAt case, DECISIONS #30)', () => {
    // Before the fix, a 1★ stratum with 2 reviews before (both mention the theme) and
    // 40 after (none do) contributed −100 points with zero Wald variance.
    const strata = [
      { stratum: 1, kBefore: 2, nBefore: 2, kAfter: 0, nAfter: 40 }, // < 10 before → excluded
      { stratum: 5, kBefore: 6, nBefore: 60, kAfter: 4, nAfter: 40 },
    ];
    const r = standardizedDiff(strata, Z);
    expect(r?.strataUsed).toBe(1);
    // Only 5★ remains → Newcombe on 6/60 vs 4/40: d = 0.1 − 0.1 = 0
    expect(r?.diff).toBeCloseTo(0, 12);
    expect(r && r.ci[1] - r.ci[0]).toBeGreaterThan(0.1); // honest width, not collapsed
  });

  it('never reports zero uncertainty when a stratum is 0% or 100%', () => {
    const r = standardizedDiff(
      [
        { stratum: 1, kBefore: 0, nBefore: 20, kAfter: 0, nAfter: 20 },
        { stratum: 5, kBefore: 20, nBefore: 20, kAfter: 20, nAfter: 20 },
      ],
      Z,
    );
    expect(r && r.ci[1] - r.ci[0]).toBeGreaterThan(0.05);
  });

  it('drops strata with fewer than 10 on a side, and falls back to Newcombe for one stratum', () => {
    const r = standardizedDiff(
      [
        { stratum: 1, kBefore: 48, nBefore: 80, kAfter: 56, nAfter: 70 },
        { stratum: 5, kBefore: 3, nBefore: 30, kAfter: 0, nAfter: 0 },
      ],
      Z,
    );
    expect(r?.strataUsed).toBe(1);
    expect(r?.ci[0]).toBeCloseTo(0.0524, 4);
    expect(standardizedDiff([{ stratum: 1, kBefore: 1, nBefore: 5, kAfter: 0, nAfter: 0 }])).toBeNull();
  });
});
