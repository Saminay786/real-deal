// Review-burst check: an unusually busy 14-day window, and whether it was also
// unusually positive or unverified. These are SIGNALS, never proof of fake
// reviews (launches, sales and programmes like Amazon Vine look similar).
// Pure: no DOM, no chrome.*. Method: docs/METHODOLOGY.md#review-bursts

import type { StatResult } from '../types';

export const BURST_WINDOW_DAYS = 14;
/** Burst threshold on the window-count-corrected Poisson tail probability. */
export const BURST_ALPHA = 0.001;
export const MIN_REVIEWS = 50;
export const MIN_SPAN_DAYS = 90;
/** Extra signals that make a burst "suspicious" (thresholds from research, DECISIONS #48–#49). */
export const MORE_POSITIVE_STARS = 0.5;
export const MORE_UNVERIFIED = 0.2;
/** Extra signals need at least this many reviews in the burst to mean anything. */
export const MIN_BURST_FOR_SIGNALS = 10;

export interface BurstReview {
  /** ISO yyyy-mm-dd */
  date: string;
  rating: number | null;
  verified: boolean | null;
}

export interface Burst {
  start: string;
  end: string;
  count: number;
  /** Reviews expected in a 14-day window at the product's average pace. */
  expected: number;
  /** P(a window this busy anywhere in the history | steady pace), corrected for the number of windows. */
  pValue: number;
  meanRatingBurst: number | null;
  meanRatingRest: number | null;
  unverifiedBurst: number | null;
  unverifiedRest: number | null;
  level: 'none' | 'busy' | 'suspicious';
  signals: ('burst' | 'more-positive' | 'more-unverified')[];
}

// ---------------------------------------------------------------- Poisson tail

/** log Γ(x) by the Lanczos approximation (g = 7, n = 9); accurate to ~1e-15 for x > 0. */
export function logGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const xx = x - 1;
  let a = c[0] as number;
  const t = xx + 7.5;
  for (let i = 1; i < 9; i++) a += (c[i] as number) / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/** P(X ≥ k) for X ~ Poisson(λ). */
export function poissonUpperTail(k: number, lambda: number): number {
  if (k <= 0) return 1;
  if (lambda <= 0) return 0;
  const logPmf = (i: number) => -lambda + i * Math.log(lambda) - logGamma(i + 1);
  if (k > lambda) {
    // Sum the (decreasing) terms from k upwards until negligible.
    let sum = 0;
    for (let i = k; i < k + 10_000; i++) {
      const term = Math.exp(logPmf(i));
      sum += term;
      if (term < sum * 1e-16) break;
    }
    return Math.min(1, sum);
  }
  // k ≤ λ: 1 − P(X ≤ k − 1).
  let cdf = 0;
  for (let i = 0; i < k; i++) cdf += Math.exp(logPmf(i));
  return Math.max(0, 1 - cdf);
}

// ---------------------------------------------------------------- burst

const dayIndex = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function detectBurst(reviews: readonly BurstReview[], windowDays: number = BURST_WINDOW_DAYS): StatResult<Burst> {
  const rs = reviews.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const n = rs.length;
  const days = rs.map((r) => dayIndex(r.date));
  const span = n ? (days[n - 1] as number) - (days[0] as number) + 1 : 0;
  if (n < MIN_REVIEWS || span < MIN_SPAN_DAYS) {
    return {
      value: null,
      dataSufficiency: 'insufficient',
      explanation: `Needs at least ${MIN_REVIEWS} reviews spread over ${MIN_SPAN_DAYS} days; have ${n} over ${span} days.`,
    };
  }

  // Busiest window (two pointers over sorted days).
  let j = 0;
  let best = 0;
  let from = 0;
  let to = 0;
  for (let i = 0; i < n; i++) {
    while ((days[i] as number) - (days[j] as number) >= windowDays) j++;
    if (i - j + 1 > best) {
      best = i - j + 1;
      from = j;
      to = i + 1;
    }
  }
  const expected = (n * windowDays) / span;
  // Searching ~span/window windows: Bonferroni-style correction.
  const pValue = Math.min(1, poissonUpperTail(best, expected) * Math.max(1, span / windowDays));

  const inBurst = rs.slice(from, to);
  const rest = [...rs.slice(0, from), ...rs.slice(to)];
  const ratings = (xs: BurstReview[]) => xs.flatMap((r) => (typeof r.rating === 'number' ? [r.rating] : []));
  const unverified = (xs: BurstReview[]) => xs.flatMap((r) => (typeof r.verified === 'boolean' ? [r.verified ? 0 : 1] : []));
  const meanRatingBurst = mean(ratings(inBurst));
  const meanRatingRest = mean(ratings(rest));
  const unverifiedBurst = mean(unverified(inBurst));
  const unverifiedRest = mean(unverified(rest));

  const signals: Burst['signals'] = [];
  const isBurst = pValue < BURST_ALPHA;
  if (isBurst) signals.push('burst');
  if (isBurst && best >= MIN_BURST_FOR_SIGNALS) {
    if (meanRatingBurst !== null && meanRatingRest !== null && meanRatingBurst - meanRatingRest >= MORE_POSITIVE_STARS) {
      signals.push('more-positive');
    }
    if (unverifiedBurst !== null && unverifiedRest !== null && unverifiedBurst - unverifiedRest >= MORE_UNVERIFIED) {
      signals.push('more-unverified');
    }
  }
  const level: Burst['level'] = !isBurst ? 'none' : signals.length > 1 ? 'suspicious' : 'busy';

  return {
    value: {
      start: inBurst[0]?.date ?? '',
      end: inBurst[inBurst.length - 1]?.date ?? '',
      count: best,
      expected,
      pValue,
      meanRatingBurst,
      meanRatingRest,
      unverifiedBurst,
      unverifiedRest,
      level,
      signals,
    },
    dataSufficiency: n < 100 ? 'low' : 'ok',
    explanation:
      level === 'none'
        ? 'No unusually busy period.'
        : `${best} reviews in ${windowDays} days from ${inBurst[0]?.date} (normal pace: ${expected.toFixed(1)}).`,
  };
}
