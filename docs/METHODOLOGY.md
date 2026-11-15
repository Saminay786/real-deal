# Methodology

Every statistical method used by Real Deal is documented here with its formula.
Methods are added as they are built.

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
