import { describe, expect, it } from 'vitest';
import { detectBurst, logGamma, poissonUpperTail, type BurstReview } from '../../src/stats/burst';
import { mulberry32 } from '../../src/stats/rng';

describe('poissonUpperTail', () => {
  it('matches hand computation and scipy', () => {
    // P(X ≥ 3 | λ = 1) = 1 − e^−1 (1 + 1 + 1/2) = 1 − 2.5/e = 0.0803014
    expect(poissonUpperTail(3, 1)).toBeCloseTo(0.08030139707, 10);
    // scipy.stats.poisson.sf(9, 2) = 4.6498075e-05
    expect(poissonUpperTail(10, 2) / 4.649807501726386e-5).toBeCloseTo(1, 9);
    // scipy.stats.poisson.sf(4, 5) = 0.5595067
    expect(poissonUpperTail(5, 5)).toBeCloseTo(0.5595067149, 9);
    // eye-cream case: 109 in a window with λ = 2.8 → scipy 2.376e-129
    expect(poissonUpperTail(109, 2.8) / 2.3761351582110576e-129).toBeCloseTo(1, 6);
    expect(poissonUpperTail(0, 5)).toBe(1);
  });

  it('logGamma(n + 1) = log n!', () => {
    expect(logGamma(1)).toBeCloseTo(0, 12);
    expect(logGamma(6)).toBeCloseTo(Math.log(120), 12);
    expect(logGamma(101)).toBeCloseTo(363.73937555556347, 9);
  });
});

/** n reviews spread evenly over `days` days from 2024-01-01. */
function steady(n: number, days: number, rating = 4, verified = true, seed = 1): BurstReview[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const d = new Date(Date.UTC(2024, 0, 1) + Math.floor(rng() * days) * 86_400_000);
    return { date: d.toISOString().slice(0, 10), rating, verified };
  });
}

function burstOf(n: number, startIso: string, rating: number, verified: boolean): BurstReview[] {
  const t0 = Date.parse(`${startIso}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(t0 + (i % 14) * 86_400_000).toISOString().slice(0, 10),
    rating,
    verified,
  }));
}

describe('detectBurst', () => {
  it('finds nothing unusual in a steady stream', () => {
    const r = detectBurst(steady(300, 365));
    expect(r.value?.level).toBe('none');
    expect(r.value?.signals).toEqual([]);
  });

  it('flags a busy period that is otherwise ordinary as "busy" (launch / sale)', () => {
    const r = detectBurst([...steady(300, 365), ...burstOf(60, '2024-06-01', 4, true)]);
    expect(r.value?.level).toBe('busy');
    expect(r.value?.signals).toEqual(['burst']);
    expect(r.value?.start).toBe('2024-06-01');
  });

  it('flags the eye-cream pattern as suspicious: burst + more positive + mostly unverified', () => {
    // Research case B00N996X4G: 109 reviews in 14 days, 4.81★ vs 4.27★, 99% vs 34% unverified.
    const base = steady(300, 900, 4, true, 2).map((r, i) => ({ ...r, verified: i % 3 !== 0 }));
    const r = detectBurst([...base, ...burstOf(100, '2024-10-28', 5, false)]);
    expect(r.value?.level).toBe('suspicious');
    expect(r.value?.signals).toEqual(['burst', 'more-positive', 'more-unverified']);
    expect(r.value?.count).toBeGreaterThanOrEqual(100);
    expect(r.value?.meanRatingBurst).toBeGreaterThan(4.8);
  });

  it('needs enough reviews and time', () => {
    expect(detectBurst(steady(30, 365)).dataSufficiency).toBe('insufficient');
    expect(detectBurst(steady(200, 30)).dataSufficiency).toBe('insufficient');
  });

  it('false alarms are rare on steady streams (Poisson null)', () => {
    let flagged = 0;
    for (let s = 0; s < 200; s++) if (detectBurst(steady(300, 730, 4, true, 100 + s)).value?.level !== 'none') flagged++;
    expect(flagged / 200).toBeLessThanOrEqual(0.01);
  });
});
