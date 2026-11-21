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
  /** Reviews collected since the last analysis (0 if none or never analysed). */
  newSinceAnalysis: number;
}

export type Decision =
  | { kind: 'no-product' }
  | { kind: 'open-reviews' }
  | { kind: 'load-view'; canAnalyse: boolean }
  | { kind: 'loading' }
  | { kind: 'open-next' }
  | { kind: 'find-themes'; more: 'open-next' | null }
  | { kind: 'analysing' }
  | { kind: 'rerun'; newReviews: number }
  | { kind: 'done' };

/**
 * Order matters (DECISIONS #34): an unfinished review page always offers
 * "Load", even after an analysis, because the user opened it to collect.
 */
export function decideStep(s: StepInput): Decision {
  if (!s.hasProduct) return { kind: 'no-product' };
  if (s.themes === 'running') return { kind: 'analysing' };
  if (s.loadRunning) return { kind: 'loading' };
  const viewUnfinished = s.currentView === 'todo' || s.currentView === 'partial';
  if (s.onReviewsPage && viewUnfinished) return { kind: 'load-view', canAnalyse: s.minimumMet };
  if (s.themes === 'done') {
    return s.newSinceAnalysis > 0 ? { kind: 'rerun', newReviews: s.newSinceAnalysis } : { kind: 'done' };
  }
  if (s.minimumMet) return { kind: 'find-themes', more: s.nextViewLabel ? 'open-next' : null };
  if (!s.onReviewsPage) return { kind: 'open-reviews' };
  if (s.nextViewLabel) return { kind: 'open-next' };
  // Nothing left to collect and still below the minimum: the analysis will say so.
  return { kind: 'find-themes', more: null };
}
