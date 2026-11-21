# Real Deal

**How much should you trust an amazon.in product's reviews, and have they changed?**

Real Deal is a Chrome extension that adds two things to amazon.in, using honest
statistics computed entirely in your browser:

1. **A rating range** next to Amazon's stars: `likely 3.8–4.7 · low data`.
   An average of 4.4★ from 22 ratings could easily be 3.8 or 4.7. From 11,000
   ratings it is pinned down. The badge shows how sure you can be.
2. **Review themes over time** in a side panel. It finds what reviewers talk about
   ("Missing pieces in the box", "Colour fading after wash") and tests whether
   each topic's share of reviews really changed, or whether the difference
   could just be luck.

<!--
Screenshots: add docs/screenshots/badge.png and docs/screenshots/themes.png, then
restore this table (kept commented out so GitHub shows no broken images):
| Rating badge | Side panel: themes over time |
|---|---|
| ![Rating badge](docs/screenshots/badge.png) | ![Themes over time](docs/screenshots/themes.png) |
-->

## Privacy

- **Everything stays on your computer.** Reviews, analysis results and settings are
  stored only in this browser (IndexedDB and `chrome.storage.local`).
- **On-device AI only.** Sentence meanings come from a small language model
  (all-MiniLM-L6-v2, 23 MB) bundled inside the extension. Optional theme names and
  summaries come from **Gemini Nano**, which runs inside Chrome.
- **Zero network calls.** No server, no accounts, no telemetry. Chrome enforces this:
  the extension's pages and worker run under `connect-src 'self'`, so requests to any
  other origin are blocked. The content script on amazon.in only reads the page.
  Check it yourself with `npm run audit:network` after a build.
- **It only reads pages you open.** The one exception is the **"Load reviews on this
  page"** button: when you press it, Real Deal clicks Amazon's own "Show 10 more"
  for you every 2–4 seconds, up to Amazon's 100 reviews per view. It stops on a
  CAPTCHA or when you switch tabs.

## Install (developer mode)

You need Node.js 20+ and Chrome.

```bash
git clone https://github.com/Saminay786/real-deal.git
cd real-deal
npm install
npm run fetch-model   # once: downloads the 23 MB model (pinned version, SHA-256 checked)
npm run build         # outputs dist/
```

Then in Chrome: `chrome://extensions` → turn on **Developer mode** → **Load unpacked** →
choose the `dist` folder. Pin Real Deal from the puzzle-piece menu.

### Gemini Nano (optional)

Theme names and the written summary use Chrome's built-in Gemini Nano when it's
available. Without it, Real Deal uses keyword labels and a template summary, and
everything else works the same. Gemini Nano needs a recent desktop Chrome, about
**22 GB of free disk space**, and a capable GPU (more than 4 GB VRAM) or CPU
(16 GB RAM, 4+ cores). Chrome downloads the model once, after you click **Use
on-device AI** in the side panel. See Google's
[built-in AI documentation](https://developer.chrome.com/docs/ai/built-in) for
current requirements.

## Using it

1. Open a product on amazon.in. The rating badge appears next to the stars.
2. Click the Real Deal icon to open the side panel. The bar at the top always shows
   the **one next step**:
   - **Open the reviews** → **Load reviews on this page** → **Open: next filter**…
     Amazon shows at most 100 reviews per sort or filter, so Real Deal works through
     star and sort filters to reach older reviews, merging them without duplicates.
   - **Find themes** once at least 100 reviews over 3 months are collected.
3. Read the results. Each theme has a verdict: **Real change**, **Could just be
   luck** or **Not proven**. It also gets a month-by-month chart and a plain-language
   sentence with the counts, for example "5% (3 of 60 reviews) → 13% (6 of 45) since Mar 2025".

## How it works

| Step | Method |
|---|---|
| Rating range | Dirichlet posterior over the 1–5★ shares with a Jeffreys prior; 90% interval by Monte Carlo |
| Themes | Sentences → MiniLM embeddings → spherical k-means (k by silhouette) → c-TF-IDF keywords (+ optional Gemini Nano names) |
| Change over time | Monthly buckets; single change-point scan with a permutation p-value (999 shuffles); stratified by star level (Cochran–Mantel–Haenszel) when star filters made the collection unrepresentative |
| Many themes | Benjamini–Hochberg false-discovery control (q ≤ 0.10) |
| Uncertainty shown | Wilson intervals per month; Newcombe interval for the before/after difference |

Formulas, worked examples and simulation results (false-alarm rate, power by
sample size, the star-filter trap) are in **[docs/METHODOLOGY.md](docs/METHODOLOGY.md)**.
Every problem met along the way, why it happened and how the design changed, is in
**[docs/DECISIONS.md](docs/DECISIONS.md)**.

## Related work

- **Amazon's "Customers say"**: an AI summary of reviews, with no time dimension and no uncertainty.
- **Fakespot** (shut down in 2025) and **ReviewMeta**: authenticity grading, done on
  their servers. Real Deal does not judge authenticity and runs entirely locally.
- **Keepa / camelcamelcamel**: price history, not reviews.
- **BERTopic** (Grootendorst, 2022): the source of the c-TF-IDF labelling idea. Real
  Deal adds per-theme change-point tests with false-discovery control, on-device.

## Limitations

- Only reviews you viewed are analysed, and Amazon decides which reviews it shows
  (at most 100 per sort/filter).
- "Could just be luck" means **not enough reviews to tell**, not "nothing changed".
  With about 100 reviews, only large shifts (roughly a tripling) are detected reliably.
- Complaints about failures after months of use can rise as older units age, even
  if the product sold today is the same.
- A theme can merge related topics (e.g. packaging and clasp). Check its typical
  sentences.
- Hindi and Hinglish reviews are skipped, because the bundled model is English-only.
- Reviewers are not a random sample of buyers.
- amazon.in only. Amazon's page layout changes often, so selectors may need updating.

## Roadmap

- **v2:** search-results re-ranking: a score badge on each result card based on a
  shrunk, uncertainty-aware rating, plus an option to reorder the current page.
- **v3:** multilingual model for Hindi/Hinglish reviews; splitting merged themes;
  theme stability checks; Flipkart support.
- **Research:** validation on the McAuley Lab Amazon Reviews 2023 dataset (`research/`).

## Development

```bash
npm test               # ~200 unit tests incl. simulations (Vitest)
npm run build          # type-check + production build
npm run audit:network  # verify the build cannot make outbound requests
npm run build:fixtures # dev build with a "save page as test fixture" tool
```

Specification and rules for contributors: [CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE) © 2026 Saminay786
