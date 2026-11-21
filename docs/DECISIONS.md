# Decision log

What went wrong or surprised us, what we observed, and how the plan changed.
Newest at the bottom. Each entry: **Difficulty / observation → Decision → Evidence.**

---

## 2026-11-14 · Setup

### 1. The original spec was lost
- **Difficulty.** The phase plan said "copy CLAUDE.md here", but the new
  `CLAUDE.md` (Stats spec, pipelines A/B/C, UI, Positioning) was nowhere on disk.
  The `real-deal` folder held an older, different spec (review summary,
  authenticity score, discount check).
- **Decision.** Start from scratch. The old project was moved to
  `Downloads/real-deal-old` (not deleted). Claude wrote a new `CLAUDE.md` from the
  phase plan. Its numeric choices (thresholds, B = 999, minimum 100 reviews, …)
  were Claude's guesses and are revisited below when evidence disagreed.

### 2. Node.js not installed
- **Difficulty.** `npm run build` could not run.
- **Decision.** Installed Node.js 26 LTS with winget. VS Code had to be restarted
  to see it.

### 3. Saving fixture pages by hand was error-prone
- **Difficulty.** Ctrl+S → "Webpage, Complete" was unfamiliar. The first attempt
  saved four files from the same tab: `product-many` was really a reviews page,
  and `reviews-b-p1` was the same product as `reviews-a`.
- **Decision.** A dev-only "Save page for tests" card in the side panel, only in
  `npm run build:fixtures`. It saves the live DOM, including AJAX-loaded reviews.
- **Second difficulty.** The first version messaged the content script and failed
  with "Receiving end does not exist", because tabs opened before an extension
  reload have no content script.
- **Decision.** Read the page with `chrome.scripting.executeScript` instead. The
  `scripting` permission is added only to the fixtures build.

### 4. Personal data in saved pages
- **Observation.** Product pages contained the user's name, city and pincode, in
  an `aria-label` ("Deliver to … ") that text blanking missed.
- **Decision.** The saver blanks text **and** `aria-label` / `title` / `alt` /
  `data-value` of personal-info elements. Every fixture is scanned for
  name/pincode/email before it is committed.

### 5. Fixture labels did not match their content
- **Observation.** "product-few" had 281 ratings, "product-none" had 46, and the
  second review page was sorted by Top reviews.
- **Decision.** Rename files by what they contain (`product-281`, `product-46`,
  `reviews-b-top`) and keep them as extra variety. Save true `product-few` (22),
  `product-none` (0) and `reviews-b-p1` (Most recent) pages.

## 2026-11-14 · Reading Amazon's pages

### 6. Review pages live at a different URL
- **Observation.** amazon.in serves reviews at `/portal/customer-reviews/<ASIN>`,
  not `/product-reviews/<ASIN>` as assumed.
- **Decision.** Page routing accepts both. Later confirmed that
  `/product-reviews/…?filterByStar=one_star` also works and Amazon applies the filter.

### 7. The canonical link points at a different variant
- **Observation.** On 2 of 5 product pages, `<link rel="canonical">` named
  another ASIN (e.g. hooks B0CCM8L54V → B0BQ8B1RJF).
- **Decision.** Take the ASIN from the page's hidden `input#ASIN`, falling back to
  `data-asin`, then the URL.

### 8. Other products' stars on the page
- **Observation.** The no-rating product page still contained "3.8 out of 5
  stars", which belonged to a "similar products" carousel.
- **Decision.** Read the star breakdown only inside the product's own review
  section. The test asserts that `product-none` gives `rating = null`.

## 2026-11-15 · Pipeline A: rating badge

### 9. The uniform prior gave wrong ranges on Amazon
- **Observation.** With the spec's uniform Dirichlet(1) prior, the "90% range"
  contained the true average only **74%** of the time for a 5★-heavy product
  with 20 ratings (the coverage test failed at 0.83). The prior adds five fake
  ratings averaging 3★, which drags 5★-heavy products down.
- **Options tested** (coverage at n = 20 / 50 / 100):

  | Prior | Mop (87% 5★) | Poorly rated | Flat |
  |---|---|---|---|
  | Uniform α₀ = 1 | 0.74 / 0.86 / 0.86 | 0.92 / 0.90 / 0.89 | 0.93 / 0.90 / 0.89 |
  | **Jeffreys α₀ = 0.5** | **0.88 / 0.89 / 0.88** | **0.90 / 0.89 / 0.89** | **0.91 / 0.89 / 0.88** |
  | Amazon-typical × 5 | 0.90 / 0.92 / 0.90 | 0.81 / 0.87 / 0.88 | 0.80 / 0.86 / 0.87 |

- **Decision.** Jeffreys α₀ = 0.5: calibrated for every shape. The Amazon-typical
  prior was rejected because it fails on poorly rated products, the ones shoppers
  most need warning about. Rule added: **never change a seed to make a test pass.**

### 10. A second average beside Amazon's would confuse
- **Observation.** The posterior mean (e.g. 4.3 for the mop) sits right next to
  Amazon's own 4.4.
- **Decision (user).** The badge shows **only the range**: `likely 3.8–4.7 · low data`.

### 11. Tests tried to download Amazon's CSS
- **Difficulty.** happy-dom followed `<link rel=stylesheet>` in the saved pages,
  and the test run crashed.
- **Decision.** Strip `<link>` tags when loading fixtures, so tests stay offline.

## 2026-11-15 · Pipeline B: collecting reviews

### 12. Amazon shows at most 100 reviews per sort/filter
- **Observation (measured by the user).** On the hooks (1,284 written reviews),
  "Show 10 more" stopped at exactly 100, with "To see more, search or filter all
  reviews". Separately, star-only ratings (11,414) are never shown individually,
  so only *written* reviews can be collected.
- **Decisions, in order:**
  1. An "auto-load all" button would gain nothing past the cap. It was dropped.
  2. **Collection planner** (user choice): the side panel tracks 17 sort × star ×
     verified views per product, shows coverage, and opens the next view.
  3. The user found clicking "Show 10 more" ~10 times per view unworkable.
     **"Load this view"** (user choice) is a user-pressed button that clicks
     Amazon's own button every 2–4 s up to the cap. It stops on Stop, a CAPTCHA,
     no progress or a hidden tab. This is the one exception to "never click for
     the user", and the "fully automatic" option was rejected.
- **Evidence.** The drawer mat reached 107 of 107 written reviews (100%) across
  views. Filter counts ("4 matching customer reviews") matched the panel.

### 13. Which reviews count
- **Decision.** Only reviews written in India are analysed. Reviews from other
  countries are stored and counted but excluded (a different population). The
  product's review total uses the unfiltered count, because filtered views show
  smaller numbers.

## 2026-11-15 · Pipeline B: statistics

### 14. Star filters can fake a trend
- **Observation.** Going past the 100 cap needs star filters, which change the
  star mix over time. In simulation, with a theme constant within each star level
  but the collection 80% 1★ early and 80% 5★ late, an unstratified change-point
  test raised a false alarm **89%** of the time.
- **First fix.** Shuffle only within star levels and sum a separate likelihood
  ratio per star level. The false alarms were fixed, but **power fell from 0.85 to
  0.60**: it tests 5 separate questions.
- **Decision.** Cochran–Mantel–Haenszel statistic: each star level is compared
  only with itself, and the evidence is summed in one direction (1 degree of
  freedom), with permutations within star levels.
- **Evidence (n = 300, 500 series).** No change: false alarms 3.8% (plain) /
  5.4% (CMH). Star-mix trap: 89% → 6.4%. Power for 0.10 → 0.25: 85% / 87%.

### 15. 100 reviews detects only big shifts
- **Observation.** Power at n = 100 is 38% for 0.10 → 0.25 and 61% for 0.10 → 0.30.
  At n = 300 the figures are 83% and 99%.
- **Decision.** Keep the minimum at 100, but the UI must say "no significant
  change" means *not enough evidence*. This is also a reason to collect more
  views (entry 12).

## 2026-11-15 · Pipeline B: themes (Phase 4)

### 16. Hindi and Hinglish reviews
- **Observation.** Some amazon.in reviews are in romanised Hindi ("WAPAS NAHI HOGA
  ISLIYE SOCH SAMAJH KAR KHARIDANA…"), which an English-only model embeds poorly.
- **Decision (user), first.** Multilingual MiniLM-L12. That model is **118 MB**
  plus a 17 MB tokenizer, over GitHub's 100 MB file limit, and about 3× slower.
- **Decision (user), revised.** For the trial version, use the English
  **all-MiniLM-L6-v2 (23 MB)**. Hindi-script and Hinglish sentences are detected
  by a word-list heuristic, excluded from themes, and counted in the panel. The
  multilingual model remains a later upgrade.

### 17. Model files can't live in git
- **Decision.** `models/` is git-ignored. `npm run fetch-model` downloads the
  files once, pinned to a Hugging Face commit, with SHA-256 checks. The build
  copies them into `dist/`. The built extension never downloads anything.

### 18. The AI library fetches its runtime from a CDN by default
- **Observation.** transformers.js loads its WebAssembly runtime from
  `cdn.jsdelivr.net` and models from `huggingface.co` unless configured otherwise.
- **Decision.** Ship the ONNX runtime files in `dist/ort/`. Set
  `allowRemoteModels = false` and local paths for the model and the WASM, with
  browser caching off.
- **Follow-up.** The first build shipped two 26–27 MB runtimes (76 MB total). The
  runtime bundled into the worker is the *asyncify* build, so the separately
  copied *jsep* files were both redundant and mismatched.
- **Decision.** Import the asyncify `.wasm` with Vite's `?url`, so Vite emits it
  once into `dist/assets/`. Point transformers.js at that URL (`wasmPaths = { wasm }`)
  and let it use the JS glue already bundled in. The extension went from 76 MB to
  **48.8 MB**.

### 19. Comparing within star levels hides rises carried by low-star reviews
- **Observation.** In a synthetic product where every "adhesive" complaint was
  1★, the complaints rose from 10% to 35%, but the stratified (CMH) test found
  nothing. Within each star level nothing changed: 1★ reviews were *always* about
  adhesive. The rise showed up only as "more 1★ reviews", which stratifying
  attributes to the star mix. This is the price of the fix in entry 14.
- **Decision.** Stratify **only when star-filtered views were collected** (read from
  the planner's view records). With unfiltered collection (Most recent / Top
  reviews, all stars) the star mix is natural, a theme rising together with low
  stars is real signal, and the plain test is used. When stratified, the panel
  says so and explains what it cannot see.
- **Evidence (tests).** Unstratified: the shift is detected. Stratified with the
  theme perfectly tied to 1★: not detected (pinned as a known limitation).
  Stratified with the theme partly tied to stars: detected.
- **Implication for collecting.** For trend questions, prefer unfiltered views
  (Most recent and Top reviews, all stars). Star filters add history at the cost
  of this blind spot.

## 2026-11-21 · First real run in Chrome

### 20. Phase 4 works in the browser, offline. What the real data showed
- **Run.** Zulaxy wall hooks (B0CCM8L54V): 106 India reviews (Most recent, all
  stars, unfiltered → plain test), 202 English sentences, 1 Hinglish review
  excluded, 6 themes, silhouette 0.13.
- **Themes found** (match the visible reviews): paint/wall ("peels the paint",
  "only for tiles not for painted walls"), wrong quantity ("ordered 20, received
  19"), weight/hold, poor quality, value for money, photo frames.
- **Result.** No theme significant after BH. The closest was "received, ordered,
  qty" at 5% → 18% from Oct 2026, p = 0.093, q = 0.393. This is consistent with the
  power table: 106 reviews over 5 months only detects roughly a tripling.

**Observation A: the displayed difference CI is too optimistic.** For the
quantity theme the Newcombe interval was [+1%, +27%], excluding 0, while the
permutation p was 0.093. The interval is computed *after* the scan picked the
best change month, so it ignores that selection (post-selection inference); the
permutation p-value accounts for it.
- **Decision (for Phase 6).** Show the before → after interval only for themes
  that are significant after BH, labelled "not adjusted for choosing the month".
  The p/q values remain the evidence.

**Observation B: themes overlap** (silhouette 0.13 on a −1…1 scale). This is
expected for short, similar product reviews: many sentences mention several
topics ("weak glue, fell with the photo frame").
- **Decision.** Keep k by silhouette for now. Revisit in the research notebook by
  comparing labels against a manual reading of the sentences.

**Observation C: clusters are topical, not sentiment-split.** "money, waste,
useful" mixes "waste of money" with "very useful". MiniLM embeds topic more
than polarity.
- **Decision.** Accept for themes, since the question is "what are people talking
  about". Phase 5 (Gemini Nano labels) can name a cluster's dominant sentiment
  from its exemplars. A per-theme star mix could also be shown in Phase 6.

**Manual check of exemplars (user, 2026-11-21).**
- *received, ordered, qty*: all 6 exemplars before and after the change point are
  about missing pieces ("received 9 pics instead of 10", "received 4 instead of
  committed 10 units", "an open package with only 9 hooks", "only 9 pieces were
  sent…"). The theme is coherent, and it groups different wordings (pics / units /
  hooks / pieces). The method finds a real topic, but there is not enough data yet
  to call it rising.
- *money, waste, useful*: exemplars mix "Very useful product", "I just loved this
  product" with "It's worthless…", "do not buy". This is really an "overall verdict"
  cluster with mixed polarity, confirming observation C. A change in its share is
  uninterpretable without sentiment, which is a concrete reason for Phase 5.
