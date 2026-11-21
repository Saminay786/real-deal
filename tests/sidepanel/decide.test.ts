import { describe, expect, it } from 'vitest';
import { decideStep, type StepInput } from '../../src/sidepanel/decide';

const base: StepInput = {
  hasProduct: true,
  onReviewsPage: true,
  minimumMet: false,
  usableReviews: 10,
  reviewsNeeded: 90,
  monthsNeeded: 2,
  currentView: 'partial',
  nextViewLabel: 'Most recent · 5★',
  loadRunning: false,
  themes: 'idle',
};

describe('decideStep', () => {
  it('asks to open a product when none is open', () => {
    expect(decideStep({ ...base, hasProduct: false })).toEqual({ kind: 'no-product' });
  });

  it('on a product page below the minimum: open the reviews', () => {
    expect(decideStep({ ...base, onReviewsPage: false, currentView: null })).toEqual({ kind: 'open-reviews' });
  });

  it('on an unfinished review page: load it; while loading: show progress', () => {
    expect(decideStep(base)).toEqual({ kind: 'load-view' });
    expect(decideStep({ ...base, currentView: 'todo' })).toEqual({ kind: 'load-view' });
    expect(decideStep({ ...base, loadRunning: true })).toEqual({ kind: 'loading' });
  });

  it('when this view hit Amazon’s 100 and more are needed: open the next view', () => {
    expect(decideStep({ ...base, currentView: 'capped' })).toEqual({ kind: 'open-next' });
    expect(decideStep({ ...base, currentView: 'complete' })).toEqual({ kind: 'open-next' });
  });

  it('once the minimum is met: find themes, with collecting more as an option', () => {
    const met = { ...base, minimumMet: true, reviewsNeeded: 0, monthsNeeded: 0 };
    expect(decideStep(met)).toEqual({ kind: 'find-themes', more: 'load-here' });
    expect(decideStep({ ...met, currentView: 'capped' })).toEqual({ kind: 'find-themes', more: 'open-next' });
    expect(decideStep({ ...met, currentView: 'capped', nextViewLabel: null })).toEqual({ kind: 'find-themes', more: null });
    expect(decideStep({ ...met, onReviewsPage: false, currentView: null })).toEqual({ kind: 'find-themes', more: 'open-next' });
  });

  it('while analysing, and when done', () => {
    expect(decideStep({ ...base, themes: 'running' })).toEqual({ kind: 'analysing' });
    expect(decideStep({ ...base, minimumMet: true, themes: 'done' })).toEqual({ kind: 'done' });
  });

  it('all views used but still below the minimum: let the analysis explain', () => {
    expect(decideStep({ ...base, currentView: 'capped', nextViewLabel: null })).toEqual({ kind: 'find-themes', more: null });
  });
});
