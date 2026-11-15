import { describe, expect, it } from 'vitest';
import { ctfidf, tokenize } from '../../src/themes/ctfidf';

describe('tokenize', () => {
  it('lowercases, drops stop words, short words and apostrophes', () => {
    expect(tokenize("It doesn't stick to the wall, I'm sad!")).toEqual(['stick', 'wall', 'sad']);
  });
});

describe('ctfidf', () => {
  it('matches hand computation', () => {
    // Class 0: "glue weak glue", "wall glue"  → tf: glue 3, weak 1, wall 1  (5 words)
    // Class 1: "price great", "great value"   → tf: price 1, great 2, value 1 (4 words)
    // f: glue 3, weak 1, wall 1, price 1, great 2, value 1; total 9 words, A = 9/2 = 4.5
    // w(glue, 0) = 3·ln(1 + 4.5/3) = 3·ln 2.5 = 2.748872
    // w(weak, 0) = w(wall, 0) = 1·ln(1 + 4.5) = ln 5.5 = 1.704748
    // w(great, 1) = 2·ln(1 + 4.5/2) = 2·ln 3.25 = 2·1.178655 = 2.357310
    // w(price, 1) = w(value, 1) = ln 5.5 = 1.704748
    const r = ctfidf([
      ['glue weak glue', 'wall glue'],
      ['price great', 'great value'],
    ]);
    expect(r[0]?.terms).toEqual(['glue', 'wall', 'weak']); // ties broken alphabetically
    expect(r[0]?.weights[0]).toBeCloseTo(2.748872, 5);
    expect(r[0]?.weights[1]).toBeCloseTo(1.704748, 5);
    expect(r[1]?.terms).toEqual(['great', 'price', 'value']);
    expect(r[1]?.weights[0]).toBeCloseTo(2.35731, 5);
  });

  it('down-weights words common to all classes', () => {
    // "hook" appears equally in both classes, so it should not lead either label.
    const r = ctfidf([
      ['hook fell', 'hook fell off', 'hook adhesive weak'],
      ['hook strong', 'hook holds', 'hook strong holds'],
    ]);
    expect(r[0]?.terms[0]).toBe('fell');
    expect(r[1]?.terms[0]).not.toBe('hook');
  });
});
