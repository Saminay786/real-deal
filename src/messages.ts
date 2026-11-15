// Messages between content script, service worker and side panel.

import type { Review } from './types';

/** Content script -> service worker: reviews seen on the page. */
export interface ReviewsSeenMessage {
  type: 'rd:reviews-seen';
  asin: string;
  totalReviews: number | null;
  reviews: Review[];
}

/** Service worker -> side panel: stored reviews for `asin` changed. */
export interface CollectionUpdatedMessage {
  type: 'rd:collection-updated';
  asin: string;
}

export type Message = ReviewsSeenMessage | CollectionUpdatedMessage;

export function isMessage(m: unknown): m is Message {
  if (typeof m !== 'object' || m === null) return false;
  const t = (m as { type?: unknown }).type;
  const asin = (m as { asin?: unknown }).asin;
  if (typeof asin !== 'string') return false;
  if (t === 'rd:collection-updated') return true;
  return t === 'rd:reviews-seen' && Array.isArray((m as { reviews?: unknown }).reviews);
}
