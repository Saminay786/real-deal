import { describe, expect, it } from 'vitest';
import { rangeWords } from '../../src/sidepanel/ThemeChange';

describe('rangeWords (plain-language range, DECISIONS #38)', () => {
  it('reads a range that crosses zero', () => {
    expect(rangeWords(-6, 24)).toBe('from a 6-point drop to a 24-point rise');
  });
  it('reads ranges on one side of zero, and zero itself', () => {
    expect(rangeWords(3, 20)).toBe('from a 3-point rise to a 20-point rise');
    expect(rangeWords(-13, -2)).toBe('from a 13-point drop to a 2-point drop');
    expect(rangeWords(0, 8)).toBe('from no change to an 8-point rise');
  });
  it('uses "an" before 8, 11, 18 and 80s', () => {
    expect(rangeWords(-11, 18)).toBe('from an 11-point drop to an 18-point rise');
    expect(rangeWords(-1, 83)).toBe('from a 1-point drop to an 83-point rise');
    expect(rangeWords(-12, 28)).toBe('from a 12-point drop to a 28-point rise');
  });
});

import { verdictOf } from '../../src/sidepanel/ThemeChange';
import type { ShiftResult } from '../../src/types';

const shift = (significant: boolean, ci: [number, number]): ShiftResult => ({
  themeId: 0,
  label: 'x',
  changeAt: '2026-03-01',
  before: { n: 75, k: 9, share: 0.12 },
  after: { n: 30, k: 1, share: 0.03 },
  diff: -0.09,
  diffCi: ci,
  pValue: significant ? 0.004 : 0.51,
  qValue: significant ? 0.02 : 0.893,
  significant,
  exemplars: { before: [], after: [] },
});

describe('verdictOf (DECISIONS #41)', () => {
  it('the test decides "Real change"; otherwise the range decides between luck and not proven', () => {
    expect(verdictOf(shift(true, [-0.18, -0.02]))).toBe('real');
    expect(verdictOf(shift(false, [-0.18, 0.06]))).toBe('luck'); // box crosses 0 (Timex "Customer appreciation")
    expect(verdictOf(shift(false, [-0.13, -0.02]))).toBe('not-proven'); // box misses 0 but q > 0.10
  });
});

import { per100 } from '../../src/sidepanel/ThemeChange';

describe('per100 (DECISIONS #43–#44)', () => {
  it('turns a point range into "out of every 100 reviews"', () => {
    // Product quality: 40% before, range −26 … +10 → 14 to 50 instead of 40
    expect(per100(0.4, -26, 10)).toBe('out of every 100 reviews, 14 to 50 instead of 40');
    // clamps at 0 and 100
    expect(per100(0.05, -9, 22)).toBe('out of every 100 reviews, 0 to 27 instead of 5');
  });
});
