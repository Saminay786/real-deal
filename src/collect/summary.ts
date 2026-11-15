// Collection progress shown in the side panel. Pure: no DOM, no chrome.*, no IndexedDB.

import type { Review } from '../types';

/** Minimum to analyse themes over time (CLAUDE.md B1). */
export const MIN_REVIEWS = 100;
export const MIN_MONTHS = 3;
/** Country whose reviews are analysed; others are kept but not used. */
export const ANALYSED_COUNTRY = 'India';

export interface CollectionSummary {
  /** All stored reviews for the product. */
  captured: number;
  /** Reviews from ANALYSED_COUNTRY with a date: these are the ones analysed. */
  usable: number;
  /** Reviews from other countries (kept, not analysed). */
  otherCountries: number;
  /** Amazon's written-review total, if seen. */
  totalOnAmazon: number | null;
  /** ISO dates of the earliest and latest usable review. */
  earliest: string | null;
  latest: string | null;
  /** Distinct calendar months containing at least one usable review. */
  months: number;
  reviewsNeeded: number;
  monthsNeeded: number;
  minimumMet: boolean;
}

export function summarizeCollection(reviews: readonly Review[], totalOnAmazon: number | null): CollectionSummary {
  const usable = reviews.filter((r) => r.country === ANALYSED_COUNTRY && r.date !== null);
  const otherCountries = reviews.filter((r) => r.country !== null && r.country !== ANALYSED_COUNTRY).length;
  const dates = usable.map((r) => r.date as string).sort();
  const months = new Set(dates.map((d) => d.slice(0, 7))).size;
  const reviewsNeeded = Math.max(0, MIN_REVIEWS - usable.length);
  const monthsNeeded = Math.max(0, MIN_MONTHS - months);
  return {
    captured: reviews.length,
    usable: usable.length,
    otherCountries,
    totalOnAmazon,
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
    months,
    reviewsNeeded,
    monthsNeeded,
    minimumMet: reviewsNeeded === 0 && monthsNeeded === 0,
  };
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-01", "2026-11-11" -> "Oct–Nov 2026"; across years "Dec 2025–Feb 2026"; same month "Nov 2026". */
export function formatMonthSpan(earliest: string | null, latest: string | null): string | null {
  if (!earliest || !latest) return null;
  const [y1, m1] = [Number(earliest.slice(0, 4)), Number(earliest.slice(5, 7))];
  const [y2, m2] = [Number(latest.slice(0, 4)), Number(latest.slice(5, 7))];
  const a = MONTH_ABBR[m1 - 1] ?? '?';
  const b = MONTH_ABBR[m2 - 1] ?? '?';
  if (y1 === y2 && m1 === m2) return `${a} ${y1}`;
  if (y1 === y2) return `${a}–${b} ${y1}`;
  return `${a} ${y1}–${b} ${y2}`;
}
