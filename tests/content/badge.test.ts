// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { BADGE_ID, formatRange, renderBadge } from '../../src/content/amazon/badge';
import { extractProduct } from '../../src/content/amazon/extract';
import { ratingInterval } from '../../src/stats/rating';
import { loadFixture } from '../fixtures';

function badgeFor(name: string) {
  const { doc, url } = loadFixture(name);
  const snap = extractProduct(doc, url);
  const result = ratingInterval(snap.ratingDistribution, snap.ratingCount);
  renderBadge(doc, result);
  return { doc, result };
}

describe('formatRange', () => {
  it('uses one decimal, or two when one decimal would collapse', () => {
    expect(formatRange(3.71, 4.58)).toBe('3.7–4.6');
    expect(formatRange(4.019, 4.06)).toBe('4.0–4.1');
    expect(formatRange(4.012, 4.038)).toBe('4.01–4.04'); // both round to 4.0
  });
});

describe('renderBadge', () => {
  it('shows a range-only badge right after Amazon\'s rating (many ratings)', () => {
    const { doc, result } = badgeFor('product-many');
    const badge = doc.getElementById(BADGE_ID);
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toMatch(/^likely \d\.\d{1,2}–\d\.\d{1,2}$/);
    expect(badge?.previousElementSibling?.id).toBe('acrPopover');
    expect(badge?.getAttribute('title')).toBe(result.explanation);
    expect(badge?.getAttribute('data-sufficiency')).toBe('ok');
  });

  it('marks fewer than 30 ratings as low data', () => {
    const { doc } = badgeFor('product-few');
    const badge = doc.getElementById(BADGE_ID);
    expect(badge?.textContent).toMatch(/^likely \d\.\d–\d\.\d · low data$/);
    expect(badge?.getAttribute('data-sufficiency')).toBe('low');
  });

  it('is hidden when the product has no ratings', () => {
    const { doc } = badgeFor('product-none');
    expect(doc.getElementById(BADGE_ID)).toBeNull();
  });

  it('does not duplicate when rendered twice, and is removed when data disappears', () => {
    const { doc, url } = loadFixture('product-46');
    const snap = extractProduct(doc, url);
    const result = ratingInterval(snap.ratingDistribution, snap.ratingCount);
    renderBadge(doc, result);
    renderBadge(doc, result);
    expect(doc.querySelectorAll(`#${BADGE_ID}`)).toHaveLength(1);
    renderBadge(doc, ratingInterval(null, null));
    expect(doc.getElementById(BADGE_ID)).toBeNull();
  });
});
