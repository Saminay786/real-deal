# Real Deal — review truth-checker for amazon.in (Chrome extension)

## Goal
Open-source Chrome extension that tells a shopper how much to trust a product's
reviews, using honest statistics computed locally.

- **Pipeline A — rating confidence (product pages).** A badge next to Amazon's
  star rating: `4.2★ (likely 3.9–4.4)`, a credible interval for the true mean
  rating given the 1–5★ distribution and rating count.
- **Pipeline B — theme trends (review pages).** From reviews the user has
  viewed, find what people talk about (themes) and test whether the share of
  reviews mentioning each theme changed over time (e.g. "battery complaints
  rose after Jan 2026"). Shown in the side panel with evidence.
- **Pipeline C — search re-ranking (v2, search pages).** A score badge on each
  search result card, and an optional reorder of the current page by that score.

amazon.in only until told otherwise.

## Hard constraints (never violate)
- **Zero cost, zero network.** No paid APIs, no backend, no accounts, no
  telemetry. The built extension makes **zero outbound network requests**. All
  models (MiniLM, ONNX runtime WASM) are bundled under `models/` and loaded
  from the extension package.
- **Read only what the user views.** Never fetch Amazon pages, never
  auto-paginate, never click on the user's behalf. Reviews are collected only
  from pages the user opens, including pages they reach via Amazon's own AJAX
  pagination.
- **LLM = Chrome built-in AI only** (Gemini Nano via `LanguageModel`). Always
  feature-detect with `availability()`. Every feature must work without it
  (c-TF-IDF labels, templated narrative). LLM failure never breaks anything.
- **The LLM never sees raw stats inputs it could distort.** Narratives are
  generated only from `ShiftResult[]` JSON; numbers in the narrative must come
  from that JSON.
- **Data stays local:** `chrome.storage.local` for settings, IndexedDB (via
  `idb`) for reviews and embeddings.
- Do not add a dependency without asking first. Pre-approved: `preact`, `idb`
  (Phase 2), `@huggingface/transformers` (Phase 4).

## Stack
- Manifest V3, TypeScript (strict, no `any`)
- Vite + `@crxjs/vite-plugin`
- Chrome Side Panel API; Preact for side panel and options UI
- Vitest (+ `happy-dom` environment for DOM extraction tests; approved 2026-11-15)
- `research/` holds Python notebooks (owned by the user — do not generate
  notebooks unless asked)

## Structure
```
src/
  manifest.json
  types.ts
  background/service-worker.ts      # message routing, side panel enablement
  content/
    index.ts                        # content script entry: routes by page type
    amazon/
      selectors.ts                  # ALL DOM selectors live here, as fallback arrays
      extract.ts                    # Document -> ProductSnapshot | Review[] | SearchResult[]
      badge.ts                      # pipeline A badge injection
      observer.ts                   # MutationObserver for AJAX review pagination
      search.ts                     # pipeline C card badges + reorder (v2)
  collect/store.ts                  # IndexedDB: reviews by ASIN, embeddings by reviewId
  collect/summary.ts                # pure: collection progress for the side panel
  messages.ts                       # content <-> service worker <-> side panel messages
  debug.ts                          # DEBUG flag + logger
  themes/
    sentences.ts                    # review -> sentences
    embed.worker.ts                 # MiniLM embeddings in a Web Worker
    cluster.ts                      # seeded k-means, k by silhouette
    ctfidf.ts                       # c-TF-IDF cluster labels
  stats/                            # pure functions: no DOM, no chrome.*, no IndexedDB
    rng.ts                          # seeded RNG (mulberry32) + gamma/normal samplers
    rating.ts                       # Dirichlet interval; ranking score (v2)
    bucket.ts                       # monthly buckets + merging
    intervals.ts                    # Wilson, Newcombe
    changepoint.ts                  # binomial change-point + permutation p-value
    fdr.ts                          # Benjamini–Hochberg
  ai/label.ts                       # Gemini Nano labels + narrative, with fallbacks
  sidepanel/                        # Preact UI, one component per card
  options/                          # options page (Phase 7)
models/                             # bundled MiniLM (quantized ONNX) + tokenizer
tests/                              # mirrors src/; tests/fixtures/ = saved amazon.in pages
docs/METHODOLOGY.md                 # every stat method, with formulas
research/                           # Python notebooks
```

## Data model (types.ts)
- `ProductSnapshot { asin, title, url, rating, ratingCount, ratingDistribution: Record<1|2|3|4|5, number> /* percentages */, capturedAt }`
- `Review { reviewId, asin, rating, title, body, date /* ISO yyyy-mm-dd */, verified, helpfulVotes, variant, country }`
  — `variant` e.g. "Size: 10 PACK | Colour: Photo Frame Hook"; `country` from
  "Reviewed in <country> on …". Only `country = 'India'` reviews are analysed
  (others are stored, counted, not used).
- `ProductMeta { asin, totalReviews /* largest "N customer reviews" seen */, updatedAt }`
- `Theme { id, label, labelSource: 'ctfidf'|'nano', topTerms: string[], size }`
- `ThemeSeries { themeId, buckets: { start, end, n, k, share, ci: [lo, hi] }[] }` — `k` = reviews in bucket mentioning theme
- `ShiftResult { themeId, label, changeAt, before: {n, k, share}, after: {n, k, share}, diff, diffCi: [lo, hi], pValue, qValue, significant, exemplars: { before: string[], after: string[] } }`
- `SearchResult { asin, title, url, rating, ratingCount, price, sponsored, position }` (v2)
- Any extracted field may be `null` if not found on the page.

All stats functions return `{ value, dataSufficiency: 'insufficient'|'low'|'ok', explanation }`
where `value` is `null` when insufficient.

## Stats spec
Every random step uses `stats/rng.ts` with an explicit seed (default `seed = 42`).
Results must be identical across runs for the same input.

**A1. Rating credible interval (rating.ts)**
- Counts: `c_k = round(p_k / 100 · N)` for k = 1..5 from the percentage
  distribution and rating count `N`. (Amazon rounds percentages; note this in
  METHODOLOGY as a limitation.)
- Prior `θ ~ Dirichlet(α_0, …, α_0)` with **α_0 = 0.5 (Jeffreys)**; posterior
  `Dirichlet(α_0 + c_1, …, α_0 + c_5)`. (Changed from α_0 = 1 on 2026-11-15:
  the uniform prior undercovered on 5★-heavy products, e.g. 0.74 at n = 20.
  Comparison table in METHODOLOGY.)
- Mean rating `μ = Σ k·θ_k`. Posterior mean `E[μ] = Σ k·(α_0 + c_k) / (5α_0 + Σc_k)`
  (closed form).
- Interval: equal-tailed 90% from `S = 4000` Monte Carlo draws (Dirichlet via
  normalised Gamma(α,1), Marsaglia–Tsang).
- Sufficiency: `N = 0` or distribution missing → insufficient (badge hidden);
  `N < 30` → low; else ok.
- Coverage test: for fixed true θ ∈ {hooks 54% 5★, mop 87% 5★, poorly rated}
  and n ∈ {20, 100, 1000}, simulate 500 datasets; empirical coverage of the 90%
  interval must be in [0.85, 0.95]. Never change seeds to make it pass.

**B1. Buckets (bucket.ts)**
- Calendar-month buckets by review date. Merge adjacent buckets (earlier into
  later, last into previous) until every bucket has `n ≥ 15`.
- Theme indicator is review-level: `x_i = 1` if any sentence of review i is in
  the theme's cluster.
- Minimum to analyse: ≥ 100 reviews and ≥ 3 buckets after merging; otherwise
  insufficient.

**B2. Intervals (intervals.ts)**
- Wilson 95% interval for each bucket share `k/n`, z = 1.96.
- Newcombe (hybrid Wilson) 95% interval for `after − before` difference.
- With star strata: star-mix-adjusted difference by direct standardisation
  `Σ_s w_s (p_s,after − p_s,before)`, `w_s` = stratum share, Wald CI (falls back
  to Newcombe when only one stratum has reviews on both sides).

**B3. Change-point (changepoint.ts)**
- Reviews sorted by date; candidate change points are bucket boundaries with
  ≥ 30 reviews on each side.
- **Stratified by star rating by default** (added 2026-11-15): star filters
  (needed past Amazon's 100-review cap) change the star mix over time, and in
  simulation an unstratified test then falsely flags 89% of no-change series.
- Statistic with one stratum: log-likelihood ratio
  `LR(τ) = ℓ(k_1, n_1) + ℓ(k_2, n_2) − ℓ(k_1 + k_2, n_1 + n_2)`,
  `ℓ(k, n) = k·log(k/n) + (n−k)·log(1 − k/n)` with `0·log 0 = 0`.
- Statistic with several strata: Cochran–Mantel–Haenszel
  `CMH(τ) = (Σ_s (O_s − E_s))² / Σ_s V_s`, `O_s = k_s,after`,
  `E_s = n_s,after K_s / N_s`, `V_s = n_s,after n_s,before K_s (N_s−K_s) / (N_s² (N_s−1))`.
  (A per-stratum LR sum was tried first: power fell to 0.60.)
- `T = max_τ` of the statistic; `changeAt` = argmax boundary.
- p-value by permutation: shuffle the `x_i` **within each star level** (dates
  fixed), `B = 999`, `p = (1 + #{T_b ≥ T}) / (B + 1)`.
- Validation tests (500 series each): null FPR at α = 0.05 ≤ 0.07 both
  unstratified and stratified; star-mix trap FPR ≤ 0.07 stratified (and > 0.5
  unstratified, to show the trap is real); power for 0.10 → 0.25 at n = 300
  ≥ 0.80 both ways.

**B4. FDR (fdr.ts)**
- Benjamini–Hochberg across all themes of one product at `q = 0.10`. Report
  adjusted q-values (monotone, capped at 1). `significant = q ≤ 0.10`.

**B5. Clustering and labels (themes/)**
- Sentences: split on `.!?` and newlines; drop sentences with < 3 words.
- Embeddings: all-MiniLM-L6-v2, mean-pooled, L2-normalised (384-d).
- k-means++ (cosine on normalised vectors), seeded, `k ∈ [3, 8]` chosen by
  mean silhouette; 10 restarts per k, max 100 iterations.
- c-TF-IDF: `w(t, c) = tf(t, c) · log(1 + A / f(t))`, `tf` = term count in the
  concatenated sentences of class c, `f(t)` = count of t across all classes,
  `A` = mean words per class. English stop words removed. Label = top 3 terms.

**C1. Ranking score (rating.ts, v2)**
- Shrunk mean `r̃ = (C·m + N·r̄) / (C + N)`, `SE = σ / √(C + N)`,
  score = `r̃ − 1.645·SE` (one-sided 95% lower bound).
- Constants `m` (prior mean), `σ` (per-review rating SD), `C` (prior weight)
  live in `rating.ts`; defaults `m = 3.9, σ = 1.2, C = 20` until estimated in
  `research/`.
- Sponsored results are scored but labelled.

## UI
- **Badge (A):** range only, `likely 3.8–4.5`, beside Amazon's rating (Amazon's
  own average is right there; decided 2026-11-15). One decimal, two if the
  range would collapse (`4.01–4.04`). Tooltip explains the interval in one
  sentence; hidden when insufficient; `· low data` + dashed border when `N < 30`.
- **Side panel (B):**
  1. Collection card, updating live as the user clicks "Show 10 more":
     - reviews captured (e.g. "184 reviews captured"), out of Amazon's total
       when the page shows it;
     - months covered and date span (e.g. "7 months · Apr–Nov 2026");
     - progress toward the minimum (≥ 100 reviews, ≥ 3 buckets): "Need 38
       more reviews" or "Enough to analyse";
     - a hint to sort by "Most recent", keep clicking "Show 10 more", and use
       star/variant filters to reach further back.
     The user clicks; the extension never auto-loads. **Measured 2026-11-15:
     Amazon shows at most 100 reviews per sort/filter combination** ("To see
     more, search or filter all reviews"), so auto-loading would gain nothing.
     More reviews come from star, variant and keyword filters (up to 100 each),
     merged by reviewId. Because star filters distort the star mix over time,
     Phase 3 must stratify change-point permutations by star rating.
  2. Narrative card: ≤ 3 sentences (Nano or template).
  3. Theme list sorted by significance, then |diff|. Each row: label,
     inline-SVG sparkline of bucket shares with Wilson CI band and a marker at
     `changeAt`, `before → after` shares, q-value, expandable exemplars
     (sentences either side of the change).
  4. Limitations note: only reviews you viewed; Amazon's ordering and
     filtering affect what is visible; association, not cause.
- No chart library. Neutral, evidence-based wording; every flag shows *why*.
  Never call reviews "fake".

## Positioning (for README "Related work")
- **Amazon "Customers say"** — AI summary of reviews; no time dimension, no
  uncertainty.
- **Fakespot** (shut down 2025), **ReviewMeta** — authenticity grading, server
  side. Real Deal does not judge authenticity and runs entirely locally.
- **Keepa / camelcamelcamel** — price history, not reviews.
- **BERTopic** (Grootendorst, 2022) — source of the c-TF-IDF idea; Real Deal
  adds per-theme change-point tests with FDR control, on-device.

## Rules
- Build only the current phase. Do not build ahead.
- Amazon's DOM changes often: extraction returns `null` for missing fields and
  never throws. Debug logging behind a `DEBUG` flag.
- Every function in `src/stats/` has unit tests with hand-computed expected
  values; show the arithmetic in test comments.
- Update `docs/METHODOLOGY.md` whenever a stat method is added or changed.
- Update the Status section below at the end of each phase.

## Commands
- `npm run dev` — dev build with HMR
- `npm run build` — type-check + production build to `dist/`
- `npm test` — Vitest
- `npm run build:fixtures` — dev-only build ("Real Deal (fixtures)") whose side
  panel saves the current amazon.in page to Downloads as a test fixture, with
  name/address blanked. Move files into `tests/fixtures/`, scan for personal
  data, then run `npm run build` again.

## Fixtures (tests/fixtures/)
- `product-many` (11,413 ratings), `product-281`, `product-46`,
  `product-few` (22), `product-none` (no rating; a carousel on the page shows
  other products' stars — extraction must ignore them)
- `reviews-a-p1` (10 reviews, Most recent), `reviews-a-p2` (30, after
  "Show 10 more"), `reviews-a-60` (60) — same product, B0CCM8L54V
- `reviews-b-p1` (10 reviews, Most recent) — B0GLG5JSHK
- `reviews-b-top` (10 reviews, "Top reviews" order) — B0HB6VXMJ6
- amazon.in serves review lists at `/portal/customer-reviews/<ASIN>`.
- Load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `dist/`

## Status
### v1
- [x] Phase 0 — scaffold (MV3 + side panel, amazon.in host only; build + 3 smoke tests pass)
- [x] Phase 1 — rating confidence badge (pipeline A): extraction from 5 product
  fixtures, Jeffreys-prior Dirichlet interval, range-only badge; 47 tests pass
- [x] Phase 2 — review collection (pipeline B step 1): review extraction (5
  fixtures), MutationObserver for "Show 10 more", IndexedDB store (dedupe by
  reviewId, written by the service worker in the extension origin), live
  collection card; 72 tests pass
- [x] Phase 3 — stats core (bucket, intervals, changepoint, fdr): star-stratified
  CMH change-point test; null FPR 0.038 (plain) / 0.054 (stratified), star-mix
  trap 0.890 → 0.064, power at n = 300 for 0.10 → 0.25: 0.850 / 0.874
- [ ] Phase 4 — themes (sentences, embeddings, clustering, c-TF-IDF) wired end-to-end
- [ ] Phase 5 — Gemini Nano labels + narrative
- [ ] Phase 6 — trends UI
- [ ] Phase 7 — release (README, LICENSE, options, icon, network audit)
### v2
- [ ] Phase 8 — search re-ranking (pipeline C)
