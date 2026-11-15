// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  extractReviews,
  extractTotalReviews,
  parseHelpful,
  parseReviewDate,
} from '../../src/content/amazon/extract';
import { asinFromPath } from '../../src/content/page';
import { loadFixture } from '../fixtures';

describe('parseReviewDate', () => {
  it('reads the amazon.in format', () => {
    expect(parseReviewDate('Reviewed in India on 12 March 2026')).toEqual({ country: 'India', date: '2026-03-12' });
    expect(parseReviewDate('Reviewed in India on 1 October 2026')).toEqual({ country: 'India', date: '2026-10-01' });
  });

  it('reads the US format and strips "the"', () => {
    expect(parseReviewDate('Reviewed in the United States on November 3, 2025')).toEqual({
      country: 'United States',
      date: '2025-11-03',
    });
  });

  it('returns nulls for unknown or impossible dates, never throws', () => {
    expect(parseReviewDate('Reviewed in India on 31 February 2026')).toEqual({ country: 'India', date: null });
    expect(parseReviewDate('Reviewed in India on yesterday')).toEqual({ country: 'India', date: null });
    expect(parseReviewDate('something else')).toEqual({ country: null, date: null });
    expect(parseReviewDate(null)).toEqual({ country: null, date: null });
  });
});

describe('parseHelpful', () => {
  it('handles one, many and none', () => {
    expect(parseHelpful('One person found this helpful')).toBe(1);
    expect(parseHelpful('7 people found this helpful')).toBe(7);
    expect(parseHelpful('1,204 people found this helpful')).toBe(1204);
    expect(parseHelpful(null)).toBe(0);
  });
});

describe('asinFromPath', () => {
  it('reads product and review URLs', () => {
    expect(asinFromPath('/portal/customer-reviews/B0CCM8L54V/ref=cm_cr_arp_d_viewopt_srt')).toBe('B0CCM8L54V');
    expect(asinFromPath('/Some-Product/product-reviews/B0GLG5JSHK/')).toBe('B0GLG5JSHK');
    expect(asinFromPath('/Zulaxy-Drilling/dp/B0CCM8L54V/ref=x')).toBe('B0CCM8L54V');
    expect(asinFromPath('/s')).toBeNull();
  });
});

describe('extractReviews on saved pages', () => {
  it.each([
    ['reviews-a-p1', 10, 'B0CCM8L54V', 1283],
    ['reviews-a-p2', 30, 'B0CCM8L54V', 1283],
    ['reviews-a-60', 60, 'B0CCM8L54V', 1283],
    ['reviews-b-p1', 10, 'B0GLG5JSHK', 419],
    ['reviews-b-top', 10, 'B0HB6VXMJ6', 485],
  ] as const)('%s: %i reviews of %s, %i on Amazon', (name, count, asin, total) => {
    const { doc, url } = loadFixture(name);
    const reviews = extractReviews(doc, url);
    expect(reviews).toHaveLength(count);
    expect(new Set(reviews.map((r) => r.reviewId)).size).toBe(count);
    for (const r of reviews) {
      expect(r.reviewId).toMatch(/^R[A-Z0-9]+$/);
      expect(r.asin).toBe(asin);
      expect([1, 2, 3, 4, 5]).toContain(r.rating);
      expect(r.date).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(r.country).toBe('India');
      expect(typeof r.verified).toBe('boolean');
      expect(r.helpfulVotes).toBeGreaterThanOrEqual(0);
      expect(r.title).not.toMatch(/out of 5 stars/);
    }
    expect(extractTotalReviews(doc)).toBe(total);
  });

  it('reads every field of the first hooks review', () => {
    const { doc, url } = loadFixture('reviews-a-p1');
    const [r] = extractReviews(doc, url);
    expect(r).toEqual({
      reviewId: 'R3RST0O7ZS3260',
      asin: 'B0CCM8L54V',
      rating: 1,
      title: 'Worst quality',
      body: 'A terribly flimsy hook. I hung a calendar and a plastic colander on the wall, but it couldn’t hold them.',
      date: '2026-11-11',
      verified: false,
      helpfulVotes: 0,
      variant: 'Size: 10 PACK | Colour: Photo Frame Hook',
      country: 'India',
    });
  });

  it('reads verified badges and helpful votes when present', () => {
    const { doc, url } = loadFixture('reviews-a-60');
    const reviews = extractReviews(doc, url);
    expect(reviews.some((r) => r.verified)).toBe(true);
    expect(reviews.some((r) => r.verified === false)).toBe(true);
    expect(Math.max(...reviews.map((r) => r.helpfulVotes ?? 0))).toBe(7);
  });

  it('returns [] on a page without reviews', () => {
    const { doc, url } = loadFixture('product-none');
    expect(extractReviews(doc, url)).toEqual([]);
  });
});
