# Methodology

Every statistical method used by Real Deal is documented here with its formula.
Methods are added as they are built.

## Review collection: what data the analysis sees

Theme trends (pipeline B) are computed only from reviews **the user has
viewed** on amazon.in. The extension never fetches pages or clicks "Show 10
more" itself. That makes the sample depend on how the user browsed:

- **Unit.** One review = one stored record, keyed by Amazon's review ID
  (`R3RST0O7ZS3260`). Seeing the same review again (another visit, a filter,
  overlapping pages) updates it but never counts it twice.
- **Population analysed.** Reviews written in India (`Reviewed in India on …`).
  Reviews from other countries are stored and counted in the panel, but
  excluded: they are a different buyer population and are often a different
  product variant.
- **Minimum.** At least 100 usable reviews spread over at least 3 calendar
  months. The side panel shows how many more are needed. Phase 3 refines the
  month check after merging sparse months.
- **Sampling bias to keep in mind.**
  - *Most recent* order gives a contiguous run of the newest reviews. This is
    the right input for "what changed recently", but it covers only as far back
    as the user scrolled.
  - Star and variant filters reach older reviews but over-represent that star
    level or variant. Mixing filtered and unfiltered collections changes the
    star mix over time and can create spurious theme shifts. Phase 3 has to
    account for this before running any test.
  - Amazon shows **at most 100 reviews per sort/filter combination** (measured
    on 2026-11-15: the hooks listing stopped at exactly 100, with "To see more,
    search or filter all reviews"). Going further back requires filters, which
    is why the star-mix problem above matters.
- **Total on Amazon.** "1,283 customer reviews" counts *written* reviews, not
  star ratings (11,413). Star filters lower the number shown, so the largest
  value seen is kept.

## Theme trends: overview

For one product and one theme (say "adhesive stopped sticking"), each usable
review $i$ has a date and an indicator

$$x_i = \begin{cases} 1 & \text{if any sentence of review } i \text{ belongs to the theme} \\ 0 & \text{otherwise.} \end{cases}$$

The question is whether the share of reviews mentioning the theme changed at
some point in time. The pipeline:

1. **Bucket** reviews by month so that each point on the chart has enough data.
2. **Intervals** around each month's share, and around the before/after difference.
3. **Change-point test**: find the most likely change and get a permutation p-value,
   comparing reviews only within the same star level.
4. **False discovery rate** across all themes of the product.

## Themes

**Sentences.** Each review's title and body are split on `. ! ? ।` and line
breaks. Pieces with fewer than 3 words ("Good", "12 unused") are dropped.

**Language filter.** The embedding model is English-only. A sentence is treated
as non-English if it contains Devanagari script, or if at least 2 of its words,
and at least 20%, are common romanised-Hindi words ("hai", "nahi", "wapas",
"isliye", …). English homographs ("to", "me", "so") are excluded from the list.
Non-English sentences are dropped. A review left with no English sentence is
excluded from the analysis entirely (numerator *and* denominator) and counted in
the panel. A review with no sentence of 3+ words ("Good") stays in, with
$x_i = 0$ for every theme: it genuinely mentions none of them.

**Embeddings.** all-MiniLM-L6-v2 (quantized, 384 dimensions) maps each sentence
to a vector $v \in \mathbb{R}^{384}$, mean-pooled over tokens and normalised to
$\|v\| = 1$. For unit vectors, cosine similarity is the dot product
$\cos(u, v) = u \cdot v$, and we use the distance $d(u, v) = 1 - u \cdot v$.
Sentences with similar meaning are close even without shared words: "The hook
fell off the wall" vs "It does not stick to the wall" scores 0.32, while both
score under 0.15 against "Great value for money".

**Clustering: spherical k-means.**
1. *Seeding (k-means++).* Pick the first centre at random. Pick each next centre
   with probability proportional to $d(x, \text{nearest centre})^2$, which spreads
   the centres out.
2. *Assign* each sentence to the centre with the largest $x \cdot c_j$.
3. *Update* each centre to the normalised mean of its sentences:
   $c_j = \sum_{x \in C_j} x \,/\, \|\sum_{x \in C_j} x\|$.
4. Repeat 2–3 until no assignment changes (at most 100 iterations). Run 10
   restarts and keep the one with the smallest total distance $\sum_i d(x_i, c_{j(i)})$.

**Choosing the number of themes $k$ (silhouette).** For a sentence $i$, let
$a(i)$ be its mean distance to the other sentences in its own cluster, and
$b(i)$ the smallest mean distance to the sentences of any other cluster:

$$s(i) = \frac{b(i) - a(i)}{\max\{a(i), b(i)\}} \in [-1, 1].$$

Values near 1 mean it sits well inside its cluster, and values near 0 mean it is
on a border. We try $k = 3, \dots, 8$ and keep the $k$ with the highest mean
$s(i)$, computed on the same seeded sample of up to 500 sentences for every $k$.
At least 30 English sentences are needed.

**Labels: c-TF-IDF.** All sentences of a cluster are treated as one document.
With $\text{tf}(t, c)$ the count of word $t$ in cluster $c$, $f(t)$ its count
across all clusters, and $A$ the average number of words per cluster:

$$w(t, c) = \text{tf}(t, c) \cdot \log\!\left(1 + \frac{A}{f(t)}\right).$$

Words frequent in this cluster but rare elsewhere score highest. Stop words and
generic shopping words ("product", "amazon", "buy") are removed. The label is
the top 3 words.

**From sentences to reviews.** For each theme, review $i$ gets $x_i = 1$ if any
of its sentences is in that cluster. The theme's share in a month is then "the
share of reviews that mention it", and the bucket and change-point steps below
run on these $x_i$.

**When to compare within star levels.** Star-filtered views distort the star mix
over time (see *Why stratify*), so the change-point test is stratified by star
**only if star-filtered views were collected** for the product. Stratifying has a
blind spot: if a theme lives entirely in one star level (every "adhesive"
complaint is 1★), a rise in it appears only as "more 1★ reviews", which the
stratified test attributes to the star mix. In a synthetic test it detected
nothing, while the unstratified test caught the shift. With unfiltered collection
the star mix is natural, so the plain test is used and such rises are visible.

## On-device AI labels and summary (optional)

When Chrome's built-in Gemini Nano is available, it names each theme and writes
a short summary. Nothing statistical depends on it, and every output is checked:

- **Theme names.** Input: keywords, average star rating, and the 8 sentences
  closest to the theme's centre (largest $x \cdot c_j$). Output: JSON
  `{id, label, sentiment}` forced by a schema. Invalid items keep the keyword label.
- **Summary.** Input: only a facts JSON derived from the test results, not
  reviews. The output is accepted only if every number in it occurs in the facts,
  it has at most 3 sentences, and it claims no change when no theme was
  significant. Otherwise a deterministic template is used:
  - *changed:* "Mentions of "X" rose from 5% to 17% of reviews from Oct 2026."
  - *no change:* "No theme changed clearly from Jul 2026 to Nov 2026 (106 reviews).
    Most discussed: …"

## Monthly buckets

Reviews are sorted by date and grouped by calendar month. Thin months are
merged so every bucket has $n \ge 15$ reviews:

- Walk through the months in order, adding each to the open bucket. Close the
  bucket as soon as $n \ge 15$.
- If the last bucket ends with $n < 15$, merge it into the previous one.
- Months with no reviews are absorbed into the bucket that spans them.

**Example.** Jan 10, Feb 10, Mar 20, Apr 0, May 5 reviews gives the buckets
[Jan–Feb] $n=20$ and [Mar–May] $n=25$. May's 5 reviews are too few alone, so
they join March.

The analysis needs at least 100 reviews and at least 3 buckets.

## Intervals

**Wilson score interval** for a bucket share $\hat p = k/n$ at $z = 1.96$:

$$\frac{\hat p + \frac{z^2}{2n}}{1 + \frac{z^2}{n}} \;\pm\; \frac{z\sqrt{\frac{\hat p(1-\hat p)}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}$$

Unlike the textbook $\hat p \pm z\sqrt{\hat p(1-\hat p)/n}$, it never goes below 0
or above 1, and it keeps close to 95% coverage when $\hat p$ is near 0, which is
common for themes. Check: $81/263 \to [0.2553, 0.3662]$, as in Newcombe (1998).

**Newcombe hybrid score interval** (Newcombe 1998, method 10) for the change
$d = \hat p_2 - \hat p_1$ (after − before), from the two Wilson intervals
$[l_1, u_1]$ and $[l_2, u_2]$:

$$\Big[\, d - \sqrt{(\hat p_2 - l_2)^2 + (u_1 - \hat p_1)^2},\;\; d + \sqrt{(u_2 - \hat p_2)^2 + (\hat p_1 - l_1)^2} \,\Big]$$

Check: $56/70 - 48/80 = 0.2$, interval $[0.0524, 0.3339]$, as in Newcombe (1998).

**Star-mix-adjusted difference.** When reviews come from several star levels
$s$, the displayed effect is standardised to the overall star mix:

$$d_{\text{adj}} = \sum_s w_s\,(\hat p_{s,\text{after}} - \hat p_{s,\text{before}}), \qquad w_s = \frac{n_s}{\sum_t n_t}$$

$$\operatorname{Var}(d_{\text{adj}}) = \sum_s w_s^2 \left(\frac{\hat p_{s,a}(1-\hat p_{s,a})}{n_{s,a}} + \frac{\hat p_{s,b}(1-\hat p_{s,b})}{n_{s,b}}\right)$$

with a Wald 95% interval. Star levels with no reviews on one side say nothing
about change and are dropped. If only one level remains, the Newcombe interval
is used.

## Change-point test

**Candidates.** A change can only happen at a bucket boundary $\tau$ (the index
of the first review after it) with at least 30 reviews on each side.

**Statistic with one stratum: binomial likelihood ratio.** With $k_1$ of $n_1$
reviews before $\tau$ and $k_2$ of $n_2$ after mentioning the theme, and
$\ell(k,n) = k\log\frac{k}{n} + (n-k)\log\left(1-\frac{k}{n}\right)$ (with $0 \log 0 = 0$):

$$\mathrm{LR}(\tau) = \ell(k_1, n_1) + \ell(k_2, n_2) - \ell(k_1 + k_2,\, n_1 + n_2).$$

This compares "one share before, another after" with "one share throughout".

**Statistic with star strata: Cochran–Mantel–Haenszel.** For each star level
$s$ with $N_s$ reviews, $K_s$ of them mentioning the theme, and
$n_{s,b}, n_{s,a}$ reviews before and after $\tau$:

$$O_s = k_{s,a}, \quad E_s = \frac{n_{s,a} K_s}{N_s}, \quad V_s = \frac{n_{s,a}\, n_{s,b}\, K_s (N_s - K_s)}{N_s^2 (N_s - 1)}$$

$$\mathrm{CMH}(\tau) = \frac{\left(\sum_s (O_s - E_s)\right)^2}{\sum_s V_s}.$$

$E_s$ is how many after-$\tau$ reviews in star level $s$ would mention the
theme if nothing changed, and $V_s$ is the hypergeometric variance of $O_s$.
Each star level is compared only with itself, and the evidence is summed in
one direction. A star level with reviews on only one side contributes nothing.

**Scan.** $T = \max_\tau$ of the statistic. The maximising $\tau$ is reported as
the change point.

**p-value by permutation.** Because $T$ is a maximum over many $\tau$, its null
distribution is not a standard $\chi^2$. Under "no change", the order of the
$x_i$ in time is arbitrary *within each star level*. So we:

1. shuffle the $x_i$ among reviews of the same star level, keeping dates and stars fixed;
2. recompute $T_b$;
3. repeat $B = 999$ times, seeded.

$$p = \frac{1 + \#\{b : T_b \ge T\}}{B + 1}.$$

The smallest possible value is $1/1000$.

### Why stratify: the star-filter trap

Amazon shows at most 100 reviews per sort/filter, so going back in time needs
star filters. Suppose a theme is mentioned in 40% of 1★ reviews and 10% of 5★
reviews, constant over time, but the collected reviews are 80% 1★ in the first
six months and 80% 5★ afterwards. The pooled share falls from
$0.8(0.4) + 0.2(0.1) = 0.34$ to $0.2(0.4) + 0.8(0.1) = 0.16$, with nothing real behind it.

### Validation by simulation

All with $n = 300$ reviews over 12 months, $\alpha = 0.05$, 500 simulated
series per row (Monte Carlo error about ±0.02):

| Scenario | Unstratified (LR) | Stratified (CMH) | Requirement |
|---|---|---|---|
| No change, share 0.15 | 0.038 | 0.054 | ≤ 0.07 |
| Star-filter trap (no real change) | **0.890** | **0.064** | ≤ 0.07 |
| Planted shift 0.10 → 0.25 at month 7 (power) | 0.850 | 0.874 | ≥ 0.80 |

A first stratified version summed a separate LR for each star level. It
controlled the trap, but its power fell to 0.60: it tests for *any* change in
*any* of 5 star levels, five degrees of freedom instead of one. CMH asks a
single question, a common direction of change across star levels, and keeps
full power.

**Power by sample size** (stratified CMH, 300 series per cell, $B = 499$,
shift at month 7 of 12):

| Theme share before → after | n = 100 | 150 | 300 | 600 |
|---|---|---|---|---|
| 0.10 → 0.10 (no change) | 0.06 | 0.06 | 0.08 | 0.05 |
| 0.10 → 0.15 | 0.10 | 0.12 | 0.15 | 0.31 |
| 0.10 → 0.20 | 0.20 | 0.33 | 0.47 | 0.85 |
| 0.10 → 0.25 | 0.38 | 0.63 | 0.83 | 0.98 |
| 0.10 → 0.30 | 0.61 | 0.84 | 0.99 | 1.00 |

With the minimum of 100 reviews, only large shifts (about a tripling) are
detected reliably. With 300 or more, a 2.5× increase usually is. "No
significant change" with few reviews means "not enough evidence", not "no change".

The test finds the planted month exactly in 56% of runs. Other runs pick a
neighbouring boundary, which is expected when bucket shares are noisy.

**Limitations.**
- One change point per theme. Two changes (up, then back down) may be missed.
- Opposite changes in different star levels cancel in CMH.
- Shuffling assumes reviews are exchangeable within a star level when nothing
  changes. Bursts of related reviews, such as a promotion, break this.

## False discovery rate

Each product has several themes, each with its own p-value. Testing them all at
0.05 would flag some by chance. Benjamini–Hochberg controls the expected share
of false discoveries among flagged themes at $q^* = 0.10$.

With $m$ p-values sorted ascending, $p_{(1)} \le \dots \le p_{(m)}$:

$$q_{(i)} = \min_{j \ge i} \frac{m\, p_{(j)}}{j}, \quad \text{capped at } 1.$$

A theme is flagged as significant if $q \le 0.10$.

**Example.** $p = (0.01, 0.04, 0.03, 0.005)$, $m = 4$. Sorted, the values
$m\,p/\text{rank}$ are $0.02, 0.02, 0.04, 0.04$. Taking the running minimum from
the top gives $q = (0.02, 0.04, 0.04, 0.02)$ in input order, so all four are flagged.

## Rating credible interval

**Question.** Amazon shows an average rating such as 4.4★. How sure can we be
about it? For 22 ratings the true average could easily be 3.8 or 4.7. For 11,413
ratings it is pinned down to within a few hundredths. The badge shows that
uncertainty as a range: `likely 3.8–4.7`.

### Data

From the product page we read:

- $N$: the number of ratings, e.g. 11,413
- $p_1, \dots, p_5$: the percentage of ratings at each star level, e.g. 10, 4, 12, 20, 54

Amazon does not show the individual counts, so we reconstruct them:

$$c_k = \operatorname{round}\!\left(\frac{p_k}{100}\,N\right), \quad k = 1,\dots,5.$$

### Model

Let $\theta = (\theta_1, \dots, \theta_5)$ be the true share of buyers who would
give each star rating. The quantity we care about is the true average rating:

$$\mu = \sum_{k=1}^{5} k\,\theta_k.$$

The counts follow a multinomial distribution given $\theta$. We put a Dirichlet
prior on $\theta$:

$$\theta \sim \operatorname{Dirichlet}(\alpha_0, \alpha_0, \alpha_0, \alpha_0, \alpha_0), \qquad \alpha_0 = 0.5.$$

The Dirichlet is conjugate to the multinomial, so the posterior is again a
Dirichlet. Each star level's parameter is its count plus the prior's pseudo-count:

$$\theta \mid c \sim \operatorname{Dirichlet}(\alpha_0 + c_1, \dots, \alpha_0 + c_5).$$

**Point value (closed form).** Writing $A = 5\alpha_0 + \sum_k c_k$, the
posterior mean of each $\theta_k$ is $(\alpha_0 + c_k)/A$, so

$$\mathbb{E}[\mu \mid c] = \frac{\sum_k k\,(\alpha_0 + c_k)}{5\alpha_0 + \sum_k c_k}.$$

**Interval (Monte Carlo).** $\mu$ is a weighted sum of Dirichlet components and
has no simple closed-form quantiles, so we simulate:

1. Draw $\theta^{(s)} \sim \operatorname{Dirichlet}(\alpha_0 + c)$ for $s = 1, \dots, S$, with $S = 4000$.
   Each draw is made from independent $G_k \sim \operatorname{Gamma}(\alpha_0 + c_k, 1)$ variables
   normalised to sum to one (Marsaglia–Tsang gamma sampler).
2. Compute $\mu^{(s)} = \sum_k k\,\theta^{(s)}_k$.
3. The 90% equal-tailed credible interval is the 5th and 95th percentiles of the $\mu^{(s)}$
   (linear interpolation, the R/NumPy default).

The random generator is seeded (mulberry32, seed 42), so the same page always
gives the same badge.

### Worked example: mop, 22 ratings, 87% 5★ and 13% 1★

$c_5 = \operatorname{round}(0.87 \cdot 22) = \operatorname{round}(19.14) = 19$ and
$c_1 = \operatorname{round}(0.13 \cdot 22) = \operatorname{round}(2.86) = 3$, with the other counts 0.

Posterior: $\operatorname{Dirichlet}(3.5,\ 0.5,\ 0.5,\ 0.5,\ 19.5)$, total $A = 24.5$.

$$\mathbb{E}[\mu] = \frac{1(3.5) + 2(0.5) + 3(0.5) + 4(0.5) + 5(19.5)}{24.5} = \frac{105.5}{24.5} \approx 4.31.$$

The 90% interval from simulation is 3.78 to 4.71. The badge reads
`likely 3.8–4.7 · low data`.

### Results on the saved pages

| Product | Amazon shows | Ratings | Posterior mean | 90% interval | Badge |
|---|---|---|---|---|---|
| Wall hooks | 4.0 | 11,413 | 4.040 | 4.020 – 4.060 | likely 4.0–4.1 |
| Baby pyjamas | 4.3 | 281 | 4.295 | 4.185 – 4.396 | likely 4.2–4.4 |
| Plug adapter | 4.2 | 46 | 4.158 | 3.795 – 4.470 | likely 3.8–4.5 |
| Spin mop | 4.4 | 22 | 4.306 | 3.778 – 4.709 | likely 3.8–4.7 · low data |
| Strobe cream | — | 0 | — | — | (hidden) |

### Choosing the prior: why α₀ = 0.5 rather than 1

The first version of the spec used the uniform prior $\alpha_0 = 1$, which treats
every possible star mix as equally likely. It is worth one pseudo-rating at each
star level: five ratings averaging 3★. On Amazon, where most products are
heavily 5★, that pulls small products down toward 3★.

We checked this by simulation. Pick a true $\theta$, draw $n$ ratings from it
1,500 times, compute the 90% interval each time, and count how often the
interval contains the true $\mu$. A well-calibrated 90% interval should contain
it about 90% of the time.

| True star mix | Prior | n = 20 | n = 50 | n = 100 |
|---|---|---|---|---|
| Hooks (54% 5★) | uniform α₀ = 1 | 0.84 | 0.88 | 0.88 |
| | **Jeffreys α₀ = 0.5** | **0.89** | **0.90** | **0.89** |
| | Amazon-typical × 5 | 0.91 | 0.90 | 0.89 |
| Mop (87% 5★) | uniform α₀ = 1 | 0.74 | 0.86 | 0.86 |
| | **Jeffreys α₀ = 0.5** | **0.88** | **0.89** | **0.88** |
| | Amazon-typical × 5 | 0.90 | 0.92 | 0.90 |
| Pyjamas (61% 5★) | uniform α₀ = 1 | 0.75 | 0.85 | 0.85 |
| | **Jeffreys α₀ = 0.5** | **0.88** | **0.89** | **0.88** |
| | Amazon-typical × 5 | 0.94 | 0.91 | 0.89 |
| Poorly rated (35% 1★) | uniform α₀ = 1 | 0.92 | 0.90 | 0.89 |
| | **Jeffreys α₀ = 0.5** | **0.90** | **0.89** | **0.89** |
| | Amazon-typical × 5 | 0.81 | 0.87 | 0.88 |
| Flat (20% each) | uniform α₀ = 1 | 0.93 | 0.90 | 0.89 |
| | **Jeffreys α₀ = 0.5** | **0.91** | **0.89** | **0.88** |
| | Amazon-typical × 5 | 0.80 | 0.86 | 0.87 |

Monte Carlo error on each cell is about ±0.015 (95%).

- **Uniform** undercovers on 5★-heavy products: 0.74 for the mop at $n = 20$.
- **Amazon-typical** (prior shaped like a typical Amazon distribution, worth 5 ratings)
  does well on 5★-heavy products but undercovers on poorly rated ones. Those are
  exactly the products a shopper most needs an honest range for.
- **Jeffreys** stays between 0.88 and 0.91 for every shape and sample size tested,
  so it is the default.

The test suite checks this: for the hooks, mop and poorly rated shapes at
$n \in \{20, 100, 1000\}$, coverage over 500 simulated datasets must lie in
[0.85, 0.95].

### Data sufficiency

- **Insufficient** (badge hidden): no rating count, no star breakdown, or
  percentages that do not sum to 100 ± 3 (a sign the page was misread).
- **Low** (badge marked `low data`, dashed border): $N < 30$.
- **OK**: otherwise.

### Limitations

- **Rounded percentages.** Amazon shows whole-number percentages, so each
  reconstructed count can be off by up to $0.005N$. For large $N$ this rounding
  can shift the mean by a few hundredths. That is comparable to the width of the
  interval itself (±0.02 for the hooks), so for very popular products the range
  is slightly over-precise.
- **The interval describes these raters, not all buyers.** It captures sampling
  uncertainty only. It says nothing about who chooses to leave a rating,
  incentivised reviews or rating manipulation.
- **Variants share ratings.** Amazon pools ratings across colours and sizes, so
  the interval covers the whole listing, not the variant on screen.
