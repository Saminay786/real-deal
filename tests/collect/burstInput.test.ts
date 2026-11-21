import { describe, expect, it } from 'vitest';
import { burstReviews } from '../../src/collect/burstInput';
import type { Review } from '../../src/types';

const review = (id: string, date: string, country = 'India'): Review => ({
  reviewId: id,
  asin: 'B000000001',
  rating: 5,
  title: null,
  body: null,
  date,
  verified: true,
  helpfulVotes: 0,
  variant: null,
  country,
});

const reviews = [review('R1', '2024-01-01'), review('R2', '2024-02-01'), review('R3', '2024-03-01'), review('R4', '2024-03-02', 'United States')];
const allStars = { view: { sort: 'recent', star: 'all', reviewer: 'all' } as const, reviewIds: ['R1', 'R2'] };
const fiveStar = { view: { sort: 'recent', star: 5, reviewer: 'all' } as const, reviewIds: ['R3'] };

describe('burstReviews (DECISIONS #49)', () => {
  it('uses every India review when the collection is complete', () => {
    const s = burstReviews(reviews, [allStars, fiveStar], 4);
    expect(s.basis).toBe('all');
    expect(s.reviews.map((r) => r.date)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
  });

  it('otherwise uses only reviews seen without a star filter (star filters fake recent bursts)', () => {
    const s = burstReviews(reviews, [allStars, fiveStar], 1000);
    expect(s.basis).toBe('unfiltered');
    expect(s.reviews.map((r) => r.date)).toEqual(['2024-01-01', '2024-02-01']); // R3 came only from the 5★ view
  });

  it('says so when only star-filtered views were collected', () => {
    expect(burstReviews(reviews, [fiveStar], 1000)).toEqual({ reviews: [], basis: 'none' });
  });
});
