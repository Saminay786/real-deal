// Pipeline A badge: "likely 3.7–4.6" next to Amazon's star rating.
// Shows only the range (Amazon's own average sits right beside it). Hidden when data is missing.

import type { RatingInterval } from '../../stats/rating';
import type { StatResult } from '../../types';
import { PRODUCT } from './selectors';

export const BADGE_ID = 'real-deal-rating-badge';

/** One decimal, or two if one decimal would show a zero-width range like "4.0–4.0". */
export function formatRange(lo: number, hi: number): string {
  const d = lo.toFixed(1) === hi.toFixed(1) ? 2 : 1;
  return `${lo.toFixed(d)}–${hi.toFixed(d)}`;
}

export function badgeText(result: StatResult<RatingInterval>): string | null {
  if (!result.value) return null;
  const range = `likely ${formatRange(result.value.lo, result.value.hi)}`;
  return result.dataSufficiency === 'low' ? `${range} · low data` : range;
}

export function renderBadge(doc: Document, result: StatResult<RatingInterval>): void {
  const existing = doc.getElementById(BADGE_ID);
  const label = badgeText(result);
  if (label === null) {
    existing?.remove();
    return;
  }
  let anchor: Element | null = null;
  for (const sel of PRODUCT.badgeAnchor) {
    anchor = doc.querySelector(sel);
    if (anchor) break;
  }
  if (!anchor) {
    existing?.remove();
    return;
  }

  const badge = existing ?? doc.createElement('span');
  badge.id = BADGE_ID;
  badge.textContent = label;
  badge.setAttribute('title', result.explanation);
  badge.setAttribute('data-sufficiency', result.dataSufficiency);
  const low = result.dataSufficiency === 'low';
  badge.setAttribute(
    'style',
    [
      'display:inline-block',
      'margin-left:8px',
      'padding:1px 8px',
      'border-radius:10px',
      'font-size:12px',
      'line-height:18px',
      'vertical-align:middle',
      'cursor:help',
      `border:1px ${low ? 'dashed' : 'solid'} #8a8f98`,
      'background:#f4f6f8',
      'color:#1f2328',
    ].join(';'),
  );
  if (badge.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', badge);
}
