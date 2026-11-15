// Benjamini–Hochberg false discovery rate control across one product's themes.
// Pure: no DOM, no chrome.*. Method: docs/METHODOLOGY.md#false-discovery-rate

export const FDR_Q = 0.1;

/**
 * BH-adjusted p-values (q-values), returned in the input order.
 * With p-values sorted ascending p_(1) ≤ … ≤ p_(m):
 *   q_(i) = min_{j ≥ i} ( m · p_(j) / j ),  capped at 1.
 * A hypothesis is a discovery at level q* iff its q-value ≤ q*.
 */
export function benjaminiHochberg(pValues: readonly number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i);
  const q = new Array<number>(m).fill(1);
  let running = 1;
  for (let rank = m; rank >= 1; rank--) {
    const item = order[rank - 1];
    if (!item) continue;
    running = Math.min(running, (m * item.p) / rank);
    q[item.i] = Math.min(1, running);
  }
  return q;
}

/** Which hypotheses are discoveries at level `level` (default q = 0.10). */
export function discoveries(pValues: readonly number[], level: number = FDR_Q): boolean[] {
  return benjaminiHochberg(pValues).map((q) => q <= level);
}
