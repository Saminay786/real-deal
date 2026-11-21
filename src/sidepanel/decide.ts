// Pure: decides the single next step shown in the side panel's top bar.

import type { ViewStatus } from '../collect/views';

export interface StepInput {
  hasProduct: boolean;
  onReviewsPage: boolean;
  minimumMet: boolean;
  usableReviews: number;
  reviewsNeeded: number;
  monthsNeeded: number;
  /** Status of the view open in the tab (null when not on a review page). */
  currentView: ViewStatus | null;
  /** Label of the next planned view to open, or null when none is left. */
  nextViewLabel: string | null;
  loadRunning: boolean;
  themes: 'idle' | 'running' | 'done' | 'error';
}

export type Decision =
  | { kind: 'no-product' }
  | { kind: 'open-reviews' }
  | { kind: 'load-view' }
  | { kind: 'loading' }
  | { kind: 'open-next' }
  | { kind: 'find-themes'; more: 'load-here' | 'open-next' | null }
  | { kind: 'analysing' }
  | { kind: 'done' };

export function decideStep(s: StepInput): Decision {
  if (!s.hasProduct) return { kind: 'no-product' };
  if (s.themes === 'running') return { kind: 'analysing' };
  if (s.loadRunning) return { kind: 'loading' };
  if (s.themes === 'done') return { kind: 'done' };
  const viewUnfinished = s.currentView === 'todo' || s.currentView === 'partial';

  if (s.minimumMet) {
    // Enough to analyse; collecting more is optional.
    const more = s.onReviewsPage && viewUnfinished ? 'load-here' : s.nextViewLabel ? 'open-next' : null;
    return { kind: 'find-themes', more };
  }
  if (!s.onReviewsPage) return { kind: 'open-reviews' };
  if (viewUnfinished) return { kind: 'load-view' };
  if (s.nextViewLabel) return { kind: 'open-next' };
  // Nothing left to collect and still below the minimum: analysis will say so.
  return { kind: 'find-themes', more: null };
}
