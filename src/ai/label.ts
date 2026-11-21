// On-device AI (Gemini Nano via Chrome's Prompt API, `LanguageModel`) for
// readable theme labels and a ≤ 3-sentence summary. Everything here is optional:
// if Nano is unavailable, slow, or returns anything we cannot verify, the
// c-TF-IDF labels and the templated summary are used instead.
//
// The model never sees raw reviews for the summary: only the ShiftResult-derived
// JSON. Every number in its summary must appear in that JSON.

import type { ThemeAnalysis } from '../themes/analyze';
import type { Theme } from '../types';

// ---------------------------------------------------------------- Prompt API

export type NanoAvailability = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface NanoSession {
  prompt(input: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

interface DownloadMonitor {
  addEventListener(type: 'downloadprogress', cb: (e: { loaded: number }) => void): void;
}

interface LanguageModelStatic {
  availability(options?: object): Promise<Exclude<NanoAvailability, 'unsupported'>>;
  create(options?: object & { monitor?: (m: DownloadMonitor) => void; signal?: AbortSignal }): Promise<NanoSession>;
}

const LANG = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

function api(): LanguageModelStatic | null {
  const lm = (globalThis as { LanguageModel?: unknown }).LanguageModel;
  return lm && typeof (lm as LanguageModelStatic).availability === 'function' ? (lm as LanguageModelStatic) : null;
}

export async function nanoAvailability(): Promise<NanoAvailability> {
  const lm = api();
  if (!lm) return 'unsupported';
  try {
    return await lm.availability(LANG);
  } catch {
    return 'unavailable';
  }
}

/**
 * Creates a session. If the model still has to be downloaded, Chrome requires
 * this to be called from a user click; `onProgress` receives 0…1.
 */
export async function createNanoSession(onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<NanoSession> {
  const lm = api();
  if (!lm) throw new Error('Prompt API not supported in this browser');
  return lm.create({
    ...LANG,
    signal,
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded));
    },
  });
}

// ---------------------------------------------------------------- labels

export type Sentiment = NonNullable<Theme['sentiment']>;
export const SENTIMENTS: readonly Sentiment[] = ['positive', 'negative', 'mixed', 'neutral'];
export const MAX_LABEL_CHARS = 40;

export const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          keywords: { type: 'string' },
          label: { type: 'string', maxLength: MAX_LABEL_CHARS },
          sentiment: { type: 'string', enum: SENTIMENTS },
        },
        required: ['keywords', 'label', 'sentiment'],
      },
    },
  },
  required: ['themes'],
} as const;

/** The key a theme is identified by in the prompt and the answer: its keywords. */
export const themeKey = (t: Theme): string => t.topTerms.join(', ');
const normKey = (s: string) => s.toLowerCase().replace(/["“”']/g, '').split(/\s*,\s*/).map((w) => w.trim()).filter(Boolean).join(', ');

/**
 * Themes are identified by their keywords, not by number: Nano renumbered
 * "Theme 0…7" as 1…8 and every label shifted onto the next theme (DECISIONS #28).
 */
export function buildLabelPrompt(themes: readonly Theme[]): string {
  const blocks = themes.map((t) =>
    [
      `- keywords: ${themeKey(t)}`,
      t.meanRating !== null ? `  average star rating of these reviews: ${t.meanRating.toFixed(1)}` : null,
      `  example sentences:`,
      ...t.samples.slice(0, 8).map((s) => `    * ${s.slice(0, 200)}`),
    ]
      .filter((l): l is string => l !== null)
      .join('\n'),
  );
  return [
    'These are groups of sentences from customer reviews of one product sold on amazon.in.',
    'Each group is identified by its keywords.',
    'For each group, write a short label (2 to 5 words, plain English, no quotes, at most 40 characters)',
    'that says what its example sentences are about, e.g. "Missing pieces in the box" or "Peels paint off walls".',
    'Also give the overall sentiment of its sentences: positive, negative, mixed (clearly both), or neutral.',
    'Describe the topic only. Do not judge whether reviews are genuine.',
    'Answer with JSON: one entry per group, copying its "keywords" exactly as written below.',
    '',
    ...blocks,
  ].join('\n');
}

export interface LabelResult {
  themeId: number;
  label: string;
  sentiment: Sentiment;
}

/**
 * Validates the model's JSON. Each entry is matched to a theme by its copied
 * keywords; entries whose keywords match no theme (or one already labelled),
 * empty or over-long labels and unknown sentiments are dropped, and those themes
 * keep their keyword labels.
 */
export function parseLabels(raw: string, themes: readonly Theme[]): LabelResult[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = (data as { themes?: unknown })?.themes;
  if (!Array.isArray(list)) return [];
  const byKey = new Map(themes.map((t) => [normKey(themeKey(t)), t.id]));
  const seen = new Set<number>();
  const out: LabelResult[] = [];
  for (const item of list) {
    const { keywords, label, sentiment } = (item ?? {}) as { keywords?: unknown; label?: unknown; sentiment?: unknown };
    if (typeof keywords !== 'string') continue;
    const id = byKey.get(normKey(keywords));
    if (id === undefined || seen.has(id)) continue;
    if (typeof label !== 'string') continue;
    const clean = label.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
    if (clean.length < 3 || clean.length > MAX_LABEL_CHARS) continue;
    if (!SENTIMENTS.includes(sentiment as Sentiment)) continue;
    seen.add(id);
    out.push({ themeId: id, label: clean, sentiment: sentiment as Sentiment });
  }
  return out;
}

/** Returns themes with AI labels applied where valid; others unchanged. */
export function applyLabels(themes: readonly Theme[], labels: readonly LabelResult[]): Theme[] {
  const byId = new Map(labels.map((l) => [l.themeId, l]));
  return themes.map((t) => {
    const l = byId.get(t.id);
    return l ? { ...t, label: l.label, labelSource: 'nano', sentiment: l.sentiment } : t;
  });
}

// ---------------------------------------------------------------- summary

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (iso: string): string => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? '?'} ${iso.slice(0, 4)}`;
const pct = (x: number) => Math.round(100 * x);

export interface NarrativeInput {
  reviews: number;
  period: string;
  themes: {
    label: string;
    sentiment?: Sentiment;
    /** % of reviews mentioning the theme overall. */
    mentionedPct: number;
    changed: boolean;
    beforePct: number;
    afterPct: number;
    from: string;
  }[];
}

/** The only facts the summary may use. Built from ThemeAnalysis (ShiftResult[] + series). */
export function buildNarrativeInput(a: ThemeAnalysis, themes: readonly Theme[] = a.themes): NarrativeInput {
  const first = a.series[0]?.buckets[0]?.start;
  const lastB = a.series[0]?.buckets;
  const last = lastB?.[lastB.length - 1]?.end;
  const labelOf = new Map(themes.map((t) => [t.id, t]));
  const mentioned = (themeId: number) => {
    const b = a.series.find((s) => s.themeId === themeId)?.buckets ?? [];
    const n = b.reduce((x, y) => x + y.n, 0);
    return n ? b.reduce((x, y) => x + y.k, 0) / n : 0;
  };
  return {
    reviews: a.analysedReviews,
    period: first && last ? `${monthLabel(first)} to ${monthLabel(last)}` : 'unknown',
    themes: a.shifts.map((s) => {
      const t = labelOf.get(s.themeId);
      return {
        label: t?.label ?? s.label,
        ...(t?.sentiment ? { sentiment: t.sentiment } : {}),
        mentionedPct: pct(mentioned(s.themeId)),
        changed: s.significant,
        beforePct: pct(s.before.share),
        afterPct: pct(s.after.share),
        from: monthLabel(s.changeAt),
      };
    }),
  };
}

export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string', maxLength: 450 } },
  required: ['summary'],
} as const;

export function buildNarrativePrompt(input: NarrativeInput, format: 'json' | 'plain' = 'json'): string {
  return [
    'Write a summary for a shopper of at most 3 short sentences, based ONLY on this JSON about one product\'s reviews.',
    'Rules: use only facts and numbers that appear in the JSON; do not add causes, advice or other numbers;',
    'a theme with "changed": false has NO clear change, so never describe it as rising or falling;',
    'if no theme changed, say there was no clear change and name the most mentioned themes;',
    'neutral wording; never say reviews are fake; write numbers exactly as given, without "over", "about" or "nearly".',
    format === 'json' ? 'Answer as JSON {"summary": "..."}.' : 'Reply with only the summary sentences, nothing else.',
    '',
    JSON.stringify(input),
  ].join('\n');
}

/** All numbers the summary is allowed to contain (as written in the input). */
export function allowedNumbers(input: NarrativeInput): Set<string> {
  const s = new Set<string>([String(input.reviews), '3']);
  for (const m of input.period.match(/\d+/g) ?? []) s.add(m);
  for (const t of input.themes) {
    for (const n of [t.mentionedPct, t.beforePct, t.afterPct]) s.add(String(n));
    for (const m of t.from.match(/\d+/g) ?? []) s.add(m);
  }
  return s;
}

/**
 * Why a summary is rejected, or null if accepted. Accepts only 1–3 sentences in
 * which every number appears in the facts, without "fake", and without a claimed
 * rise/fall when no theme changed.
 */
export function summaryProblem(text: string, input: NarrativeInput): string | null {
  const t = text.trim();
  if (t.length === 0) return 'empty';
  if (t.length > 450) return 'too long';
  const sentences = t.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 0);
  if (sentences.length > 3) return `${sentences.length} sentences (max 3)`;
  const allowed = allowedNumbers(input);
  for (const n of t.match(/\d+(?:\.\d+)?/g) ?? []) if (!allowed.has(n)) return `number ${n} is not in the test results`;
  if (/\bfake\b/i.test(t)) return 'mentions "fake"';
  // Numbers come from the facts; a qualifier in front of one changes its meaning ("over 100" when it is 100).
  const qualified = t.match(/\b(over|more than|under|less than|fewer than|nearly|almost|at least|up to)\s+\d/i);
  if (qualified) return `qualifies a number ("${qualified[0]}")`;
  const claim = t.match(/\b(rose|risen|increas\w*|grew|jump\w*|fell|drop\w*|declin\w*|decreas\w*)/i);
  if (!input.themes.some((x) => x.changed) && claim) return `says "${claim[0]}" although no theme changed significantly`;
  return null;
}

export function validateSummary(text: string, input: NarrativeInput): boolean {
  return summaryProblem(text, input) === null;
}

export function parseSummary(raw: string): string | null {
  try {
    const s = (JSON.parse(raw) as { summary?: unknown }).summary;
    return typeof s === 'string' ? s.trim() : null;
  } catch {
    return null;
  }
}

/** The first `n` sentences of `text`, and whether anything was cut. */
export function firstSentences(text: string, n: number): { text: string; trimmed: boolean } {
  const parts = text.trim().split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 0);
  return parts.length <= n ? { text: text.trim(), trimmed: false } : { text: parts.slice(0, n).join(' '), trimmed: true };
}

/** Plain-text answer: strip surrounding quotes/markdown and a leading "Summary:". */
export function parsePlainSummary(raw: string): string | null {
  const t = raw
    .trim()
    .replace(/^```\w*\s*|\s*```$/g, '')
    .replace(/^\s*(summary)\s*:\s*/i, '')
    .replace(/^["“]|["”]$/g, '')
    .trim();
  return t.length > 0 ? t : null;
}

/** Phrases that state "no change" in a summary. */
export const SAYS_NO_CHANGE = /\bno (clear|significant|notable|real)?\s*change|\bno theme changed|\bdid not change|\bunchanged\b|\bstable\b|\bremained (steady|similar|the same)/i;

export function noChangeSentence(input: NarrativeInput): string {
  return `No theme changed clearly from ${input.period} (${input.reviews} reviews).`;
}

/** Deterministic fallback summary (≤ 3 sentences) from the same facts. */
export function templateSummary(input: NarrativeInput): string {
  const changed = input.themes.filter((t) => t.changed);
  const parts: string[] = [];
  if (changed.length > 0) {
    for (const t of changed.slice(0, 2)) {
      const dir = t.afterPct > t.beforePct ? 'rose' : 'fell';
      parts.push(`Mentions of "${t.label}" ${dir} from ${t.beforePct}% to ${t.afterPct}% of reviews from ${t.from}.`);
    }
  } else {
    parts.push(noChangeSentence(input));
    const top = [...input.themes].sort((a, b) => b.mentionedPct - a.mentionedPct).slice(0, 3);
    if (top.length > 0) {
      const items = top.map((t) => `"${t.label}" (${t.mentionedPct}%)`);
      const list = items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];
      parts.push(`Most discussed: ${list}.`);
    }
  }
  parts.push('Based only on the reviews you viewed.');
  return parts.slice(0, 3).join(' ');
}

// ---------------------------------------------------------------- orchestration

export interface AiResult {
  themes: Theme[];
  summary: string;
  summarySource: 'nano' | 'template';
  labelsApplied: number;
  /** The AI's summary if it was rejected, and why (shown for transparency). */
  rejected?: { draft: string; reason: string };
  /** How an accepted AI summary was obtained, if not the normal way. */
  note?: string;
}

/**
 * Runs one prompt in a fresh session (sessions keep the whole conversation, and
 * reusing one for labels + summary overflowed Nano's context: kErrorUnknown,
 * DECISIONS #25). Retries once on error.
 */
async function promptFresh(
  makeSession: () => Promise<NanoSession>,
  text: string,
  schema: object | null,
  signal?: AbortSignal,
  attempts = 2,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const session = await makeSession();
    try {
      return await session.prompt(text, schema ? { responseConstraint: schema, signal } : { signal });
    } catch (e) {
      lastError = e;
    } finally {
      session.destroy();
    }
  }
  throw lastError;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Labels themes and writes the summary, each in its own session; any failure falls back per item. */
export async function enrichWithNano(
  a: ThemeAnalysis,
  makeSession: () => Promise<NanoSession>,
  signal?: AbortSignal,
): Promise<AiResult> {
  let themes = a.themes;
  let labelsApplied = 0;
  try {
    const raw = await promptFresh(makeSession, buildLabelPrompt(a.themes), LABEL_SCHEMA, signal);
    const labels = parseLabels(raw, a.themes);
    themes = applyLabels(a.themes, labels);
    labelsApplied = labels.length;
  } catch {
    // keep keyword labels
  }
  const input = buildNarrativeInput(a, themes);
  // 1) JSON-constrained; 2) if that call errors, plain text (constrained decoding of a
  //    long free-text field failed with kErrorUnknown on real Nano, DECISIONS #26).
  let raw: string | null = null;
  let format: 'json' | 'plain' = 'json';
  let jsonError: string | null = null;
  try {
    raw = await promptFresh(makeSession, buildNarrativePrompt(input, 'json'), SUMMARY_SCHEMA, signal, 1);
  } catch (e) {
    jsonError = errText(e);
    try {
      format = 'plain';
      raw = await promptFresh(makeSession, buildNarrativePrompt(input, 'plain'), null, signal, 1);
    } catch (e2) {
      return {
        themes,
        summary: templateSummary(input),
        summarySource: 'template',
        labelsApplied,
        rejected: { draft: '', reason: `AI error: ${jsonError} (JSON), then ${errText(e2)} (plain text)` },
      };
    }
  }
  let parsed = format === 'json' ? parseSummary(raw) : parsePlainSummary(raw);
  // The main finding must be stated. If nothing changed and the AI did not say so,
  // lead with the factual sentence and keep the AI's first two (DECISIONS #29).
  let ledWithFinding = false;
  if (parsed !== null && !input.themes.some((x) => x.changed) && !SAYS_NO_CHANGE.test(parsed)) {
    parsed = `${noChangeSentence(input)} ${firstSentences(parsed, 2).text}`;
    ledWithFinding = true;
  }
  // Over-long answers are trimmed to their first 3 sentences before validation:
  // cutting can only remove claims, never add an unverified number.
  const { text: summary, trimmed } = parsed === null ? { text: null, trimmed: false } : firstSentences(parsed, 3);
  const problem = summary === null ? `not valid ${format === 'json' ? 'JSON' : 'text'}` : summaryProblem(summary, input);
  if (summary !== null && problem === null) {
    const notes = [
      jsonError ? 'plain-text fallback' : null,
      ledWithFinding ? 'first sentence added from the test results' : null,
      trimmed ? 'trimmed to 3 sentences' : null,
    ].filter(Boolean);
    return { themes, summary, summarySource: 'nano', labelsApplied, ...(notes.length ? { note: notes.join(', ') } : {}) };
  }
  const rejected: AiResult['rejected'] = {
    draft: summary ?? raw.slice(0, 450),
    reason: `${problem ?? 'invalid'}${jsonError ? ' (plain-text fallback after JSON error)' : ''}`,
  };
  return { themes, summary: templateSummary(input), summarySource: 'template', labelsApplied, rejected };
}

/** Result without any AI. */
export function withoutNano(a: ThemeAnalysis): AiResult {
  return { themes: a.themes, summary: templateSummary(buildNarrativeInput(a)), summarySource: 'template', labelsApplied: 0 };
}
