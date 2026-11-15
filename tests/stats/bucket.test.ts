import { describe, expect, it } from 'vitest';
import { bucketize, type Obs } from '../../src/stats/bucket';
import { wilson } from '../../src/stats/intervals';

/** n reviews in month ym (days 1..n mod 28), the first k mentioning the theme. */
function month(ym: string, n: number, k: number): Obs[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `${ym}-${String((i % 28) + 1).padStart(2, '0')}`,
    x: (i < k ? 1 : 0) as 0 | 1,
  }));
}

describe('bucketize', () => {
  it('merges thin months forward, and a thin last bucket backward', () => {
    // Jan 10 (k 2), Feb 10 (k 3), Mar 20 (k 10), Apr none, May 5 (k 5)
    // Jan: 10 < 15 → add Feb: 20 ≥ 15 → close [Jan–Feb] n = 20, k = 5
    // Mar: 20 ≥ 15 → close [Mar] n = 20, k = 10
    // May: 5 < 15 and last → merge into [Mar] → [Mar–May] n = 25, k = 15
    const obs = [...month('2026-01', 10, 2), ...month('2026-02', 10, 3), ...month('2026-03', 20, 10), ...month('2026-05', 5, 5)];
    const r = bucketize(obs);
    const b = r.value?.buckets ?? [];
    expect(b.map((x) => [x.start, x.end, x.n, x.k])).toEqual([
      ['2026-01-01', '2026-02-28', 20, 5],
      ['2026-03-01', '2026-05-31', 25, 15],
    ]);
    expect(b[0]?.share).toBeCloseTo(0.25, 12); // 5/20
    expect(b[1]?.share).toBeCloseTo(0.6, 12); // 15/25
    expect(b[1]?.ci).toEqual(wilson(15, 25));
    expect(b.map((x) => [x.startIndex, x.endIndex])).toEqual([
      [0, 20],
      [20, 45],
    ]);
    // 45 reviews < 100 minimum
    expect(r.dataSufficiency).toBe('insufficient');
  });

  it('sorts by date (stable) and drops invalid dates', () => {
    const obs: Obs[] = [
      { date: '2026-03-02', x: 1 },
      { date: 'not a date', x: 1 },
      { date: '2026-01-05', x: 0 },
      { date: '2026-03-02', x: 0 },
    ];
    const r = bucketize(obs, 1);
    expect(r.value?.sorted).toEqual([
      { date: '2026-01-05', x: 0 },
      { date: '2026-03-02', x: 1 },
      { date: '2026-03-02', x: 0 },
    ]);
  });

  it('keeps everything in one bucket when there is too little data', () => {
    const r = bucketize(month('2026-06', 5, 1));
    expect(r.value?.buckets).toHaveLength(1);
    expect(r.value?.buckets[0]?.n).toBe(5);
  });

  it('is sufficient with ≥ 100 reviews in ≥ 3 buckets', () => {
    // 4 months × 30 reviews: each month closes its own bucket (30 ≥ 15)
    const obs = ['2026-01', '2026-02', '2026-03', '2026-04'].flatMap((m) => month(m, 30, 6));
    const r = bucketize(obs);
    expect(r.value?.buckets).toHaveLength(4);
    expect(r.dataSufficiency).toBe('ok');
  });

  it('handles leap-year February and empty input', () => {
    expect(bucketize(month('2028-02', 20, 0)).value?.buckets[0]?.end).toBe('2028-02-29');
    expect(bucketize([]).dataSufficiency).toBe('insufficient');
  });
});
