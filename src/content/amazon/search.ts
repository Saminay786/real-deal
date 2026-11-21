// Pipeline C (v2): search results. Reads each result card, adds a score badge, and
// can reorder the cards on the current page only (no fetching of other pages).

import { debug } from '../../debug';
import { rankingScore } from '../../stats/rating';
import type { SearchResult } from '../../types';
import { parseCount } from './extract';
import { SEARCH } from './selectors';

function first(root: ParentNode, selectors: readonly string[]): Element | null {
  for (const s of selectors) {
    try {
      const el = root.querySelector(s);
      if (el) return el;
    } catch {
      debug('bad selector', s);
    }
  }
  return null;
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() || null;

/** "₹1,299" / "₹9.35" → 1299 / 9.35 */
export function parsePrice(s: string | null): number | null {
  const m = s?.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m?.[1] ? Number(m[1]) : null;
}

/** Rating and count from the card's aria-labels ("4.0 out of 5 stars…", "3,727 ratings"). */
function ratingOf(card: Element): { rating: number | null; count: number | null } {
  let rating: number | null = null;
  let count: number | null = null;
  for (const el of card.querySelectorAll('[aria-label]')) {
    const label = el.getAttribute('aria-label') ?? '';
    if (rating === null) {
      const m = label.match(/(\d(?:\.\d)?) out of 5 stars/i);
      if (m?.[1]) rating = Number(m[1]);
    }
    if (count === null) {
      const c = label.match(/^\s*([\d,]+)\s+ratings?\s*$/i) ?? label.match(/by ([\d,]+) reviews?/i);
      if (c?.[1]) count = parseCount(c[1]);
    }
    if (rating !== null && count !== null) break;
  }
  return { rating, count };
}

export function searchCards(doc: ParentNode): Element[] {
  for (const s of SEARCH.card) {
    const cards = [...doc.querySelectorAll(s)].filter((c) => (c.getAttribute('data-asin') ?? '').length === 10);
    if (cards.length) return cards;
  }
  return [];
}

/** Never throws; missing fields are null. */
export function extractSearchResults(doc: ParentNode): SearchResult[] {
  return searchCards(doc).map((card, position) => {
    try {
      const { rating, count } = ratingOf(card);
      const href = first(card, SEARCH.link)?.getAttribute('href') ?? null;
      return {
        asin: card.getAttribute('data-asin'),
        title: clean(first(card, SEARCH.title)?.textContent),
        url: href ? new URL(href, 'https://www.amazon.in').href : null,
        rating,
        ratingCount: count,
        price: parsePrice(first(card, SEARCH.price)?.textContent ?? null),
        sponsored: card.classList.contains(SEARCH.sponsoredCardClass) || first(card, SEARCH.sponsored) !== null,
        position,
      };
    } catch (e) {
      debug('search card error', e);
      return { asin: card.getAttribute('data-asin'), title: null, url: null, rating: null, ratingCount: null, price: null, sponsored: false, position };
    }
  });
}

// ---------------------------------------------------------------- badges

export const SCORE_BADGE_CLASS = 'real-deal-score';

export function renderScoreBadges(doc: Document): void {
  const results = extractSearchResults(doc);
  searchCards(doc).forEach((card, i) => {
    const r = results[i];
    if (!r) return;
    const s = rankingScore(r.rating, r.ratingCount);
    let badge = card.querySelector(`.${SCORE_BADGE_CLASS}`) as HTMLElement | null;
    if (!badge) {
      badge = doc.createElement('div');
      badge.className = SCORE_BADGE_CLASS;
      // The h2 sits inside a line-clamped <a>; a badge placed there is clipped out of
      // view (DECISIONS #53). Put it after the whole title block instead.
      const title = first(card, SEARCH.title);
      const block = title?.closest('[data-cy="title-recipe"]') ?? title?.closest('a') ?? title;
      if (block && block.parentElement) block.insertAdjacentElement('afterend', badge);
      else card.appendChild(badge);
    }
    const text = s.value
      ? `Real Deal score ${s.value.score.toFixed(2)}${s.dataSufficiency === 'low' ? ' · few ratings' : ''}${r.sponsored ? ' · sponsored' : ''}`
      : `Real Deal: no ratings yet${r.sponsored ? ' · sponsored' : ''}`;
    // Write only on change, so the observer that re-adds badges cannot loop.
    if (badge.textContent === text) return;
    badge.textContent = text;
    badge.setAttribute('title', s.explanation);
    badge.setAttribute(
      'style',
      'display:inline-block;margin:4px 0;padding:1px 8px;border-radius:10px;font-size:12px;line-height:18px;' +
        'border:1px solid #8a8f98;background:#f4f6f8;color:#1f2328;cursor:help',
    );
  });
}

// ---------------------------------------------------------------- reorder (this page only)

const POS_ATTR = 'data-rd-pos';

/**
 * Orders cards by score (highest first; cards without a score keep their order at the
 * end) or restores Amazon's order. Non-card elements (banners, widgets) stay where
 * they are: cards are swapped through the slots they originally occupied.
 */
export function reorderCards(doc: Document, byScore: boolean): number {
  const cards = searchCards(doc);
  cards.forEach((c, i) => {
    if (!c.hasAttribute(POS_ATTR)) c.setAttribute(POS_ATTR, String(i));
  });
  const results = extractSearchResults(doc);
  const scoreOf = new Map(cards.map((c, i) => [c, rankingScore(results[i]?.rating ?? null, results[i]?.ratingCount ?? null).value?.score ?? null]));
  const pos = (c: Element) => Number(c.getAttribute(POS_ATTR));
  const target = [...cards].sort((a, b) => {
    if (!byScore) return pos(a) - pos(b);
    const sa = scoreOf.get(a) ?? null;
    const sb = scoreOf.get(b) ?? null;
    if (sa === null && sb === null) return pos(a) - pos(b);
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sb - sa || pos(a) - pos(b);
  });
  // Swap through placeholders so the slots (and anything between them) stay put.
  const slots = cards.map((c) => {
    const ph = doc.createComment('rd-slot');
    c.parentNode?.insertBefore(ph, c);
    return ph;
  });
  slots.forEach((ph, i) => {
    const card = target[i];
    if (card) ph.parentNode?.replaceChild(card, ph);
  });
  return cards.length;
}
