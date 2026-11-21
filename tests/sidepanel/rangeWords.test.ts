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
