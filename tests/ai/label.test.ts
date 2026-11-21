import { afterEach, describe, expect, it } from 'vitest';
import {
  allowedNumbers,
  applyLabels,
  buildLabelPrompt,
  buildNarrativeInput,
  enrichWithNano,
  nanoAvailability,
  firstSentences,
  parseLabels,
  parsePlainSummary,
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
  it('prompt identifies every theme by its keywords (no numbers), with mean stars and samples', () => {
    const p = buildLabelPrompt(THEMES);
    expect(p).toContain('- keywords: received, ordered, qty');
    expect(p).toContain('- keywords: paint, wall, walls');
    expect(p).toContain('average star rating of these reviews: 2.1');
    expect(p).toContain('* I received 9 pics instead of 10');
    expect(p).not.toMatch(/Theme \d/);
  });

  it('matches labels to themes by copied keywords and drops anything it cannot verify', () => {
    const raw = JSON.stringify({
      themes: [
        { keywords: 'Received, Ordered, "qty"', label: '“Missing pieces in the box”', sentiment: 'negative' }, // case/quotes ok
        { keywords: 'received, ordered, qty', label: 'Duplicate', sentiment: 'negative' }, // already labelled → dropped
        { keywords: 'size, baby, newborn', label: 'Unknown theme', sentiment: 'negative' }, // no such theme → dropped
        { keywords: 'paint, wall, walls', label: 'x'.repeat(41), sentiment: 'negative' }, // too long → dropped
      ],
    });
    expect(parseLabels(raw, THEMES)).toEqual([{ themeId: 0, label: 'Missing pieces in the box', sentiment: 'negative' }]);
    expect(parseLabels('{"themes":[{"keywords":"paint, wall, walls","label":"Peels paint","sentiment":"angry"}]}', THEMES)).toEqual([]);
    expect(parseLabels('not json', THEMES)).toEqual([]);
  });

  it('cannot shift labels onto the wrong theme (the 1-based numbering bug, DECISIONS #28)', () => {
    // Real Nano answered "Theme 0…7" with ids 1…8. With keyword matching, an entry
    // whose keywords belong to theme 1 can only label theme 1, whatever its position.
    const raw = JSON.stringify({
      themes: [
        { id: 1, keywords: 'paint, wall, walls', label: 'Peels paint off walls', sentiment: 'negative' },
        { id: 2, keywords: 'received, ordered, qty', label: 'Missing pieces in the box', sentiment: 'negative' },
      ],
    });
    const byTheme = Object.fromEntries(parseLabels(raw, THEMES).map((l) => [l.themeId, l.label]));
    expect(byTheme).toEqual({ 0: 'Missing pieces in the box', 1: 'Peels paint off walls' });
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

  it('rejects qualifiers that change a number ("over 100" when it is exactly 100)', () => {
    // Seen on real Nano: "Over 100 reviews were collected…" with exactly 100 reviews.
    expect(validateSummary('Over 106 reviews mentioned the product.', changed)).toBe(false);
    expect(validateSummary('Nearly 33% mention paint damage.', changed)).toBe(false);
    expect(validateSummary('Paint damage was mentioned in 33% of 106 reviews.', changed)).toBe(true);
  });

  it('rejects a claimed rise or fall when no theme changed', () => {
    expect(validateSummary('Paint complaints rose after Oct 2026.', none)).toBe(false);
    expect(validateSummary('No theme changed clearly over Jul 2026 to Nov 2026 across 106 reviews.', none)).toBe(true);
  });
});

describe('firstSentences', () => {
  it('keeps up to n sentences', () => {
    expect(firstSentences('One. Two! Three? Four.', 3)).toEqual({ text: 'One. Two! Three?', trimmed: true });
    expect(firstSentences('One. Two.', 3)).toEqual({ text: 'One. Two.', trimmed: false });
  });
});

describe('parsePlainSummary', () => {
  it('strips quotes, code fences and a "Summary:" prefix', () => {
    expect(parsePlainSummary('Summary: "No clear change."')).toBe('No clear change.');
    expect(parsePlainSummary('```\nNo clear change.\n```')).toBe('No clear change.');
    expect(parsePlainSummary('   ')).toBeNull();
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
  /** Session factory over a shared queue of answers; records prompts and how many sessions were made. */
  function fakeNano(answers: (string | Error)[]) {
    const prompts: string[] = [];
    let sessions = 0;
    let destroyed = 0;
    const make = (): Promise<NanoSession> => {
      sessions++;
      return Promise.resolve({
        prompt(input: string) {
          prompts.push(input);
          const a = answers.shift();
          return a instanceof Error || a === undefined ? Promise.reject(a ?? new Error('no answer')) : Promise.resolve(a);
        },
        destroy() {
          destroyed++;
        },
      });
    };
    return { make, prompts, sessions: () => sessions, destroyed: () => destroyed };
  }

  it('uses AI labels and an AI summary when both validate, each in a fresh session', async () => {
    const n = fakeNano([
      JSON.stringify({
        themes: [
          { keywords: 'received, ordered, qty', label: 'Missing pieces in the box', sentiment: 'negative' },
          { keywords: 'paint, wall, walls', label: 'Peels paint off walls', sentiment: 'negative' },
        ],
      }),
      JSON.stringify({ summary: 'Mentions of missing pieces rose from 5% to 17% of reviews from Oct 2026.' }),
    ]);
    const r = await enrichWithNano(analysis(true), n.make);
    expect(r.labelsApplied).toBe(2);
    expect(r.themes[0]?.label).toBe('Missing pieces in the box');
    expect(r.summarySource).toBe('nano');
    expect(n.sessions()).toBe(2); // one per prompt: no shared context
    expect(n.destroyed()).toBe(2);
    // The summary prompt sees the AI labels and only the facts JSON, never raw reviews.
    expect(n.prompts[1]).toContain('"label":"Missing pieces in the box"');
    expect(n.prompts[1]).not.toContain('I received 9 pics');
  });

  it('falls back to a plain-text summary in a new session when the JSON-constrained call errors', async () => {
    const n = fakeNano([
      '{"themes":[]}',
      new Error('An unknown error occurred: kErrorUnknown'),
      'Summary: "Mentions of missing pieces rose from 5% to 17% of reviews from Oct 2026."',
    ]);
    const r = await enrichWithNano(analysis(true), n.make);
    expect(r.summarySource).toBe('nano');
    expect(r.summary).toBe('Mentions of missing pieces rose from 5% to 17% of reviews from Oct 2026.');
    expect(r.note).toBe('plain-text fallback');
    expect(n.sessions()).toBe(3);
    expect(n.prompts[2]).toContain('Reply with only the summary sentences');
  });

  it('still validates the plain-text fallback', async () => {
    const n = fakeNano(['{"themes":[]}', new Error('kErrorUnknown'), 'Missing pieces rose to 40% of reviews.']);
    const r = await enrichWithNano(analysis(true), n.make);
    expect(r.summarySource).toBe('template');
    expect(r.rejected?.reason).toBe('number 40 is not in the test results (plain-text fallback after JSON error)');
  });

  it('falls back to the template when the AI invents a number', async () => {
    const n = fakeNano(['{"themes":[]}', JSON.stringify({ summary: 'Missing pieces rose to 25% of reviews.' })]);
    const r = await enrichWithNano(analysis(true), n.make);
    expect(r.summarySource).toBe('template');
    expect(r.summary).toBe(withoutNano(analysis(true)).summary);
    expect(r.rejected).toEqual({ draft: 'Missing pieces rose to 25% of reviews.', reason: 'number 25 is not in the test results' });
  });

  it('trims a 4-sentence answer to its first 3 sentences, then validates them', async () => {
    const four =
      'No theme changed clearly from Jul 2026 to Nov 2026. Paint damage was mentioned in 33% of reviews. ' +
      'Missing pieces came up in 10%. Overall the product is great value!';
    const n = fakeNano(['{"themes":[]}', JSON.stringify({ summary: four })]);
    const r = await enrichWithNano(analysis(false), n.make);
    expect(r.summarySource).toBe('nano');
    expect(r.note).toBe('trimmed to 3 sentences');
    expect(r.summary).toBe(
      'No theme changed clearly from Jul 2026 to Nov 2026. Paint damage was mentioned in 33% of reviews. Missing pieces came up in 10%.',
    );
  });

  it('rejects a trimmed answer whose first sentences still break the rules', async () => {
    const n = fakeNano(['{"themes":[]}', JSON.stringify({ summary: 'Complaints rose to 50%. A. B. C.' })]);
    const r = await enrichWithNano(analysis(false), n.make);
    expect(r.summarySource).toBe('template');
    expect(r.rejected?.reason).toBe('number 50 is not in the test results');
  });

  it('leads with "no clear change" when nothing changed and the AI omitted it (real Nano, DECISIONS #29)', async () => {
    // Accepted on real Nano, but silent about the main finding:
    const ai =
      'There were 106 reviews for this product from Jul 2026 to Nov 2026. Paint damage was frequently mentioned. ' +
      'Missing pieces were also commonly mentioned.';
    const n = fakeNano(['{"themes":[]}', JSON.stringify({ summary: ai })]);
    const r = await enrichWithNano(analysis(false), n.make);
    expect(r.summarySource).toBe('nano');
    expect(r.summary).toBe(
      'No theme changed clearly from Jul 2026 to Nov 2026 (106 reviews). ' +
        'There were 106 reviews for this product from Jul 2026 to Nov 2026. Paint damage was frequently mentioned.',
    );
    expect(r.note).toBe('first sentence added from the test results');
  });

  it('leaves an AI summary alone when it already states there was no clear change', async () => {
    const ai = 'No theme changed significantly from Jul 2026 to Nov 2026. Paint damage was mentioned most often.';
    const n = fakeNano(['{"themes":[]}', JSON.stringify({ summary: ai })]);
    const r = await enrichWithNano(analysis(false), n.make);
    expect(r.summary).toBe(ai);
    expect(r.note).toBeUndefined();
  });

  it('explains a rejected "fell" when nothing changed', async () => {
    const n = fakeNano(['{"themes":[]}', JSON.stringify({ summary: 'Value for Money fell from 33% to 33%.' })]);
    const r = await enrichWithNano(analysis(false), n.make);
    expect(r.rejected?.reason).toBe('says "fell" although no theme changed significantly');
  });

  it('keeps keyword labels and the template when the AI fails entirely', async () => {
    const fail = () => new Error('model crashed');
    const n = fakeNano([fail(), fail(), fail(), fail()]);
    const r = await enrichWithNano(analysis(false), n.make);
    expect(r.labelsApplied).toBe(0);
    expect(r.themes).toEqual(THEMES);
    expect(r.summarySource).toBe('template');
    expect(r.rejected?.reason).toBe('AI error: model crashed (JSON), then model crashed (plain text)');
    expect(n.sessions()).toBe(4); // labels: 2 tries; summary: JSON + plain text
  });
});
