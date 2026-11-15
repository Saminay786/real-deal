// Messages between content script, service worker and side panel.

import type { ReviewView } from './collect/views';
import type { LoadEnd } from './content/amazon/loader';
import type { Review } from './types';

/** Content script -> service worker: reviews seen on the page. */
export interface ReviewsSeenMessage {
  type: 'rd:reviews-seen';
  asin: string;
  /** Sort/filter combination the reviews were seen in. */
  view: ReviewView;
  /** "N customer reviews" shown for this view (smaller when filtered). */
  viewTotal: number | null;
  reviews: Review[];
}

/** Service worker -> side panel: stored reviews for `asin` changed. */
export interface CollectionUpdatedMessage {
  type: 'rd:collection-updated';
  asin: string;
}

/** Side panel -> content script (tabs.sendMessage): start / stop "Load this view". */
export interface LoadViewCommand {
  type: 'rd:load-view' | 'rd:stop-load';
}

/** Content script -> side panel: loader progress. */
export interface LoadProgressMessage {
  type: 'rd:load-progress';
  asin: string;
  loaded: number;
  running: boolean;
  end: LoadEnd | null;
}

const obj = (m: unknown): m is Record<string, unknown> => typeof m === 'object' && m !== null;

export function isReviewsSeen(m: unknown): m is ReviewsSeenMessage {
  return obj(m) && m.type === 'rd:reviews-seen' && typeof m.asin === 'string' && Array.isArray(m.reviews) && obj(m.view);
}

export function isCollectionUpdated(m: unknown): m is CollectionUpdatedMessage {
  return obj(m) && m.type === 'rd:collection-updated' && typeof m.asin === 'string';
}

export function isLoadCommand(m: unknown): m is LoadViewCommand {
  return obj(m) && (m.type === 'rd:load-view' || m.type === 'rd:stop-load');
}

export function isLoadProgress(m: unknown): m is LoadProgressMessage {
  return obj(m) && m.type === 'rd:load-progress' && typeof m.asin === 'string';
}
