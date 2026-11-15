// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { extractProduct, parseCount, parseRating } from '../../src/content/amazon/extract';
import { loadFixture } from '../fixtures';

describe('parsers', () => {
  it('parseCount handles Indian digit grouping and labels', () => {
    expect(parseCount('(11,413)')).toBe(11413);
    expect(parseCount('1,23,456 ratings')).toBe(123456);
    expect(parseCount('22 global ratings')).toBe(22);
    expect(parseCount('no ratings')).toBeNull();
    expect(parseCount(null)).toBeNull();
  });

  it('parseRating reads "x out of 5"', () => {
    expect(parseRating('4.0 out of 5 stars')).toBe(4);
    expect(parseRating('4.4 out of 5')).toBe(4.4);
    expect(parseRating('Previous page')).toBeNull();
  });
});

describe('extractProduct on saved pages', () => {
  const cases = [
    {
      name: 'product-many',
      asin: 'B0CCM8L54V', // canonical link points at B0BQ8B1RJF (another variant); must not be used
      titleStart: 'Zulaxy Photo Frame Hooks',
      rating: 4.0,
      ratingCount: 11413,
      dist: { 1: 10, 2: 4, 3: 12, 4: 20, 5: 54 },
    },
    {
      name: 'product-281',
      asin: 'B0HFV4DG93',
      titleStart: 'Lush Plush Cotton Pajama Pants',
      rating: 4.3,
      ratingCount: 281,
      dist: { 1: 5, 2: 2, 3: 11, 4: 21, 5: 61 },
    },
    {
      name: 'product-46',
      asin: 'B0HHFY48V4',
      titleStart: 'Portronics Swix Multi Plug Adapter',
      rating: 4.2,
      ratingCount: 46,
      dist: { 1: 13, 2: 3, 3: 0, 4: 18, 5: 66 },
    },
    {
      name: 'product-few',
      asin: 'B0HPCRWRXK',
      titleStart: 'Feyora 360 Degree Spin Mop',
      rating: 4.4,
      ratingCount: 22,
      dist: { 1: 13, 2: 0, 3: 0, 4: 0, 5: 87 },
    },
  ] as const;

  it.each(cases)('$name', ({ name, asin, titleStart, rating, ratingCount, dist }) => {
    const { doc, url } = loadFixture(name);
    const s = extractProduct(doc, url, new Date('2026-11-14T00:00:00Z'));
    expect(s.asin).toBe(asin);
    expect(s.title?.startsWith(titleStart)).toBe(true);
    expect(s.rating).toBe(rating);
    expect(s.ratingCount).toBe(ratingCount);
    expect(s.ratingDistribution).toEqual(dist);
    expect(s.url).toBe(url);
    expect(s.capturedAt).toBe('2026-11-14T00:00:00.000Z');
  });

  it('product-none: no rating data, and ignores other products\' stars in carousels', () => {
    const { doc, url } = loadFixture('product-none');
    const s = extractProduct(doc, url);
    expect(s.asin).toBe('B0HPY7PVQY');
    expect(s.title?.startsWith('Strobe Cream')).toBe(true);
    expect(s.rating).toBeNull(); // the page contains "3.8 out of 5 stars" in a carousel
    expect(s.ratingCount).toBeNull();
    expect(s.ratingDistribution).toBeNull();
  });

  it('never throws on an empty or unrelated page', () => {
    const doc = new DOMParser().parseFromString('<html><body><p>hello</p></body></html>', 'text/html');
    const s = extractProduct(doc, 'https://www.amazon.in/x/dp/B000000001');
    expect(s).toMatchObject({
      asin: 'B000000001', // falls back to the URL
      title: null,
      rating: null,
      ratingCount: null,
      ratingDistribution: null,
    });
  });
});
