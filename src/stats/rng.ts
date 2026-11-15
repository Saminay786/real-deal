// Seeded random numbers. Pure: same seed -> same sequence on every machine.

/** A function returning uniform draws in [0, 1). */
export type Rng = () => number;

export const DEFAULT_SEED = 42;

/** mulberry32: small, fast 32-bit PRNG (public domain, Tommy Ettinger). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw (Box–Muller). */
export function normal(rng: Rng): number {
  const u1 = 1 - rng(); // (0, 1], avoids log(0)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Gamma(shape, 1) draw. Marsaglia & Tsang (2000) for shape >= 1;
 * for shape < 1 uses Gamma(shape + 1) · U^(1/shape).
 */
export function gamma(rng: Rng, shape: number): number {
  if (!(shape > 0)) throw new RangeError(`gamma shape must be > 0, got ${shape}`);
  if (shape < 1) {
    const u = 1 - rng(); // (0, 1]
    return gamma(rng, shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(rng);
    const v0 = 1 + c * x;
    if (v0 <= 0) continue;
    const v = v0 * v0 * v0;
    const u = 1 - rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Dirichlet(alpha) draw: independent Gamma(alpha_i, 1) normalised to sum 1. */
export function dirichlet(rng: Rng, alpha: readonly number[]): number[] {
  const g = alpha.map((a) => gamma(rng, a));
  const s = g.reduce((acc, x) => acc + x, 0);
  return g.map((x) => x / s);
}

/** Linear-interpolated quantile (type 7, as R/NumPy default) of an ascending-sorted array. */
export function quantileSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const a = sorted[lo] ?? NaN;
  const b = sorted[hi] ?? NaN;
  return a + (h - lo) * (b - a);
}
