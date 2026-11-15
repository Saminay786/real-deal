// Confidence intervals for proportions and their differences.
// Pure: no DOM, no chrome.*. Formulas: docs/METHODOLOGY.md#intervals

export const Z95 = 1.959963984540054;

/**
 * Wilson score interval for k successes out of n.
 *   centre = (p̂ + z²/2n) / (1 + z²/n)
 *   half   = z·√(p̂(1−p̂)/n + z²/4n²) / (1 + z²/n)
 * n = 0 gives the uninformative [0, 1].
 */
export function wilson(k: number, n: number, z: number = Z95): [number, number] {
  if (n <= 0) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/**
 * Newcombe hybrid score interval (method 10, Newcombe 1998) for the difference
 * d = p₂ − p₁ (after − before), built from the two Wilson intervals [l₁,u₁], [l₂,u₂]:
 *   lower = d − √((p₂ − l₂)² + (u₁ − p₁)²)
 *   upper = d + √((u₂ − p₂)² + (p₁ − l₁)²)
 */
export function newcombe(
  k1: number,
  n1: number,
  k2: number,
  n2: number,
  z: number = Z95,
): { diff: number; ci: [number, number] } {
  const p1 = n1 > 0 ? k1 / n1 : 0;
  const p2 = n2 > 0 ? k2 / n2 : 0;
  const [l1, u1] = wilson(k1, n1, z);
  const [l2, u2] = wilson(k2, n2, z);
  const d = p2 - p1;
  return {
    diff: d,
    ci: [d - Math.sqrt((p2 - l2) ** 2 + (u1 - p1) ** 2), d + Math.sqrt((u2 - p2) ** 2 + (p1 - l1) ** 2)],
  };
}

/** Counts before and after a change point within one stratum (e.g. one star level). */
export interface StratumCounts {
  stratum: number;
  kBefore: number;
  nBefore: number;
  kAfter: number;
  nAfter: number;
}

/**
 * Star-mix-adjusted difference by direct standardisation:
 *   d_adj = Σ_s w_s (p_s,after − p_s,before),  w_s = (n_s,before + n_s,after) / Σ(…)
 *   Var   = Σ_s w_s² (p_a(1−p_a)/n_a + p_b(1−p_b)/n_b)      (Wald, per stratum)
 * Strata with no reviews on one side carry no information about change and are
 * dropped (weights renormalised). With a single usable stratum this falls back
 * to the Newcombe interval, which behaves better for small counts.
 */
export function standardizedDiff(
  strata: readonly StratumCounts[],
  z: number = Z95,
): { diff: number; ci: [number, number]; strataUsed: number } | null {
  const usable = strata.filter((s) => s.nBefore > 0 && s.nAfter > 0);
  if (usable.length === 0) return null;
  if (usable.length === 1) {
    const s = usable[0] as StratumCounts;
    return { ...newcombe(s.kBefore, s.nBefore, s.kAfter, s.nAfter, z), strataUsed: 1 };
  }
  const total = usable.reduce((a, s) => a + s.nBefore + s.nAfter, 0);
  let d = 0;
  let v = 0;
  for (const s of usable) {
    const w = (s.nBefore + s.nAfter) / total;
    const pb = s.kBefore / s.nBefore;
    const pa = s.kAfter / s.nAfter;
    d += w * (pa - pb);
    v += w * w * ((pa * (1 - pa)) / s.nAfter + (pb * (1 - pb)) / s.nBefore);
  }
  const half = z * Math.sqrt(v);
  return { diff: d, ci: [d - half, d + half], strataUsed: usable.length };
}
