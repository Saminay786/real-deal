import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';

describe('normalizeSettings', () => {
  it('defaults: badge on, search scores on, debug off', () => {
    expect(normalizeSettings(undefined)).toEqual({ showBadge: true, showSearchScores: true, debug: false });
    expect(DEFAULT_SETTINGS).toEqual({ showBadge: true, showSearchScores: true, debug: false });
  });

  it('keeps valid values and repairs invalid ones', () => {
    expect(normalizeSettings({ showBadge: false, debug: true })).toEqual({ showBadge: false, showSearchScores: true, debug: true });
    expect(normalizeSettings({ showBadge: 'no', debug: 1 })).toEqual({ showBadge: true, showSearchScores: true, debug: false });
    expect(normalizeSettings('garbage')).toEqual({ showBadge: true, showSearchScores: true, debug: false });
  });

  it('turning the rating badge off does not hide search scores (DECISIONS #52)', () => {
    expect(normalizeSettings({ showBadge: false }).showSearchScores).toBe(true);
  });
});
