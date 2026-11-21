// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  extractSearchResults,
  parsePrice,
  renderScoreBadges,
  reorderCards,
  SCORE_BADGE_CLASS,
  searchCards,
} from '../../src/content/amazon/search';
import { rankingScore } from '../../src/stats/rating';
import { loadFixture } from '../fixtures';

describe('parsePrice', () => {
  it('reads rupee prices', () => {
    expect(parsePrice('₹1,299')).toBe(1299);
    expect(parsePrice('₹9.35')).toBe(9.35);
    expect(parsePrice(null)).toBeNull();
  });
});

describe('extractSearchResults on saved search pages', () => {
  it('search-a ("wall hooks"): 60 cards, sponsored marked, a known organic card read fully', () => {
    const rs = extractSearchResults(loadFixture('search-a').doc);
    expect(rs).toHaveLength(60);
    expect(rs.some((r) => r.sponsored)).toBe(true);
    expect(rs.some((r) => !r.sponsored)).toBe(true);
    const daluci = rs.find((r) => r.asin === 'B0D8PQQQ6G');
    expect(daluci).toMatchObject({ rating: 4, ratingCount: 3727, price: 160, sponsored: false });
    expect(daluci?.title?.startsWith('DALUCI Self Adhesive Wall Hooks')).toBe(true);
    expect(daluci?.url).toMatch(/^https:\/\/www\.amazon\.in\//);
    // A new sponsored product with no ratings yet
    expect(rs.find((r) => r.asin === 'B0HR5H1JL2')).toMatchObject({ rating: null, ratingCount: null, sponsored: true });
  });

  it('search-b ("bluetooth earbuds"): 22 cards incl. 4.6★ from only 4 ratings', () => {
    const rs = extractSearchResults(loadFixture('search-b').doc);
    expect(rs).toHaveLength(22);
    expect(rs.find((r) => r.asin === 'B0GCS56F7W')).toMatchObject({ rating: 3.8, ratingCount: 4727, price: 499, sponsored: true });
    expect(rs.find((r) => r.asin === 'B0GKXZWH37')).toMatchObject({ rating: 4.6, ratingCount: 4 });
    expect(rs.map((r) => r.position)).toEqual([...Array(22).keys()]);
  });
});

describe('score badges and reordering (this page only)', () => {
  it('adds exactly one badge per card, idempotently', () => {
    const { doc } = loadFixture('search-b');
    renderScoreBadges(doc);
    renderScoreBadges(doc);
    expect(doc.querySelectorAll(`.${SCORE_BADGE_CLASS}`)).toHaveLength(22);
    const badge = searchCards(doc)
      .find((c) => c.getAttribute('data-asin') === 'B0GKXZWH37')
      ?.querySelector(`.${SCORE_BADGE_CLASS}`);
    expect(badge?.textContent).toMatch(/^Real Deal score \d\.\d\d · few ratings/);
  });

  it('sorts cards by score (unscored last) and restores Amazon\'s order exactly', () => {
    const { doc } = loadFixture('search-a');
    const original = searchCards(doc).map((c) => c.getAttribute('data-asin'));
    const parent = searchCards(doc)[0]?.parentElement;
    const childCount = parent?.children.length;

    reorderCards(doc, true);
    const sortedScores = extractSearchResults(doc).map((r) => rankingScore(r.rating, r.ratingCount).value?.score ?? null);
    const firstNull = sortedScores.indexOf(null);
    const scored = (firstNull === -1 ? sortedScores : sortedScores.slice(0, firstNull)) as number[];
    for (let i = 1; i < scored.length; i++) expect(scored[i - 1]).toBeGreaterThanOrEqual(scored[i] as number);
    if (firstNull !== -1) expect(sortedScores.slice(firstNull).every((s) => s === null)).toBe(true);
    expect(parent?.children.length).toBe(childCount); // nothing added or lost

    reorderCards(doc, false);
    expect(searchCards(doc).map((c) => c.getAttribute('data-asin'))).toEqual(original);
  });
});
