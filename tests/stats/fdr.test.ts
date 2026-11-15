import { describe, expect, it } from 'vitest';
import { benjaminiHochberg, discoveries } from '../../src/stats/fdr';

describe('benjaminiHochberg', () => {
  it('matches hand computation', () => {
    // p = [0.01, 0.04, 0.03, 0.005], m = 4
    // sorted: 0.005 (rank 1), 0.01 (2), 0.03 (3), 0.04 (4)
    // m·p/rank: 4·0.005/1 = 0.02, 4·0.01/2 = 0.02, 4·0.03/3 = 0.04, 4·0.04/4 = 0.04
    // running min from the top: 0.04, 0.04, 0.02, 0.02
    // back in input order: [0.02, 0.04, 0.04, 0.02]
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.005]);
    [0.02, 0.04, 0.04, 0.02].forEach((v, i) => expect(q[i]).toBeCloseTo(v, 12));
  });

  it('enforces monotonicity and caps at 1', () => {
    // p = [0.5, 0.9, 0.04], m = 3; sorted 0.04 (1), 0.5 (2), 0.9 (3)
    // 3·0.04/1 = 0.12, 3·0.5/2 = 0.75, 3·0.9/3 = 0.9 → running min: 0.9, 0.75, 0.12
    const q = benjaminiHochberg([0.5, 0.9, 0.04]);
    [0.75, 0.9, 0.12].forEach((v, i) => expect(q[i]).toBeCloseTo(v, 12));
    // m·p/rank > 1 is capped: p = [0.8, 0.9], 2·0.8/1 = 1.6 → min(0.9, 1.6) = 0.9; 2·0.9/2 = 0.9
    expect(benjaminiHochberg([0.8, 0.9])).toEqual([0.9, 0.9]);
    expect(benjaminiHochberg([1, 1, 1])).toEqual([1, 1, 1]);
  });

  it('handles empty input and a single test', () => {
    expect(benjaminiHochberg([])).toEqual([]);
    expect(benjaminiHochberg([0.03])).toEqual([0.03]);
  });

  it('flags discoveries at q = 0.10', () => {
    // q from the first case = [0.02, 0.04, 0.04, 0.02] → all ≤ 0.10
    expect(discoveries([0.01, 0.04, 0.03, 0.005])).toEqual([true, true, true, true]);
    // q = [0.75, 0.9, 0.12] → none ≤ 0.10
    expect(discoveries([0.5, 0.9, 0.04])).toEqual([false, false, false]);
  });
});
