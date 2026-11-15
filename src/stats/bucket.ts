// Monthly buckets for a review-level 0/1 theme indicator.
// Pure: no DOM, no chrome.*. Method: docs/METHODOLOGY.md#monthly-buckets

import type { SeriesBucket, StatResult } from '../types';
import { wilson } from './intervals';

/** One review: its date and whether it mentions the theme (x = 1). */
export interface Obs {
  /** ISO yyyy-mm-dd */
  date: string;
  x: 0 | 1;
  /** Stratum for stratified tests, e.g. star rating 1–5. Defaults to 0. */
  stratum?: number;
}

export const MIN_BUCKET_N = 15;
export const MIN_TOTAL_REVIEWS = 100;
export const MIN_BUCKETS = 3;

export interface Bucket extends SeriesBucket {
  /** Index of the first observation (in date-sorted order) in this bucket. */
  startIndex: number;
  /** One past the last observation. */
  endIndex: number;
}

export interface Bucketed {
  /** Observations sorted by date (stable for equal dates). */
  sorted: Obs[];
  buckets: Bucket[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function monthEnd(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
  return `${ym}-${String(last).padStart(2, '0')}`;
}

/**
 * Groups observations into calendar months, then merges adjacent months until
 * every bucket has at least `minN` observations:
 *   - walk months in order, adding each to the open bucket; close it once n ≥ minN;
 *   - a final bucket with n < minN is merged into the previous one.
 * Months with no reviews are absorbed into the bucket that spans them.
 */
export function bucketize(obs: readonly Obs[], minN: number = MIN_BUCKET_N): StatResult<Bucketed> {
  const valid = obs.filter((o) => ISO_DATE.test(o.date));
  const sorted = valid
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (a.o.date < b.o.date ? -1 : a.o.date > b.o.date ? 1 : a.i - b.i))
    .map(({ o }) => o);

  if (sorted.length === 0) {
    return { value: null, dataSufficiency: 'insufficient', explanation: 'No dated reviews.' };
  }

  // Index ranges per calendar month.
  const months: { ym: string; start: number; end: number }[] = [];
  sorted.forEach((o, i) => {
    const ym = o.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.ym === ym) last.end = i + 1;
    else months.push({ ym, start: i, end: i + 1 });
  });

  // Greedy merge.
  const ranges: { startYm: string; endYm: string; start: number; end: number }[] = [];
  let open: { startYm: string; endYm: string; start: number; end: number } | null = null;
  for (const m of months) {
    if (!open) open = { startYm: m.ym, endYm: m.ym, start: m.start, end: m.end };
    else {
      open.endYm = m.ym;
      open.end = m.end;
    }
    if (open.end - open.start >= minN) {
      ranges.push(open);
      open = null;
    }
  }
  if (open) {
    const prev = ranges[ranges.length - 1];
    if (prev) {
      prev.endYm = open.endYm;
      prev.end = open.end;
    } else ranges.push(open);
  }

  const buckets: Bucket[] = ranges.map((r) => {
    let k = 0;
    for (let i = r.start; i < r.end; i++) k += sorted[i]?.x ?? 0;
    const n = r.end - r.start;
    return {
      start: `${r.startYm}-01`,
      end: monthEnd(r.endYm),
      n,
      k,
      share: k / n,
      ci: wilson(k, n),
      startIndex: r.start,
      endIndex: r.end,
    };
  });

  const enough = sorted.length >= MIN_TOTAL_REVIEWS && buckets.length >= MIN_BUCKETS;
  return {
    value: { sorted, buckets },
    dataSufficiency: enough ? 'ok' : 'insufficient',
    explanation: enough
      ? `${sorted.length} reviews in ${buckets.length} time buckets of at least ${minN} reviews each.`
      : `Need at least ${MIN_TOTAL_REVIEWS} reviews in at least ${MIN_BUCKETS} buckets of ${minN}+ reviews; ` +
        `have ${sorted.length} reviews in ${buckets.length} bucket${buckets.length === 1 ? '' : 's'}.`,
  };
}
