import { describe, expect, it } from 'vitest';
import { formatMonthSpan, summarizeCollection } from '../../src/collect/summary';
import type { Review } from '../../src/types';

const review = (id: string, date: string | null, country: string | null = 'India'): Review => ({
  reviewId: id,
  asin: 'B0CCM8L54V',
  rating: 5,
  title: null,
  body: null,
  date,
  verified: true,
  helpfulVotes: 0,
  variant: null,
  country,
});

describe('summarizeCollection', () => {
  it('counts usable reviews, months and what is still needed', () => {
    // 2 in Sep, 3 in Oct, 1 in Nov (India) + 1 US + 1 undated.
    const reviews = [
      review('R01', '2026-09-05'),
      review('R02', '2026-09-30'),
      review('R03', '2026-10-01'),
      review('R04', '2026-10-15'),
      review('R05', '2026-10-31'),
      review('R06', '2026-11-11'),
      review('R07', '2026-11-12', 'United States'),
      review('R08', null),
    ];
    const s = summarizeCollection(reviews, 1283);
    expect(s).toEqual({
      captured: 8,
      usable: 6, // R01–R06
      otherCountries: 1, // R07
      totalOnAmazon: 1283,
      earliest: '2026-09-05',
      latest: '2026-11-11',
      months: 3, // Sep, Oct, Nov
      reviewsNeeded: 94, // 100 − 6
      monthsNeeded: 0, // 3 − 3
      minimumMet: false,
    });
  });

  it('meets the minimum at 100 reviews over 3 months', () => {
    const reviews = Array.from({ length: 100 }, (_, i) =>
      review(`R${String(i).padStart(3, '0')}`, ['2026-09-10', '2026-10-10', '2026-11-10'][i % 3] ?? null),
    );
    const s = summarizeCollection(reviews, null);
    expect(s.usable).toBe(100);
    expect(s.months).toBe(3);
    expect(s.minimumMet).toBe(true);
  });

  it('needs more months even with many reviews', () => {
    const reviews = Array.from({ length: 150 }, (_, i) => review(`R${i}`, '2026-11-01'));
    const s = summarizeCollection(reviews, null);
    expect(s.reviewsNeeded).toBe(0);
    expect(s.monthsNeeded).toBe(2); // 3 − 1
    expect(s.minimumMet).toBe(false);
  });

  it('handles nothing collected', () => {
    const s = summarizeCollection([], null);
    expect(s).toMatchObject({ captured: 0, usable: 0, months: 0, earliest: null, reviewsNeeded: 100, monthsNeeded: 3 });
  });
});

describe('formatMonthSpan', () => {
  it('formats same month, same year and across years', () => {
    expect(formatMonthSpan('2026-11-01', '2026-11-30')).toBe('Nov 2026');
    expect(formatMonthSpan('2026-09-05', '2026-11-11')).toBe('Sep–Nov 2026');
    expect(formatMonthSpan('2025-12-20', '2026-02-03')).toBe('Dec 2025–Feb 2026');
    expect(formatMonthSpan(null, '2026-02-03')).toBeNull();
  });
});
