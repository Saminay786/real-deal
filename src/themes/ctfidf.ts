// Class-based TF-IDF (c-TF-IDF, as in BERTopic) for cluster labels.
// Pure: no DOM, no chrome.*. Method: docs/METHODOLOGY.md#themes
//   w(t, c) = tf(t, c) · log(1 + A / f(t))
//   tf(t, c): count of term t in all sentences of cluster c
//   f(t):     count of t across all clusters
//   A:        average number of (kept) words per cluster

export const STOP_WORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being below ' +
    'between both but by can could did do does doing done down during each few for from further get got had has ' +
    'have having he her here hers herself him himself his how i if in into is it its itself just let me more most ' +
    'my myself no nor not now of off on once one only or other our ours ourselves out over own same she should so ' +
    'some such than that the their theirs them themselves then there these they this those through to too under ' +
    'until up us very was we were what when where which while who whom why will with would you your yours ' +
    'yourself yourselves its im ive dont didnt doesnt isnt wasnt cant wont also really even much many well ' +
    'product item amazon buy bought purchase purchased use used using'
  ).split(/\s+/),
);

/** Lowercased letter-words of 2+ characters, apostrophes removed, stop words dropped. */
export function tokenize(s: string): string[] {
  return (s.toLowerCase().replace(/['’]/g, '').match(/\p{L}{2,}/gu) ?? []).filter((w) => !STOP_WORDS.has(w));
}

export interface ClassTerms {
  /** Top terms, highest weight first. */
  terms: string[];
  weights: number[];
}

/** c-TF-IDF top terms for each class. `docs[c]` are the sentences of class c. */
export function ctfidf(docs: readonly (readonly string[])[], top = 3): ClassTerms[] {
  const tf = docs.map((sentences) => {
    const m = new Map<string, number>();
    for (const s of sentences) for (const w of tokenize(s)) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  });
  const f = new Map<string, number>();
  let totalWords = 0;
  for (const m of tf) {
    for (const [w, c] of m) {
      f.set(w, (f.get(w) ?? 0) + c);
      totalWords += c;
    }
  }
  const A = docs.length > 0 ? totalWords / docs.length : 0;
  return tf.map((m) => {
    const scored = [...m].map(([w, c]) => ({ w, s: c * Math.log(1 + A / (f.get(w) ?? 1)) }));
    scored.sort((a, b) => b.s - a.s || (a.w < b.w ? -1 : 1));
    const best = scored.slice(0, top);
    return { terms: best.map((x) => x.w), weights: best.map((x) => x.s) };
  });
}
