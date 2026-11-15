import { describe, expect, it } from 'vitest';
import { dirichlet, gamma, mulberry32, normal, quantileSorted } from '../../src/stats/rng';

function meanVar(xs: number[]): [number, number] {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return [m, v];
}

describe('mulberry32', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xa);
    expect([c(), c(), c()]).not.toEqual(xa);
  });

  it('stays in [0, 1) with mean ≈ 1/2', () => {
    const r = mulberry32(1);
    const xs = Array.from({ length: 20000 }, r);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    // Uniform(0,1): mean 1/2, sd 1/√12 ≈ 0.2887; SE of mean = 0.2887/√20000 ≈ 0.0020.
    expect(meanVar(xs)[0]).toBeCloseTo(0.5, 1);
  });
});

describe('normal', () => {
  it('has mean ≈ 0 and variance ≈ 1', () => {
    const r = mulberry32(2);
    const [m, v] = meanVar(Array.from({ length: 20000 }, () => normal(r)));
    // SE(mean) = 1/√20000 ≈ 0.007; SE(var) ≈ √(2/20000) = 0.01.
    expect(Math.abs(m)).toBeLessThan(0.03);
    expect(Math.abs(v - 1)).toBeLessThan(0.05);
  });
});

describe('gamma', () => {
  it.each([0.5, 1, 3, 20])('Gamma(%s, 1) has mean ≈ shape and variance ≈ shape', (shape) => {
    const r = mulberry32(3);
    const [m, v] = meanVar(Array.from({ length: 20000 }, () => gamma(r, shape)));
    // Gamma(k,1): E = k, Var = k. SE(mean) = √(k/20000); allow ~4 SE.
    expect(Math.abs(m - shape)).toBeLessThan(4 * Math.sqrt(shape / 20000));
    expect(Math.abs(v - shape) / shape).toBeLessThan(0.08);
  });

  it('rejects non-positive shape', () => {
    expect(() => gamma(mulberry32(1), 0)).toThrow(RangeError);
  });
});

describe('dirichlet', () => {
  it('sums to 1 and has mean α_i / Σα', () => {
    const r = mulberry32(4);
    const alpha = [4, 1, 1, 1, 20]; // Σα = 27
    const draws = Array.from({ length: 10000 }, () => dirichlet(r, alpha));
    for (const d of draws.slice(0, 50)) expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    // E[θ_5] = 20/27 ≈ 0.7407; E[θ_1] = 4/27 ≈ 0.1481.
    expect(meanVar(draws.map((d) => d[4] ?? 0))[0]).toBeCloseTo(20 / 27, 2);
    expect(meanVar(draws.map((d) => d[0] ?? 0))[0]).toBeCloseTo(4 / 27, 2);
  });
});

describe('quantileSorted', () => {
  it('interpolates linearly (type 7)', () => {
    // [1,2,3,4], p = 0.25: h = (4−1)·0.25 = 0.75 → 1 + 0.75·(2−1) = 1.75
    expect(quantileSorted([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 12);
    // p = 0.5: h = 1.5 → 2 + 0.5·(3−2) = 2.5
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
    expect(quantileSorted([7], 0.9)).toBe(7);
    expect(quantileSorted([], 0.5)).toBeNaN();
  });
});
