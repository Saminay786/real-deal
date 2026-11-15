import { describe, expect, it } from 'vitest';
import { isNonEnglish, reviewSentences, splitSentences } from '../../src/themes/sentences';

describe('splitSentences', () => {
  it('splits on punctuation and line breaks, dropping fragments under 3 words', () => {
    // From fixture reviews-a-p1 (R3RST0O7ZS3260)
    expect(splitSentences('A terribly flimsy hook. I hung a calendar and a plastic colander on the wall, but it couldn’t hold them.')).toEqual([
      'A terribly flimsy hook.',
      'I hung a calendar and a plastic colander on the wall, but it couldn’t hold them.',
    ]);
    expect(splitSentences('Sorry to say there was only 18 numbers sticker instead of 20\n12 unused\n5 in panels of three')).toEqual([
      'Sorry to say there was only 18 numbers sticker instead of 20',
      '5 in panels of three', // "12 unused" has 2 words → dropped
    ]);
    expect(splitSentences('Good')).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
  });

  it('splits run-together sentences but not decimals', () => {
    expect(splitSentences('Strong hold for days.Then it fell off the wall!Very sad indeed')).toEqual([
      'Strong hold for days.',
      'Then it fell off the wall!',
      'Very sad indeed',
    ]);
    expect(splitSentences('It holds 2.5 kg easily on tiles')).toEqual(['It holds 2.5 kg easily on tiles']);
  });
});

describe('isNonEnglish', () => {
  it('flags Hindi script and romanised Hindi', () => {
    // The 1★ drawer-mat review seen on 2026-11-15
    expect(isNonEnglish('Third class product.QUALITY LOOKS LIKE A LOCAL ITEM.WAPAS NAHI HOGA ISLIYE SOCH SAMAJH KAR KHARIDANA')).toBe(true);
    expect(isNonEnglish('product bahut accha hai, paisa vasool')).toBe(true);
    expect(isNonEnglish('यह उत्पाद बहुत अच्छा है')).toBe(true);
  });

  it('keeps English, including words that are also Hindi', () => {
    expect(isNonEnglish('Does not stick on walls at all.')).toBe(false);
    expect(isNonEnglish('Send it to me so I can return it')).toBe(false);
    expect(isNonEnglish('The hook fell off the wall after two days')).toBe(false);
  });
});

describe('reviewSentences', () => {
  it('includes titles, drops non-English sentences, and flags all-Hinglish reviews', () => {
    const r = reviewSentences([
      { reviewId: 'R1', title: 'Not for walls', body: 'Does not stick on walls at all. Very poor performance.' },
      { reviewId: 'R2', title: 'DO NOT BUY', body: 'WAPAS NAHI HOGA ISLIYE SOCH SAMAJH KAR KHARIDANA. KOI WAPAS LENE NAHI AAYEGA' },
      { reviewId: 'R3', title: 'Good', body: 'Nice' },
    ]);
    expect(r.sentences).toEqual([
      { reviewId: 'R1', index: 0, text: 'Not for walls' },
      { reviewId: 'R1', index: 1, text: 'Does not stick on walls at all.' },
      { reviewId: 'R1', index: 2, text: 'Very poor performance.' },
      { reviewId: 'R2', index: 0, text: 'DO NOT BUY' },
    ]);
    // R2 still has one English sentence ("DO NOT BUY"), so it is not excluded; R3 has no sentence at all.
    expect([...r.nonEnglish]).toEqual([]);
    const only = reviewSentences([{ reviewId: 'R9', title: null, body: 'Bahut bekar hai yeh. Paisa barbaad ho gaya' }]);
    expect([...only.nonEnglish]).toEqual(['R9']);
  });
});
