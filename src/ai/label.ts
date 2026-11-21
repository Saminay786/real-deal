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
          id: { type: 'integer' },
          label: { type: 'string', maxLength: MAX_LABEL_CHARS },
          sentiment: { type: 'string', enum: SENTIMENTS },
        },
        required: ['id', 'label', 'sentiment'],
      },
    },
  },
  required: ['themes'],
} as const;

export function buildLabelPrompt(themes: readonly Theme[]): string {
  const blocks = themes.map((t) =>
    [
      `Theme ${t.id}`,
      `  keywords: ${t.topTerms.join(', ')}`,
      t.meanRating !== null ? `  average star rating of these reviews: ${t.meanRating.toFixed(1)}` : null,
      `  example sentences:`,
      ...t.samples.slice(0, 8).map((s) => `  - ${s.slice(0, 200)}`),
    ]
      .filter((l): l is string => l !== null)
      .join('\n'),
  );
  return [
    'These are groups of sentences from customer reviews of one product sold on amazon.in.',
    'For each theme, write a short label (2 to 5 words, plain English, no quotes, at most 40 characters)',
    'that says what the sentences are about, e.g. "Missing pieces in the box" or "Peels paint off walls".',
    'Also give the overall sentiment of its sentences: positive, negative, mixed (clearly both), or neutral.',
    'Describe the topic only. Do not judge whether reviews are genuine.',
    'Answer with JSON listing every theme id exactly once.',
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
 * Validates the model's JSON. Unknown ids, duplicates, empty or over-long labels
 * and unknown sentiments are dropped; those themes keep their keyword labels.
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
  const ids = new Set(themes.map((t) => t.id));
  const seen = new Set<number>();
  const out: LabelResult[] = [];
  for (const item of list) {
    const { id, label, sentiment } = (item ?? {}) as { id?: unknown; label?: unknown; sentiment?: unknown };
    if (typeof id !== 'number' || !ids.has(id) || seen.has(id)) continue;
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

export function buildNarrativePrompt(input: NarrativeInput): string {
  return [
    'Write a summary for a shopper of at most 3 short sentences, based ONLY on this JSON about one product\'s reviews.',
    'Rules: use only facts and numbers that appear in the JSON; do not add causes, advice or other numbers;',
    'a theme with "changed": false has NO clear change, so never describe it as rising or falling;',
    'if no theme changed, say there was no clear change and name the most mentioned themes;',
    'neutral wording; never say reviews are fake. Answer as JSON {"summary": "..."}.',
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
 * Accepts a summary only if it has 1–3 sentences, every number in it is in
 * `allowed`, and it does not call an unchanged theme rising/falling by name.
 */
export function validateSummary(text: string, input: NarrativeInput): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 450) return false;
  const sentences = t.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 0);
  if (sentences.length > 3) return false;
  const allowed = allowedNumbers(input);
  for (const n of t.match(/\d+(?:\.\d+)?/g) ?? []) if (!allowed.has(n)) return false;
  if (/\bfake\b/i.test(t)) return false;
  // If nothing changed, the summary must not claim a rise or fall.
  if (!input.themes.some((x) => x.changed) && /\b(rose|risen|increas|grew|jump|fell|drop|declin|decreas)/i.test(t)) return false;
  return true;
}

export function parseSummary(raw: string): string | null {
  try {
    const s = (JSON.parse(raw) as { summary?: unknown }).summary;
    return typeof s === 'string' ? s.trim() : null;
  } catch {
    return null;
  }
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
    parts.push(`No theme changed clearly from ${input.period} (${input.reviews} reviews).`);
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
}

/** Labels themes and writes the summary with `session`; any failure falls back per item. */
export async function enrichWithNano(a: ThemeAnalysis, session: NanoSession, signal?: AbortSignal): Promise<AiResult> {
  let themes = a.themes;
  let labelsApplied = 0;
  try {
    const raw = await session.prompt(buildLabelPrompt(a.themes), { responseConstraint: LABEL_SCHEMA, signal });
    const labels = parseLabels(raw, a.themes);
    themes = applyLabels(a.themes, labels);
    labelsApplied = labels.length;
  } catch {
    // keep keyword labels
  }
  const input = buildNarrativeInput(a, themes);
  try {
    const raw = await session.prompt(buildNarrativePrompt(input), { responseConstraint: SUMMARY_SCHEMA, signal });
    const summary = parseSummary(raw);
    if (summary && validateSummary(summary, input)) {
      return { themes, summary, summarySource: 'nano', labelsApplied };
    }
  } catch {
    // fall through to the template
  }
  return { themes, summary: templateSummary(input), summarySource: 'template', labelsApplied };
}

/** Result without any AI. */
export function withoutNano(a: ThemeAnalysis): AiResult {
  return { themes: a.themes, summary: templateSummary(buildNarrativeInput(a)), summarySource: 'template', labelsApplied: 0 };
}
