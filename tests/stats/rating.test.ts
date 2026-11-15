import { describe, expect, it } from 'vitest';
import {
  intervalFromCounts,
  posteriorMeanRating,
  ratingCounts,
  ratingInterval,
} from '../../src/stats/rating';
import { dirichlet, mulberry32, type Rng } from '../../src/stats/rng';

const HOOKS = { 1: 10, 2: 4, 3: 12, 4: 20, 5: 54 } as const; // product-many, N = 11,413
const MOP = { 1: 13, 2: 0, 3: 0, 4: 0, 5: 87 } as const; // product-few, N = 22
const ADAPTER = { 1: 13, 2: 3, 3: 0, 4: 18, 5: 66 } as const; // product-46, N = 46

describe('ratingCounts', () => {
  it('reconstructs counts from rounded percentages', () => {
    // 0.10·11413 = 1141.3 → 1141;  0.04·11413 = 456.52 → 457;  0.12·11413 = 1369.56 → 1370
    // 0.20·11413 = 2282.6 → 2283;  0.54·11413 = 6163.02 → 6163  (sum 11414: rounding)
    expect(ratingCounts(HOOKS, 11413)).toEqual([1141, 457, 1370, 2283, 6163]);
    // 0.13·22 = 2.86 → 3;  0.87·22 = 19.14 → 19
    expect(ratingCounts(MOP, 22)).toEqual([3, 0, 0, 0, 19]);
    // 0.13·46 = 5.98 → 6;  0.03·46 = 1.38 → 1;  0;  0.18·46 = 8.28 → 8;  0.66·46 = 30.36 → 30
    expect(ratingCounts(ADAPTER, 46)).toEqual([6, 1, 0, 8, 30]);
  });
});

describe('posteriorMeanRating (default Jeffreys prior, α0 = 0.5)', () => {
  it('matches hand computation for the mop (22 ratings)', () => {
    // α = (0.5+3, 0.5, 0.5, 0.5, 0.5+19) = (3.5, 0.5, 0.5, 0.5, 19.5), Σα = 24.5
    // E[μ] = (1·3.5 + 2·0.5 + 3·0.5 + 4·0.5 + 5·19.5) / 24.5
    //      = (3.5 + 1 + 1.5 + 2 + 97.5) / 24.5 = 105.5/24.5 ≈ 4.30612   (Amazon shows 4.4)
    expect(posteriorMeanRating([3, 0, 0, 0, 19])).toBeCloseTo(105.5 / 24.5, 12);
  });

  it('matches hand computation for the adapter (46 ratings)', () => {
    // α = (6.5, 1.5, 0.5, 8.5, 30.5), Σα = 47.5
    // E[μ] = (6.5 + 3 + 1.5 + 34 + 152.5) / 47.5 = 197.5/47.5 ≈ 4.15789
    expect(posteriorMeanRating([6, 1, 0, 8, 30])).toBeCloseTo(197.5 / 47.5, 12);
  });

  it('matches hand computation for the hooks (11,413 ratings)', () => {
    // α = (1141.5, 457.5, 1370.5, 2283.5, 6163.5), Σα = 11416.5
    // E[μ] = (1141.5 + 915 + 4111.5 + 9134 + 30817.5) / 11416.5 = 46119.5/11416.5 ≈ 4.03973
    expect(posteriorMeanRating([1141, 457, 1370, 2283, 6163])).toBeCloseTo(46119.5 / 11416.5, 12);
  });

  it('with the uniform prior (α0 = 1), as originally specified', () => {
    // α = (4, 1, 1, 1, 20), Σα = 27: (4 + 2 + 3 + 4 + 100)/27 = 113/27 ≈ 4.18519
    expect(posteriorMeanRating([3, 0, 0, 0, 19], 1)).toBeCloseTo(113 / 27, 12);
  });

  it('is 3 with no data', () => {
    // α = (0.5, …, 0.5): 0.5·(1+2+3+4+5)/2.5 = 7.5/2.5 = 3
    expect(posteriorMeanRating([0, 0, 0, 0, 0])).toBe(3);
  });
});

describe('ratingInterval', () => {
  it('is insufficient when ratings are missing', () => {
    expect(ratingInterval(null, null).dataSufficiency).toBe('insufficient');
    expect(ratingInterval(HOOKS, 0).value).toBeNull();
    expect(ratingInterval(null, 50).value).toBeNull();
  });

  it('is insufficient when percentages do not add up to ~100', () => {
    const broken = { 1: 10, 2: 4, 3: 12, 4: 20, 5: 0 } as const; // sums to 46
    const r = ratingInterval(broken, 100);
    expect(r.dataSufficiency).toBe('insufficient');
    expect(r.explanation).toContain('46%');
  });

  it('flags fewer than 30 ratings as low data', () => {
    const r = ratingInterval(MOP, 22);
    expect(r.dataSufficiency).toBe('low');
    expect(r.explanation).toContain('rough');
    expect(ratingInterval(ADAPTER, 46).dataSufficiency).toBe('ok');
  });

  it('gives a narrow interval around the mean for many ratings', () => {
    const v = ratingInterval(HOOKS, 11413).value;
    expect(v).not.toBeNull();
    if (!v) return;
    // Normal approximation: per-rating variance under the posterior mean ≈ E[x²] − μ²
    //   E[x²] ≈ 1·0.10 + 4·0.04 + 9·0.12 + 16·0.20 + 25·0.54 = 18.04; μ ≈ 4.0395 → var ≈ 1.72, sd ≈ 1.311
    //   SE(μ) ≈ 1.311/√11420 ≈ 0.01227; 90% half-width ≈ 1.645·0.01227 ≈ 0.0202
    //   → interval ≈ [4.019, 4.060]
    expect(v.lo).toBeGreaterThan(4.015);
    expect(v.lo).toBeLessThan(4.024);
    expect(v.hi).toBeGreaterThan(4.055);
    expect(v.hi).toBeLessThan(4.064);
    expect(v.lo).toBeLessThan(v.mean);
    expect(v.mean).toBeLessThan(v.hi);
  });

  it('is identical across runs with the same seed', () => {
    expect(ratingInterval(MOP, 22)).toEqual(ratingInterval(MOP, 22));
    const a = ratingInterval(MOP, 22, { seed: 1 }).value;
    const b = ratingInterval(MOP, 22, { seed: 2 }).value;
    expect(a?.lo).not.toBe(b?.lo);
  });
});

describe('coverage simulation', () => {
  function sampleCounts(rng: Rng, theta: readonly number[], n: number): number[] {
    const c = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      let u = rng();
      let k = 0;
      while (k < 4 && u >= (theta[k] ?? 0)) {
        u -= theta[k] ?? 0;
        k++;
      }
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }
  const mu = (theta: readonly number[]) => theta.reduce((a, t, i) => a + (i + 1) * t, 0);
  const REPS = 500;
  // 1000 draws per interval (badge uses 4000) to keep the test fast; quantile noise is small.
  const DRAWS = 1000;

  // Hooks (54% 5★), mop (87% 5★, where the uniform prior failed at 0.74), and a poorly rated product.
  const THETAS = {
    hooks: [0.1, 0.04, 0.12, 0.2, 0.54],
    mop: [0.13, 0, 0, 0, 0.87],
    poor: [0.35, 0.1, 0.15, 0.15, 0.25],
  } as const;
  const CASES = (['hooks', 'mop', 'poor'] as const).flatMap((shape) =>
    [20, 100, 1000].map((n) => ({ shape, n })),
  );

  it.each(CASES)(
    'fixed true θ ($shape), n = $n: the 90 percent interval covers the true mean 85–95 percent of the time',
    ({ shape, n }) => {
      const theta = THETAS[shape];
      const rng = mulberry32(1000 + n);
      let hits = 0;
      for (let r = 0; r < REPS; r++) {
        const iv = intervalFromCounts(sampleCounts(rng, theta, n), { seed: r, draws: DRAWS });
        if (iv.lo <= mu(theta) && mu(theta) <= iv.hi) hits++;
      }
      // Binomial SE at p = 0.9, 500 reps: √(0.9·0.1/500) ≈ 0.0134, so ±0.05 is ~3.7 SE.
      const coverage = hits / REPS;
      expect(coverage).toBeGreaterThanOrEqual(0.85);
      expect(coverage).toBeLessThanOrEqual(0.95);
    },
    60_000,
  );

  it('θ drawn from the prior itself, n = 50: coverage ≈ 90% (Bayesian calibration check)', () => {
    // When the truth really comes from the prior, a correct posterior interval covers it
    // exactly 90% of the time on average. Checks the sampler and quantiles, not the prior choice.
    const rng = mulberry32(77);
    let hits = 0;
    for (let r = 0; r < REPS; r++) {
      const theta = dirichlet(rng, [0.5, 0.5, 0.5, 0.5, 0.5]);
      const iv = intervalFromCounts(sampleCounts(rng, theta, 50), { seed: r, draws: DRAWS });
      if (iv.lo <= mu(theta) && mu(theta) <= iv.hi) hits++;
    }
    expect(hits / REPS).toBeGreaterThanOrEqual(0.86);
    expect(hits / REPS).toBeLessThanOrEqual(0.94);
  }, 60_000);
});
