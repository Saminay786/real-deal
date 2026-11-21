// Review text -> sentences, with a language filter. Pure: no DOM, no chrome.*.
// The embedding model (all-MiniLM-L6-v2) is English-only, so Hindi (Devanagari)
// and romanised Hindi ("Hinglish") sentences are detected and left out.

export const MIN_WORDS = 3;

export interface Sentence {
  reviewId: string;
  /** Position within the review (0-based, after filtering). */
  index: number;
  text: string;
}

/** Splits on . ! ? । (Hindi full stop) and line breaks; drops pieces with fewer than MIN_WORDS words. */
export function splitSentences(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?।])\s+|\n+|(?<=[.!?।])(?=\S)(?!\d)/u)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => wordCount(s) >= MIN_WORDS);
}

function wordCount(s: string): number {
  return (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/**
 * Common romanised-Hindi function and review words. Deliberately excludes words
 * that are also English ("to", "me", "so", "hi", "par", "main").
 */
const HINGLISH = new Set([
  'hai', 'hain', 'nahi', 'nhi', 'nahin', 'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'mai', 'aur', 'bhi', 'kar',
  'karo', 'karna', 'kare', 'tha', 'thi', 'the', 'ye', 'yeh', 'wo', 'woh', 'hoga', 'hogi', 'kya', 'ekdum',
  'ekdam', 'bahut', 'bohot', 'bahot', 'achha', 'acha', 'accha', 'bekar', 'bakwas', 'paisa', 'paise', 'wapas',
  'liye', 'isliye', 'lekin', 'kuch', 'sab', 'mat', 'raha', 'rahi', 'gaya', 'gayi', 'diya', 'liya', 'mera',
  'meri', 'apna', 'sirf', 'abhi', 'jaldi', 'kharab', 'sahi', 'kaam', 'hota', 'hoti', 'jata', 'jati', 'wala',
  'wali', 'chahiye', 'kyunki', 'toh', 'pe', 'hua', 'hui', 'samajh', 'lena', 'dena', 'karke', 'lagta', 'lagti',
]);
// "the" is English; keep it out even though it doubles as Hindi "थे".
HINGLISH.delete('the');

/**
 * True if a sentence is Hindi script, or romanised Hindi: at least 2 words from
 * the list above making up at least 20% of its words.
 */
export function isNonEnglish(s: string): boolean {
  if (/[ऀ-ॿ]/u.test(s)) return true;
  const words = (s.toLowerCase().match(/\p{L}+/gu) ?? []);
  if (words.length === 0) return false;
  const hits = words.filter((w) => HINGLISH.has(w)).length;
  return hits >= 2 && hits / words.length >= 0.2;
}

export interface ReviewText {
  reviewId: string;
  title: string | null;
  body: string | null;
}

export interface SentenceSplit {
  sentences: Sentence[];
  /** Reviews whose every sentence was non-English: excluded from theme analysis. */
  nonEnglish: Set<string>;
}

/**
 * True for script/JSON fragments rather than prose. Reviews stored before the
 * extraction fix (DECISIONS #23) contain video-player config text such as
 * `P.when("A").execute(…{"isVse":false…})`.
 */
export function isCodeLike(s: string): boolean {
  if (/[{}<>]|=>|\bfunction\s*\(|\bP\.when\b|\.execute\(|":\s*(true|false|null|"|\d)/.test(s)) return true;
  const symbols = (s.match(/[^\p{L}\p{N}\s.,!?'’"“”()%₹-]/gu) ?? []).length;
  return symbols / Math.max(1, s.length) > 0.15;
}

/** Title (if it is a real sentence) followed by body sentences, English only, without code fragments. */
export function reviewSentences(reviews: readonly ReviewText[]): SentenceSplit {
  const sentences: Sentence[] = [];
  const nonEnglish = new Set<string>();
  for (const r of reviews) {
    const all = [...splitSentences(r.title), ...splitSentences(r.body)].filter((s) => !isCodeLike(s));
    const english = all.filter((s) => !isNonEnglish(s));
    if (all.length > 0 && english.length === 0) nonEnglish.add(r.reviewId);
    english.forEach((text, index) => sentences.push({ reviewId: r.reviewId, index, text }));
  }
  return { sentences, nonEnglish };
}
