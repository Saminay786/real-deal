import { afterEach, describe, expect, it } from 'vitest';
import {
  allowedNumbers,
  applyLabels,
  buildLabelPrompt,
  buildNarrativeInput,
  enrichWithNano,
  nanoAvailability,
  parseLabels,
  templateSummary,
  validateSummary,
  withoutNano,
  type NanoSession,
} from '../../src/ai/label';
import type { ThemeAnalysis } from '../../src/themes/analyze';
import type { ShiftResult, Theme } from '../../src/types';

const theme = (id: number, terms: string[], samples: string[], meanRating: number): Theme => ({
  id,
  label: terms.join(', '),
  labelSource: 'ctfidf',
  topTerms: terms,
  size: samples.length,
  samples,
  meanRating,
});

const THEMES: Theme[] = [
  theme(0, ['received', 'ordered', 'qty'], ['I received 9 pics instead of 10', 'Received less qty'], 2.1),
  theme(1, ['paint', 'wall', 'walls'], ['While removing it peels of the paint from the wall'], 2.4),
];

function shift(themeId: number, label: string, b: [number, number], a: [number, number], significant: boolean): ShiftResult {
  return {
    themeId,
    label,
    changeAt: '2026-10-01',
    before: { n: b[0], k: b[1], share: b[1] / b[0] },
    after: { n: a[0], k: a[1], share: a[1] / a[0] },
    diff: a[1] / a[0] - b[1] / b[0],
    diffCi: [0, 0],
    pValue: significant ? 0.004 : 0.093,
    qValue: significant ? 0.02 : 0.393,
    significant,
    exemplars: { before: [], after: [] },
  };
}

/** 106 reviews, Jul–Nov 2026, split 60 / 46 at Oct 2026. */
function analysis(quantityChanged: boolean): ThemeAnalysis {
  const buckets = (k1: number, k2: number) => [
    { start: '2026-07-01', end: '2026-09-30', n: 60, k: k1, share: k1 / 60, ci: [0, 1] as [number, number] },
    { start: '2026-10-01', end: '2026-11-30', n: 46, k: k2, share: k2 / 46, ci: [0, 1] as [number, number] },
  ];
  return {
    themes: THEMES,
    series: [
      { themeId: 0, buckets: buckets(3, 8) },
      { themeId: 1, buckets: buckets(20, 15) },
    ],
    shifts: [
      shift(0, 'received, ordered, qty', [60, 3], [46, 8], quantityChanged),
      shift(1, 'paint, wall, walls', [60, 20], [46, 15], false),
    ],
    analysedReviews: 106,
    nonEnglishReviews: 1,
    sentences: 202,
    stratified: false,
    dataSufficiency: 'ok',
    explanation: '',
  };
}

describe('nanoAvailability', () => {
  const g = globalThis as { LanguageModel?: unknown };
  afterEach(() => {
    delete g.LanguageModel;
  });

  it('is "unsupported" without the Prompt API', async () => {
    expect(await nanoAvailability()).toBe('unsupported');
  });

  it('passes through the browser answer and maps errors to "unavailable"', async () => {
    g.LanguageModel = { availability: () => Promise.resolve('downloadable'), create: () => Promise.reject(new Error()) };
    expect(await nanoAvailability()).toBe('downloadable');
    g.LanguageModel = { availability: () => Promise.reject(new Error('boom')), create: () => Promise.reject(new Error()) };
    expect(await nanoAvailability()).toBe('unavailable');
  });
});

describe('labels', () => {
  it('prompt lists every theme with keywords, mean stars and samples', () => {
    const p = buildLabelPrompt(THEMES);
    expect(p).toContain('Theme 0');
    expect(p).toContain('keywords: received, ordered, qty');
    expect(p).toContain('average star rating of these reviews: 2.1');
    expect(p).toContain('- I received 9 pics instead of 10');
    expect(p).toContain('Theme 1');
  });

  it('accepts valid labels and drops anything it cannot verify', () => {
    const raw = JSON.stringify({
      themes: [
        { id: 0, label: '“Missing pieces in the box”', sentiment: 'negative' },
        { id: 0, label: 'Duplicate id', sentiment: 'negative' }, // duplicate → dropped
        { id: 7, label: 'Unknown theme', sentiment: 'negative' }, // unknown id → dropped
        { id: 1, label: 'x'.repeat(41), sentiment: 'negative' }, // too long → dropped
      ],
    });
    expect(parseLabels(raw, THEMES)).toEqual([{ themeId: 0, label: 'Missing pieces in the box', sentiment: 'negative' }]);
    expect(parseLabels('{"themes":[{"id":1,"label":"Peels paint","sentiment":"angry"}]}', THEMES)).toEqual([]);
    expect(parseLabels('not json', THEMES)).toEqual([]);
  });

  it('applies labels only where valid', () => {
    const out = applyLabels(THEMES, [{ themeId: 1, label: 'Peels paint off walls', sentiment: 'negative' }]);
    expect(out[0]).toEqual(THEMES[0]);
    expect(out[1]).toMatchObject({ label: 'Peels paint off walls', labelSource: 'nano', sentiment: 'negative' });
  });
});

describe('summary facts', () => {
  it('builds the narrative input from the analysis (hand-computed)', () => {
    // Quantity: overall (3 + 8)/106 = 10.4% → 10; before 3/60 = 5%; after 8/46 = 17.4% → 17
    // Paint:    overall (20 + 15)/106 = 33.0% → 33; before 20/60 = 33.3% → 33; after 15/46 = 32.6% → 33
    expect(buildNarrativeInput(analysis(true))).toEqual({
      reviews: 106,
      period: 'Jul 2026 to Nov 2026',
      themes: [
        { label: 'received, ordered, qty', mentionedPct: 10, changed: true, beforePct: 5, afterPct: 17, from: 'Oct 2026' },
        { label: 'paint, wall, walls', mentionedPct: 33, changed: false, beforePct: 33, afterPct: 33, from: 'Oct 2026' },
      ],
    });
  });

  it('allows exactly the numbers in the input', () => {
    const allowed = allowedNumbers(buildNarrativeInput(analysis(true)));
    for (const n of ['106', '2026', '10', '5', '17', '33', '3']) expect(allowed.has(n)).toBe(true);
    expect(allowed.has('18')).toBe(false);
  });
});

describe('validateSummary', () => {
  const changed = buildNarrativeInput(analysis(true));
  const none = buildNarrativeInput(analysis(false));

  it('accepts a faithful summary', () => {
    expect(validateSummary('Mentions of missing pieces rose from 5% to 17% of reviews from Oct 2026. Paint damage stayed at about 33%.', changed)).toBe(true);
  });

  it('rejects invented or altered numbers', () => {
    expect(validateSummary('Mentions of missing pieces rose from 5% to 18% of reviews.', changed)).toBe(false); // 18 not in input
    expect(validateSummary('Complaints doubled in 2 months.', changed)).toBe(false);
  });

  it('rejects more than 3 sentences and the word "fake"', () => {
    expect(validateSummary('One. Two. Three. Four.', changed)).toBe(false);
    expect(validateSummary('Some reviews look fake.', changed)).toBe(false);
  });

  it('rejects a claimed rise or fall when no theme changed', () => {
    expect(validateSummary('Paint complaints rose after Oct 2026.', none)).toBe(false);
    expect(validateSummary('No theme changed clearly over Jul 2026 to Nov 2026 across 106 reviews.', none)).toBe(true);
  });
});

describe('templateSummary', () => {
  it('reports significant shifts', () => {
    expect(templateSummary(buildNarrativeInput(analysis(true)))).toBe(
      'Mentions of "received, ordered, qty" rose from 5% to 17% of reviews from Oct 2026. Based only on the reviews you viewed.',
    );
  });

  it('says "no clear change" and names the most discussed themes otherwise', () => {
    expect(templateSummary(buildNarrativeInput(analysis(false)))).toBe(
      'No theme changed clearly from Jul 2026 to Nov 2026 (106 reviews). ' +
        'Most discussed: "paint, wall, walls" (33%) and "received, ordered, qty" (10%). Based only on the reviews you viewed.',
    );
  });

  it('always passes its own validation', () => {
    for (const a of [analysis(true), analysis(false)]) {
      const input = buildNarrativeInput(a);
      expect(validateSummary(templateSummary(input), input)).toBe(true);
    }
  });
});

describe('enrichWithNano', () => {
  function fakeSession(answers: (string | Error)[]): NanoSession & { prompts: string[] } {
    const prompts: string[] = [];
    return {
      prompts,
      prompt(input) {
        prompts.push(input);
        const a = answers.shift();
        return a instanceof Error || a === undefined ? Promise.reject(a ?? new Error('no answer')) : Promise.resolve(a);
      },
      destroy() {},
    };
  }

  it('uses AI labels and an AI summary when both validate', async () => {
    const s = fakeSession([
      JSON.stringify({
        themes: [
          { id: 0, label: 'Missing pieces in the box', sentiment: 'negative' },
          { id: 1, label: 'Peels paint off walls', sentiment: 'negative' },
        ],
      }),
      JSON.stringify({ summary: 'Mentions of missing pieces rose from 5% to 17% of reviews from Oct 2026.' }),
    ]);
    const r = await enrichWithNano(analysis(true), s);
    expect(r.labelsApplied).toBe(2);
    expect(r.themes[0]?.label).toBe('Missing pieces in the box');
    expect(r.summarySource).toBe('nano');
    // The summary prompt sees the AI labels and only the facts JSON, never raw reviews.
    expect(s.prompts[1]).toContain('"label":"Missing pieces in the box"');
    expect(s.prompts[1]).not.toContain('I received 9 pics');
  });

  it('falls back to the template when the AI invents a number', async () => {
    const s = fakeSession(['{"themes":[]}', JSON.stringify({ summary: 'Missing pieces rose to 25% of reviews.' })]);
    const r = await enrichWithNano(analysis(true), s);
    expect(r.summarySource).toBe('template');
    expect(r.summary).toBe(withoutNano(analysis(true)).summary);
    expect(r.rejected).toEqual({ draft: 'Missing pieces rose to 25% of reviews.', reason: 'number 25 is not in the test results' });
  });

  it('explains a rejected "fell" when nothing changed', async () => {
    const s = fakeSession(['{"themes":[]}', JSON.stringify({ summary: 'Value for Money fell from 33% to 33%.' })]);
    const r = await enrichWithNano(analysis(false), s);
    expect(r.rejected?.reason).toBe('says "fell" although no theme changed significantly');
  });

  it('keeps keyword labels and the template when the AI fails entirely', async () => {
    const r = await enrichWithNano(analysis(false), fakeSession([new Error('model crashed'), new Error('again')]));
    expect(r.labelsApplied).toBe(0);
    expect(r.themes).toEqual(THEMES);
    expect(r.summarySource).toBe('template');
  });
});
