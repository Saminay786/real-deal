# Decision log

What went wrong or surprised us, what we observed, and how the plan changed.
Newest at the bottom.

Each entry records:
1. **What happened**, the symptom we saw;
2. **Why it happened**, the root cause;
3. **Why it wasn't caught earlier**, the gap in our tests or checks;
4. **Decision**, what we changed;
5. **Evidence**, what shows the fix works.

(Entries 1–27 were written before this format. The table below adds the root
cause for each of them.)

## Root causes at a glance

| # | Issue | Why it happened (root cause) |
|---|---|---|
| 1 | Spec lost | The new `CLAUDE.md` was written in a chat and never saved to disk; only the phase plan was copied. |
| 2 | Node missing | Fresh machine; the earlier project was built elsewhere. |
| 3 | Fixtures mis-saved; saver failed | Manual Ctrl+S had no check on *which* tab was saved. Content scripts are not injected into tabs opened before an extension reload, so messages had no receiver. |
| 4 | Name/pincode in fixtures | Amazon repeats personal data in `aria-label` attributes; blanking only `textContent` missed attributes. |
| 5 | Fixture names wrong | Products were picked by eye; rating counts were not checked before saving. |
| 6 | Wrong review URL | The spec assumed `/product-reviews/`; amazon.in now serves `/portal/customer-reviews/`. The assumption was not checked against a live page. |
| 7 | Wrong ASIN from canonical link | Amazon points `rel=canonical` at the parent/another variant, not the page's own item. |
| 8 | Other products' stars read | Product pages embed carousels with their own star ratings; a page-wide search picks them up. |
| 9 | Rating ranges too low | A uniform Dirichlet prior adds 5 pseudo-ratings centred on 3★, but Amazon ratings are mostly 5★, so small products are dragged down. |
| 10 | Two averages side by side | The posterior mean legitimately differs from Amazon's raw average. |
| 11 | Tests fetched Amazon CSS | Saved pages contain `<link rel=stylesheet>`; happy-dom follows links. |
| 12 | Only 100 reviews per view | Amazon caps every sort/filter combination at 100 reviews. |
| 13 | Filtered totals | Amazon's "N customer reviews" shows the *filtered* count when a filter is on. |
| 14 | Star filters fake trends | Filtered collection changes the star mix over time; themes correlate with stars, so the pooled share moves without any real change. |
| 15 | Low power at 100 reviews | Binomial noise at n = 100 is large relative to realistic shifts. |
| 16 | Hinglish reviews | amazon.in reviewers write romanised Hindi; the chosen model is English-only. |
| 17 | Model too big for git | GitHub rejects files > 100 MB; the multilingual model is 118 MB. |
| 18 | CDN downloads / duplicate runtime | transformers.js defaults to a CDN. The worker bundles the *asyncify* runtime, so separately copied *jsep* files were redundant. |
| 19 | Stratified test blind spot | Within a star level, a theme tied to that level is constant, so a rise expressed as "more 1★ reviews" is attributed to star mix. |
| 20 | Interval excludes 0 while p = 0.09 | The interval is computed after the scan *chose* the best month (post-selection); the permutation p-value accounts for the search, the interval does not. Short reviews also overlap in topic (low silhouette), and MiniLM embeds topic more than sentiment. |
| 22 | Unreadable template; brand in labels; inconsistent numbers | Comma-joined labels inside a comma list. The brand name is frequent in one cluster only. Pooled shares and the star-adjusted Δ measure different things. |
| 23 | Junk theme "false, vse, automated" | `textContent` includes `<script>` text; live video reviews embed a player-config script in the body. Fixtures had scripts stripped, so tests never saw it. |
| 24 | Junk theme "video, images, com"; themes change between runs | The stored script also had URLs; splitting sentences at dots cut them into word-like fragments. Clustering short texts has no strongly preferred k, so small input changes flip k. |
| 25–26 | Nano kErrorUnknown | An intermittent model-side failure in JSON-constrained decoding of a long free-text field. A shared session was ruled out (#25 did not fix it). |
| 27 | 4-sentence summary | Nano does not reliably obey length instructions. |
| 28 | AI labels on the wrong themes; "Over 100" | Themes were numbered from 0 and Nano answered from 1, while the checks only tested that ids were *valid*, not *right*. Number checks looked at digits, not qualifiers. |
| 30 | Star-adjusted Δ −32% [−38%, −26%] for a 7-point change | Star-filtered views cover different time spans, leaving strata with 1–3 reviews on one side. Standardisation gave them full weight, and Wald variance is 0 at p̂ = 0 or 1. Unit tests only used balanced strata. |
| 31 | Finding still missing; "13% of the time" | The no-change check ran before trimming, which then removed Nano's 4th-sentence finding. Number checks tested existence, not meaning or subject. |
| 32 | Partial "no change", flipped sentiment, after-shares as totals | Checks covered forbidden content and number placement, not scope, sentiment or which number. Facts gave unchanged themes meaningless before/after numbers. |
| 33 | Next action hidden | Each phase added its own card and button, nothing owned "what should the user do now?", and testing was done by people who knew where everything was. |
| 34 | "Done" hid Load on new filter pages | Next-step rules checked "analysed?" before "page unfinished?", and tests never covered going back to collecting after an analysis. |
| 35 | Stratified a complete collection; one-level Δ shown as overall; unexplained p/q/Δ | The stratify rule ignored completeness. The single-stratum fallback treated "one of five qualifies" like "only one exists". The debug UI was written for developers. |
| 37 | "Range of what?" | Five statistics in one line of notation. The relationships (pooled shares → difference → range → 0) were never drawn, and the format was designed by people who already read CIs. |
| 38 | Verdict sentence still jargon | It restated the statistics (range, 0, chance) instead of the conclusion and its reason (too few reviews). No non-statistician had read it. |
| 39 | "What's the dashed line and the dot?" | Chart marks were explained only in a collapsed legend, with no value on the dot and no direction labels. It was designed by people who already knew the meanings. |
| 40 | "Sometimes 3 bands, sometimes 2" | The ruler and the range band were both grey rounded strips; where the ruler stuck out it looked like extra bands. |
| 41 | Repeated legends, messy list | Each clarification was added inside every theme block and reviewed for one theme, never for the whole list. |
| 42 | Examples off-topic; % hid 3-vs-6 counts | Exemplars were picked by date proximity to the change, not typicality. The broad cluster was named from its centre only. Counts were not shown. |
| 29 | Summary omits "no clear change" | Small models follow "must include" instructions only partly, and validation checked only forbidden content, not required content. |

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

**Manual check of exemplars (user, 2026-11-21).** See below.
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

## 2026-11-21 · Phase 5: on-device AI (Gemini Nano)

### 21. How far to trust the AI
- **Risk.** A language model writing a summary of statistics can invent numbers,
  call a non-significant theme "rising", or label reviews as fake. Nano may also be
  missing, still downloading, or slow on a given PC.
- **Decisions.**
  1. **Labels.** Nano sees each theme's keywords, its average star rating and the
     8 sentences closest to the cluster centre. It must answer in a fixed JSON
     schema (`responseConstraint`). Each label is checked: known theme id, used
     once, 3–40 characters, sentiment one of positive / negative / mixed / neutral.
     Any failure keeps that theme's keyword label.
  2. **Summary.** Nano sees only a small JSON of facts built from the test results
     (review count, period, per theme: mention %, before/after %, start month,
     changed yes/no), never raw reviews. The summary is accepted only if it has
     ≤ 3 sentences, **every number in it appears in that JSON**, it does not say
     "fake", and it claims no rise or fall when nothing changed. Otherwise a fixed
     template with the same facts is shown.
  3. **Availability.** The template summary appears at once. If Nano is
     *available* it runs automatically. If *downloadable*, a "Use on-device AI"
     button starts the download (Chrome requires a click) with a progress bar. If
     *unavailable* or *unsupported*, the panel says so and keyword labels stay.
- **Why sentiment.** Entry 20 showed a "money, waste, useful" cluster mixing
  "worthless" and "very useful". Nano's sentiment field ("mixed") makes that
  visible instead of hiding it behind keywords.
- **Evidence (tests, fake Nano session).** Valid answers are applied. An invented
  "25%" rejects the summary in favour of the template. A crashed model leaves keyword labels
  and the template. The template always passes its own validation.
- **Not yet verified on real Nano in Chrome.**

### 22. Second real product (baby pyjamas, B0HFV4DG93): three display problems
- **Run.** 100 reviews collected with star filters, so the analysis was stratified
  (the panel said so). 233 sentences, 8 themes, silhouette 0.14, none significant.
  Gemini Nano reported *downloadable* and the download started from the button.
  The device supports Nano.
- **A. Template summary unreadable.** "Most discussed: soft, fabric, material (41%),
  quality, good, pants (37%), …" put comma-separated labels inside a comma-separated
  list. **Decision:** quote each label and join with "and".
- **B. Brand names in keyword labels.** "worth, lush, plush" is the brand "Lush
  Plush". **Decision (later):** add the product's brand/title words as extra stop
  words for c-TF-IDF (needs the title stored from the product page). Nano labels
  hide it meanwhile.
- **C. Inconsistent numbers when stratified.** For "set, size, pack" the panel showed
  pooled shares 8% → 5% (−3 points) next to a star-adjusted Δ −8% [−13%, −2%].
  The two measures differ when the star mix changes, and showing them side by side
  is confusing. The interval again excludes 0 while p = 0.26 (entry 20).
  **Decision (Phase 6):** when stratified, show star-adjusted before/after shares
  consistent with Δ, and show intervals only for significant themes.

### 23. Gemini Nano works; a junk theme exposed a reading bug the fixtures hid
- **Nano labels on real data** (baby pyjamas): all 8 themes renamed with
  sentiment: "Fabric Softness" (positive), "Colour Fading" (negative), "Incorrect
  Sizes" (negative), "Value for Money" (positive), "Baby Suit Sizing" (neutral),
  plus a weaker "Go for it". A clear improvement over keyword labels.
- **Nano summary was rejected** by validation and the template was shown, but
  the panel did not say why. **Decision:** record the rejected draft and the
  reason ("number 11 is not in the test results", "says 'fell' although no
  theme changed significantly", …) and show it under the summary. Rejection
  reasons are evidence about how often the model drifts from the facts.
- **Junk theme "false, vse, automated".** On the live page, video reviews embed a
  player-config `<script>` inside the review body. `textContent` includes script
  text, so the JSON (`"isVse": false …`) was stored as review text and clustered
  into its own theme. The fixtures never showed this because the fixture saver
  strips `<script>` tags. **A test environment that differs from production hid
  a production bug.**
- **Decisions.**
  1. Extraction removes `script, style, noscript, template, video` and video
     blocks before reading a review's title and body (test injects a video block
     with a script into a real fixture).
  2. Reviews already stored contain the junk, so sentence splitting also drops
     code-like sentences (braces, `=>`, `function(`, JSON `"key": value`, or > 15%
     symbols). Re-running the analysis cleans existing data without re-collecting.
     Embedding caches recompute automatically because the sentence list changed.
  3. Lesson for fixtures: keep saving them with scripts stripped (privacy and
     offline tests), but add targeted tests for live-only markup.

### 24. URL fragments formed a second junk theme; themes are sensitive to small input changes
- **Observation.** After #23, "false, vse, automated" disappeared but "video,
  images, com" appeared. The stored player script also held media URLs. Sentence
  splitting cut them at dots ("…media-amazon." / "com/images/S/vse-vms-…/video/…"),
  and the code filter (braces, JSON) did not catch the fragments.
- **Decision.** The code-like filter also drops URLs and URL fragments
  (`http:`, `www.`, `/path/`, media file extensions, fragments starting `com/`).
  Prose that merely says "video and images" or "and/or" is kept (tested).
- **Observation (stability).** Removing about 13 junk sentences (233 → 220)
  changed the chosen k from 8 to 7 and regrouped two themes ("Quality of Pants" +
  "Fabric Softness" became "quality, good, fabric" + "soft, material,
  comfortable"). Silhouette stayed about 0.13 either way: the clustering has no
  strongly preferred k on short reviews.
- **Decision.** Accept for the extension, but **measure stability in the research
  notebook** (e.g. adjusted Rand index between runs on bootstrap resamples and
  across seeds), and report it. If unstable, consider a fixed k, a minimum
  silhouette gap, or merging near-duplicate clusters.
- **Also seen.** Three themes at p ≈ 0.09–0.11 (q = 0.247), none significant, and
  again intervals excluding 0 (entry 20, Phase 6 fix pending).

### 25. The Nano summary crashed when sharing a session with the labels
- **Observation.** With the reason now shown (#23), the rejected summary turned out
  to be a crash, not a validation failure: "AI error: An unknown error occurred:
  kErrorUnknown". Labels (the first prompt) succeeded: "Fabric/Quality",
  "Material comfort", "Colour fading after wash", …
- **Likely cause.** One session was used for both prompts. A session keeps the
  whole conversation, so the summary prompt carried ~7 themes × 8 sample sentences
  plus the label answer, which plausibly exceeded Nano's small context window.
- **Decision.** Each prompt runs in a **fresh session**, destroyed afterwards,
  with **one retry** in another new session on error. The first session is the one
  that triggers and reports the model download.
- **Evidence (tests, fake Nano).** Two prompts use two sessions. A
  `kErrorUnknown` on the summary is retried and succeeds. Total failure falls back
  after 4 attempts (2 prompts × 2). Still to confirm on real Nano.
- **Also seen.** "video, images, com" (now named "Product video") was still
  present with the same 220 sentences. Either the #24 build had not been loaded,
  or those sentences are not URL fragments. Next step: read that theme's examples.

### 26. kErrorUnknown is specific to the JSON-constrained summary
- **Observation.** After #25 (fresh session + retry), labels again succeeded
  (8 themes: "Fading Colors", "Incorrect Pack", "Softness of Fabric", …), but
  the summary still failed twice with kErrorUnknown. So it is not context
  overflow. The difference from the working label prompt is the schema: a single
  long free-text field (`summary`, maxLength 450) under constrained decoding.
- **Also confirmed.** The URL-fragment junk theme is gone after reloading
  (220 → 218 sentences). "video" remains as an ordinary word in one cluster.
- **Decision.** Try the JSON-constrained summary once; if that call errors, ask
  again in a new session **without** `responseConstraint`, requesting only the
  sentences. The plain-text answer is cleaned (quotes, code fences, "Summary:")
  and passes **the same validation** (numbers, ≤ 3 sentences, no false change
  claims). The panel notes "plain-text fallback" when used, and the rejection
  reason names both errors if both fail.

### 27. Nano writes a summary, but too long
- **Observation.** On the next run the JSON-constrained summary call *succeeded*,
  so kErrorUnknown (#25, #26) is intermittent; the plain-text fallback stays as a
  safety net. The draft was rejected for "4 sentences (max 3)". Labels again
  worked for all 8 themes, worded slightly differently from the last run ("Good
  fabric quality", "Incorrect Pack Sent", "Product Liked"): Nano's labels vary
  between runs.
- **Decision.** Before validation, keep only the **first 3 sentences** of an
  over-long answer. Trimming can only remove claims, never add an unverified
  number, so the number and change-claim checks then run on what is shown. The
  panel notes "trimmed to 3 sentences". A trimmed answer that still breaks a rule
  is rejected as before (tested).
- **Open.** Label wording varies run to run. If that bothers users, cache labels
  per (product, theme keywords) so re-runs keep the same names.

### 28. AI labels were attached to the wrong themes
- **What happened.** On the pyjamas, the AI summary was *accepted* and 7 of 8
  themes got AI names, but the names belonged to other themes. "Value for money"
  sat on a theme whose examples were all about colour fading ("After one wash the
  cloth colour faded…"), "Colour fading problem" on a theme about pants, and
  "size, baby, newborn" got no name at all. The accepted summary repeated the
  wrong names ("baby sized clothing … mostly positive") and also said "**Over**
  100 reviews" when there were exactly 100. A new junk sentence also appeared as
  an example: "The media could not be loaded."
- **Why it happened.**
  1. The label prompt numbered themes "Theme 0 … Theme 7" and asked for answers
     by id. Nano answered with ids **1 … 8** (counting from one, as people do).
     Each name landed on the next theme, and id 8 matched nothing, so 7 names
     were applied.
  2. "Over 100": the summary checks verified that each *number* came from the
     facts, not the *words around it*. "Over", "nearly" and "more than" change a
     number's meaning without changing the digits.
  3. "The media could not be loaded." is a message Amazon's video player writes
     *as page text* inside the review body. It is not in a `<script>`, so the #23
     fix did not remove it.
- **Why it wasn't caught earlier.** The label checks were *syntactic*: is the id
  a number, a known theme, not repeated? An off-by-one answer passes all three.
  The fake-Nano tests always answered with correct ids, so they never exercised
  the way a real model gets numbering wrong. Nothing compared a label with its
  theme's content. The user spotted it by reading the examples next to the names.
- **Decision.**
  1. Identify themes by their **keywords**, not numbers. The prompt lists each
     group by its keywords, and the answer must copy them. A label is applied only
     to the theme whose keywords match (case and quotes ignored), so a shifted or
     renumbered answer can no longer attach a name to the wrong theme.
  2. Reject summaries that put **over / more than / under / less than / fewer
     than / nearly / almost / at least / up to** before a number, and tell the
     model to write numbers exactly as given.
  3. Treat Amazon video-player UI text ("The media could not be loaded.", "Video
     player is loading", …) as non-review text.
- **Evidence (tests).** A test reproduces the real failure: entries with ids 1
  and 2 but keywords of themes 1 and 0 land on the correct themes. Unknown
  keywords and duplicates are dropped. "Over 106 reviews" and "Nearly 33%" are
  rejected, while "33% of 106 reviews" is accepted. "The media could not be
  loaded." is filtered. Still to confirm on real Nano.
- **Lesson.** Validate *meaning*, not just *format*: whenever the model refers
  back to an item, make it quote something checkable about that item.

### 29. Phase 5 verified on real Nano; the summary left out the main finding
- **What happened.** After #28, on the pyjamas (100 reviews, 216 sentences,
  7 themes), every AI name matched its examples: "Price/Value" ↔ "Worth the money",
  "Color/Wash Issues" (mixed) ↔ "colour faded" / "No colour fading", "Size/Returns"
  (negative) ↔ "GO FOR 1 SIZE BIGGER". The AI summary passed every check and was
  shown. But it never said that **no theme changed clearly**, which is the main
  result: "There were 100 reviews … Product enjoyment and Fabric Comfort were
  frequently mentioned with positive sentiment. Quality Assessment was also
  commonly mentioned…"
- **Why it happened.** The prompt *asked* for "say there was no clear change",
  but small models follow instructions only partly. Our validation only checked
  what the summary must *not* say (invented numbers, false change claims, "fake"),
  never what it *must* say.
- **Why it wasn't caught earlier.** Every earlier real summary failed for other
  reasons (crash, 4 sentences, wrong labels), so this was the first accepted one
  to read. The fake-Nano test summaries always included the finding.
- **Decision.** If no theme changed and the AI's text does not state it (phrases
  like "no clear/significant change", "did not change", "unchanged", "stable"),
  lead with the factual sentence "No theme changed clearly from {period} ({n}
  reviews)." and keep the AI's first two sentences. Note "first sentence added from
  the test results". Summaries that already say it are left as written.
- **Evidence (tests).** The real Nano wording is reproduced and gets the
  finding prepended. A summary that already says "No theme changed
  significantly…" is unchanged.

### 30. First large product (boAt Airdopes): star-adjusted Δ was nonsense
- **Run.** boAt Airdopes, 503 reviews captured of 4,079 (12%), 15 months (Jun 2025
  to Nov 2026), from 7 views (Most recent: all stars and each of 5★…1★; Top
  reviews: all stars). 493 analysed (10 Hinglish excluded), 940 sentences, 8
  themes, stratified. No theme significant. Closest: "Battery life concerns"
  p = 0.053, "BoAt Airdopes problems" p = 0.094, "Price/value" p = 0.108 (all
  q = 0.288).
- **What happened.** The star-adjusted differences contradicted the shares beside
  them, with impossibly narrow intervals: "17% → 10% · Δ −32% [−38%, −26%]",
  "24% → 16% · Δ −30% [−37%, −23%]".
- **Why it happened.** Each star-filtered view holds the *100 most recent* reviews
  of that star level, so star levels cover very different time spans: frequent
  5★ reviews only the last weeks, rare 1★ reviews a year or more. At a given
  change month some star levels therefore had 1–3 reviews on one side.
  1. Direct standardisation weighted them by their *total* size, so one review
     could move the estimate by up to ±100 points.
  2. The Wald variance p̂(1 − p̂)/n is **0 when p̂ = 0 or 1**, so those strata
     claimed perfect certainty and the interval collapsed.
  The p-values were unaffected: they come from permutations, not this formula.
- **Why it wasn't caught earlier.** The unit tests used balanced strata (50 and
  100 per side). The two earlier real products had few or no tiny strata. Nothing
  checked that Δ was consistent with the shares shown next to it.
- **Decision.** In `standardizedDiff`, use only strata with **≥ 10 reviews on each
  side**, and **Agresti–Caffo** adjusted proportions p̃ = (k + 1)/(n + 2) for both
  the estimate and the variance, so 0% or 100% never means zero uncertainty. With
  one usable stratum, fall back to Newcombe.
- **Evidence (tests).** A reproduction of the tiny-stratum case is now ignored,
  with an honest width. All-0% / all-100% strata keep a non-zero width. The
  hand-computed AC example gives d = 0.0641 [−0.0080, 0.1362].

**Also from this run.**
- **The summary misuses a number.** "Sound quality feedback was mentioned
  positively 28% of the time." 28% is that theme's *after-change share*, not a
  share of positive mentions. It passed because each number *exists* in the facts.
  **Why:** checks verify membership, not what a number refers to. **Open:** tie
  each number to its theme and field (e.g. require "28%" to appear in the same
  sentence as that theme's label), or show only the template when a summary
  quotes percentages.
- **The no-change sentence (#29) was not added.** The note said only "trimmed to 3
  sentences". The likely reason is that the extension was not reloaded after #29;
  to confirm on the next run.
- **Interpretation caveat: time since purchase.** Many complaints are failures
  *after months of use* ("keep connecting inside the case after 5 months", "doesnt
  work properly for even 6 months"). Reviews written or updated later describe
  older units, so a rise in such themes can reflect the product *ageing* in
  buyers' hands, not a change in what is being sold. Note this in the UI
  limitations (Phase 6).

### 31. Δ fix confirmed; summary checks were in the wrong order, and percentages could change meaning
- **Δ fix (#30) confirmed on boAt.** "Battery performance 17% → 10%, Δ −8% [−16%,
  +1%]", consistent now (was −32% [−38%, −26%]). One theme shows opposite
  signs, "Sound quality 31% → 28%, Δ +8%". That is not a bug but a Simpson's-paradox
  case: within each star level sound-quality mentions rose slightly, while the mix
  shifted towards low-star reviews, which rarely praise sound. The Phase 6 UI must
  show star-adjusted before/after shares so the numbers agree on screen.

**A. "No clear change" still missing.**
- *What happened.* The #29 fix did not fire: the note said only "trimmed to 3 sentences".
- *Why.* The "does it say no change?" check ran on the AI's **full** answer,
  *before* trimming to 3 sentences. Nano wrote the finding as its 4th sentence:
  the check passed, then trimming deleted that sentence.
- *Why not caught.* The #29 test used a 3-sentence answer, so trimming never
  removed anything. No test combined "over-long" with "finding at the end".
- *Decision.* Trim first, then check what will actually be shown. A test
  reproduces the 4th-sentence case.

**B. Percentages changed meaning.**
- *What happened.* "Battery performance was viewed negatively 13% of the time",
  "Sound quality was mentioned positively 28% of the time". 13% and 28% are shares
  of reviews *mentioning* the theme, not shares of negative or positive opinions or "of the time".
- *Why.* The validator only checked that each number *exists somewhere* in the
  facts, not *what it refers to*. A real number with the wrong subject passes.
- *Why not caught.* Test summaries were written by us, with correct meanings.
  #30 had flagged the same issue as "open" without a fix.
- *Decision.* Every percentage must be written as "N% of reviews" (or "N% to M%
  of reviews", or "label (N%)"), **in the same sentence as the theme label it
  belongs to**, and must equal one of that theme's numbers. The prompt says so
  explicitly. Tests: "33% of the time" is rejected, and a correct percentage next to
  the wrong theme is rejected.
- *Trade-off.* Paraphrased labels ("battery life" for "Battery performance") are
  now rejected and fall back to the template. Strict but safe.

### 32. Accepted AI summary still misleading in three ways
- **What happened (boAt).** The AI summary passed all checks: "…the value for money
  theme was mentioned in 15% of reviews, while issues with sound quality were
  mentioned in 28% of reviews. The reported battery problems were mentioned in 10%
  of reviews. There was no clear change in the topics of product defects, earbud
  issues, and mixed feedback…"
  1. A *partial* no-change statement ("no clear change in X, Y and Z") implies the
     other themes did change. None did.
  2. "Issues with sound quality" for a theme the AI itself labelled *positive*
     ("Sound quality is so good").
  3. 28% and 10% are *after-change* shares of unchanged themes, presented as
     whole-period shares (whole-period figures were ~29% and ~13%).
- **Why it happened.** The checks covered *forbidden content* (unknown numbers,
  "rose/fell", "fake") and number *placement*, but not (1) whether the no-change
  statement covers *all* themes, (2) whether wording matches a theme's sentiment,
  or (3) *which* of a theme's numbers is used. The facts JSON gave unchanged themes
  three numbers, two of them meaningless.
- **Why it wasn't caught earlier.** The previous fix (#31) made the rule "a
  percentage must belong to the theme in its sentence", and an after-share does
  belong to the theme. Partial statements and flipped sentiment had never appeared
  in test summaries.
- **Decision.**
  1. The "no change" phrase must be global ("No theme changed…", "none of the
     themes…", "no change in any/all…", "all themes stayed…"). Otherwise the
     factual sentence is prepended.
  2. Within ~30 characters of a positive theme's label, "issue(s), problem(s),
     complaint, concern, defect, negative, disappoint…" rejects the summary, and
     "praise, liked, loved, positive, satisfied…" near a negative theme does too.
     The label's own words are excluded.
  3. The facts JSON carries before/after/from **only for themes that changed**.
     Unchanged themes have just their whole-period share.
- **Evidence (tests).** The partial statement gets the finding prepended; "Issues
  with <positive theme>" is rejected while the bare label passes; the narrative
  input for an unchanged theme has only `mentionedPct`.
- **Pattern across #28–#32.** Each fix closed one way a fluent model can mislead
  while staying "within the facts". Rule-based validation catches known failure
  shapes, not meaning in general. The template summary remains the safe default,
  and the panel always says which one is shown.

### 33. The next action was hidden
- **What happened.** The user: "which button to click now is hidden". The side
  panel stacked the collection card (with a long tip), a 17-row view list with
  "Load this view" and "Open" inside it, then the summary and themes, each with
  its own button. The one action that mattered at each moment could be several
  screens down.
- **Why it happened.** Each phase added its own card and button where it was
  convenient to build. Nothing owned the question "what should the user do now?",
  and the panel grew one card per feature, not around the user's task
  (collect → analyse → read).
- **Why it wasn't caught earlier.** Testing was done by us with knowledge of the
  internals, so we knew where each button was. No step looked at the panel as a
  first-time user would.
- **Decision.**
  1. A **next-step bar pinned to the top** with exactly one primary button and a
     3-step progress strip (Collect reviews → Find themes → Read results). The
     choice is a pure, tested function (`decideStep`): open reviews, load this
     page, open the next filter (when Amazon's 100 is reached and more are
     needed), find themes (with optional "collect more"), analysing, done.
  2. **Results first.** Summary and themes come right under the bar, and the
     collection details follow.
  3. The 17 filters are **folded** into "All review filters (7 of 17 done)". The
     duplicate buttons and the long tip are removed.
- **Evidence.** 7 tests cover every branch of `decideStep`. Still to confirm in
  Chrome with the user.

### 34. After an analysis, a new filter page showed "Done" with no Load button
- **What happened.** On a Timex watch, after running the analysis, the user switched
  to "Top reviews · all stars" (10 loaded). The bar said "Done. Results are below ↓"
  with only "Re-run analysis", so there was no way to load that page.
- **Why it happened.** `decideStep` checked "analysis done?" *before* "is this
  review page unfinished?". Once an analysis existed, every later page short-
  circuited to "Done". Also, nothing compared the review count at analysis time
  with the current one, so results silently went stale as more were collected.
- **Why it wasn't caught earlier.** The #33 tests covered each state on its own path
  (collect → analyse → done) but never "done, then go back to collecting". That is
  the normal way people use it: analyse, then collect more.
- **Decision.**
  1. An unfinished review page always offers **"Load reviews on this page"** first,
     even after an analysis. If the minimum is already met, a "Find themes now" link
     sits under it.
  2. After an analysis, if reviews were added since (current usable count minus the
     analysed + excluded count), the bar shows **"N new reviews since your last
     analysis"** with **Re-run analysis** as the primary button. Otherwise "Done".
- **Evidence.** A test reproduces the real case (themes done + partial view →
  load-view). Stale results lead to "rerun", unchanged results to "done".

### 35. Complete collection: no need to stratify; a one-star-level Δ shown as overall; numbers unexplained
- **Run.** Timex couple watch set: **105 of 105 written reviews (100%)** over 59
  months (Nov 2016 to Oct 2026), collected through 10 filters. 163 sentences, 7
  themes, silhouette 0.19, none significant. That is plausible for an unchanged
  classic product.
- **A. Stratified although nothing was missing.**
  - *Why it happened.* The rule from #19 asked only "were star filters used?". Star
    filters bias the mix only when the collection is a *partial* sample. With every
    review collected, the union of all filters is the whole population, so the
    star mix is the real one.
  - *Why not caught.* Earlier products had partial collections, and no test
    considered "filters used *and* complete".
  - *Decision.* Stratify only if filtered views were used **and** collected <
    Amazon's written-review total. Complete collection gets the plain, more
    powerful test.
- **B. "7% → 13%, Δ +21% [−1%, 36%]".**
  - *Why.* With few reviews per star level, only one level (likely 5★) had ≥ 10 on
    both sides, so `standardizedDiff` fell back to *that level's* Newcombe interval.
    The asymmetric range gave it away. A single star level's change was shown as
    the overall change.
  - *Why not caught.* The single-stratum fallback was designed for "only one level
    exists", not "only one of five qualifies".
  - *Decision.* Use the star-adjusted Δ only when **≥ 2 star levels** qualify, and
    otherwise the pooled Newcombe Δ that matches the before → after shares shown.
- **C. "How do I read p, q and the triangle?"** (user).
  - *Why.* The debug list showed statistical notation with no explanation. It was
    built for us, not for shoppers.
  - *Decision.* Add a "How to read this" box to the Themes card. Phase 6 will
    redesign the display around plain language.
- **Also.** The filter list now says "Every written review is collected. The
  remaining filters would add nothing" instead of showing "10 of 17" as unfinished.

### 36. Fixes #31–#35 confirmed on real data (Timex, complete collection)
- **Unstratified test** used for the complete collection: the "compared within star
  levels" note is gone.
- **Δ consistent with the shares:** "20% → 35%, Δ +15% [−3%, 31%]", "7% → 13%, Δ +7%".
  Before #35 the latter read "Δ +21%".
- **AI summary accepted and faithful:** "No theme changed clearly. The most
  mentioned themes are Quality product (35% of reviews), Gifting item (19% of
  reviews), Daily watch use (29% of reviews), and Value for money (11% of
  reviews). Chain lock quality was mentioned in 9% of reviews." It states the global
  finding first, writes every number as "% of reviews" next to its own theme's
  whole-period share, and keeps sentiment consistent. It was trimmed from a longer answer.
- **AI labels and sentiment fit the examples:** "Chain lock quality" (negative),
  "Picture color match" (mixed: "colour not as shown"), "Gifting item" (positive).
- **Status.** Phase 5 and the collection/next-step UI are verified end to end on
  four real products (hooks, baby pyjamas, boAt Airdopes, Timex). Open items for
  Phase 6: plain-language theme rows and per-theme charts; intervals shown only
  for significant themes (#20); time-since-purchase caveat (#30); brand words in
  keyword labels (#22B). Still to measure in the research notebook: theme stability
  between runs (#24).

### 37. Numbers without a picture were not understood
- **What happened.** After the legend (#35) and two text explanations, the user
  still asked what "[−6%, 24%]" was a range *of* ("what one number? what are you
  even saying?"). They also asked whether the percentages were per month.
- **Why it happened.** Each theme row packed five statistics into one line
  ("13% → 23% of reviews, from May 2023 · Δ +10% [−6%, 24%] · p = …, q = …").
  The relationship between them (two pooled shares, their difference, a range
  around the difference, and 0 as the reference) existed only in notation.
  Explanations in chat cannot fix a display that does not show those
  relationships.
- **Why it wasn't caught earlier.** The row format was designed by and for people
  who already read confidence intervals. "Pooled before/after, not per month" was
  never written anywhere on screen.
- **Decision.** Each theme gets a small inline-SVG picture: grey "Before <month>"
  and blue "After <month>" bars with their %, then a **change line** with the dot
  at the change in points, the **shaded range**, a dashed **"0 = no change"** mark
  and the range's ends labelled. It is followed by one plain sentence: "Mentions went
  from 13% to 23% of reviews: a change of +10 points. The real change is likely
  between −6 and +24 points. The range includes 0, so this could be chance." The
  p/q line becomes a small "Test:" note. The legend describes the picture. This
  starts the Phase 6 work early.
- **Evidence.** Builds and renders the same data. Still to see in Chrome with the user.

### 38. "The range includes 0, so this could be chance" was still jargon
- **What happened.** The user asked for the verdict sentence in layman's terms.
- **Why it happened.** "Range", "includes 0" and "chance" assume the reader already
  knows what a confidence interval is and why 0 matters. The sentence restated the
  statistics instead of the conclusion, and it did not say *why* luck is plausible
  (too few reviews).
- **Why it wasn't caught earlier.** #37 replaced notation with a picture but kept the
  verdict in statistical vocabulary. Nobody outside statistics had read it.
- **Decision.** Lead with the verdict in everyday words and give the reason in terms
  of review counts:
  - range covers 0: **"Could just be luck. With only {before} reviews before and
    {after} after, a gap this size often shows up even when nothing really changed."**
  - range misses 0 but the test says no: **"Looks like a change, but not proven. We
    checked every month to find the biggest jump, and jumps this big still turn up
    by luck."**
  - significant: **"Real change. A jump this big is very unlikely to be luck."**
  - The range itself reads "The true change could be anything from a 6-point drop
    to a 24-point rise" (`rangeWords`, tested, including "an 8-/11-/18-point").

### 39. The change graph's marks were unlabelled
- **What happened.** Seeing the #37 graph in Chrome, the user asked "what's the
  dash line and what's the point over that change graph?"
- **Why it happened.** The dot had no value on it, the dashed line was labelled only
  far below it ("0 = no change"), and nothing said which direction meant more or
  fewer mentions. The legend explaining them sits in a collapsed box.
- **Why it wasn't caught earlier.** The graph was designed from a sketch in which
  we already knew what each mark meant, and it was not looked at cold before
  shipping.
- **Decision.** Label directly on the graph: the dot shows its value ("−9 seen"),
  the axis says "← fewer mentions" / "more mentions →", the zero mark repeats the
  dashed symbol, and a one-line key sits under each graph: "● dot = change seen in
  these reviews · shaded band = where the true change could be · ┆ dashed line =
  no change". General rule: **every mark on a chart is labelled where it appears**,
  not only in a legend.

### 40. "Sometimes 3 bands, sometimes 2"
- **What happened.** The user saw a varying number of "bands" on the change line.
- **Why it happened.** There is only one range band, but the ruler behind it was a
  solid grey line and the band was also grey (for non-significant themes), with a
  similar rounded shape. The ruler sticking out on both sides read as three strips.
  When the band reached one end of the ruler (its scale is set by the larger end of
  the range), only one side stuck out and it read as two.
- **Why it wasn't caught earlier.** It was checked against the design intent, not
  looked at as a stranger would. Same colour plus similar shape means the same thing
  to a reader.
- **Decision.** The ruler is a faint dotted hairline. The band is a taller box in
  a distinct colour (blue when not significant, red or green when it is), with a
  solid outline. The key calls it the "coloured box". Rule: **different meanings
  never share colour and shape on a chart.**

### 41. The repeated key made the theme list messy
- **What happened.** The user: "these legends repeated is a mess; clear the visuals".
  Each theme showed the graph, an identical three-part key, a four-line paragraph,
  a "Test: p, q" line and "Examples". The verdict was buried in the paragraph.
- **Why it happened.** Fixes #37–#40 each added explanation *where the confusion
  happened*, inside every theme block. Explanations that should exist once were
  repeated per theme, and nobody looked at the list as a whole with 7 themes.
- **Why it wasn't caught earlier.** Each change was reviewed for one theme, the one
  being discussed, never for the full list.
- **Decision.** One compact block per theme:
  1. a header line with the name, tone tag and a **verdict chip** ("Real change" /
     "Could just be luck" / "Not proven");
  2. the graph, with only the dot's value and a small "0" on it;
  3. one line: "12% → 3% of reviews since Mar 2026 (−9 points)";
  4. **Details** (folded): range in words, review counts and why it could be luck,
     the p/q test, keywords, examples.

  A **single key** at the top of the card shows the bar, dot, box and 0-line
  symbols, plus "Box crosses the 0 line → could just be luck". The verdict rule is
  `verdictOf` (tested).
- **Rule.** Explain a symbol once per screen, not once per item.

### 42. "Chain lock quality": examples didn't match the name, and percentages hid tiny counts
- **What happened.** The user asked about "Chain lock quality" (negative): 5% → 13%
  since Mar 2025. Its "before" examples were "Online warranty is available",
  "Stopped working after 15 days" and "inner packaging … scratches", and its
  "after" examples included "did not come with wrapping" and "Packing could be
  improved". Only one sentence was about the chain lock.
- **Why it happened.**
  1. Exemplars were taken from the reviews **nearest in date to the change
     point**: the first theme sentence of whichever reviews sat there. They
     represent the date, not the theme.
  2. The cluster is genuinely broad (chain lock + packaging + warranty). Its AI name
     came from the 8 sentences closest to the centre, which happened to be about
     the chain lock, so the name overstates how specific the theme is.
  3. 5% → 13% is **3 of 60 reviews → 6 of 45**, but only percentages were shown,
     so a 3-review difference looked like a trend.
- **Why it wasn't caught earlier.** Synthetic tests have one identical sentence per
  topic, so any exemplar choice looks right. On real data we had only read
  exemplars of coherent themes ("received, ordered, qty").
- **Decision.**
  1. Exemplars are the theme's **most typical sentences** (highest cosine similarity to
     the theme centre) among the reviews on each side, de-duplicated, and labelled
     "Most typical sentences before/after".
  2. Every theme line shows counts: **"5% (3 of 60 reviews) → 13% (6 of 45) since Mar
     2025, +8 points"**.
- **Open.** Broad clusters still get specific names. Options: give Nano a random
  sample of the cluster (not just the centre) so the name reflects its breadth, or
  show each theme's coherence (within-cluster similarity) and flag broad ones.
