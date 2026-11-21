"""Look for review patterns that are *signals* of inflated or organised reviews.

Usage: .venv/Scripts/python find_suspicious_patterns.py
These are signals, not proof: launches, sales and viral moments also cause bursts.
Real Deal never labels reviews "fake" (CLAUDE.md); this is exploratory research.
"""
import gzip
import html
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone

import numpy as np
from scipy.stats import poisson

DATA = "data/All_Beauty.jsonl.gz"
WINDOW = 14  # days
INCENTIVE = re.compile(
    r"(in exchange for (my|an?) (honest|unbiased)|received (this|the) (product|item)? ?(for )?(free|at a discount)"
    r"|(free|discounted) (product|sample) (in exchange|for (my|an?) (honest|unbiased))|\bdiscount(ed)? in exchange)",
    re.I,
)


def clean(s):
    return html.unescape(re.sub(r"<br\s*/?>", " ", s or "", flags=re.I))


def norm(s):
    return re.sub(r"[^a-z ]", "", s.lower())[:80].strip()


by = defaultdict(list)
seen = set()
with gzip.open(DATA, "rt", encoding="utf-8") as f:
    for line in f:
        r = json.loads(line)
        key = (r["parent_asin"], r.get("user_id"), r["timestamp"], r.get("text"))
        if key in seen:
            continue
        seen.add(key)
        by[r["parent_asin"]].append(
            (r["timestamp"] / 1000, r["rating"], bool(r.get("verified_purchase")), clean(r.get("title")), clean(r.get("text")), r.get("user_id"))
        )

rows = []
for a, rv in by.items():
    n = len(rv)
    if n < 300:
        continue
    rv.sort()
    days = np.array([t for t, *_ in rv]) // 86400
    span = max(1, days[-1] - days[0] + 1)
    # Busiest 14-day window (two pointers).
    j, best, bi = 0, 0, (0, 0)
    for i in range(n):
        while days[i] - days[j] >= WINDOW:
            j += 1
        if i - j + 1 > best:
            best, bi = i - j + 1, (j, i + 1)
    expected = n * WINDOW / span
    # Poisson tail, roughly corrected for the number of windows searched (span / WINDOW).
    p_burst = min(1.0, poisson.sf(best - 1, expected) * span / WINDOW)
    b = rv[bi[0] : bi[1]]
    rest = rv[: bi[0]] + rv[bi[1] :]
    mean_b = np.mean([x[1] for x in b])
    mean_rest = np.mean([x[1] for x in rest]) if rest else np.nan
    unver_b = 1 - np.mean([x[2] for x in b])
    unver_rest = 1 - np.mean([x[2] for x in rest]) if rest else np.nan
    # Same opening text from different reviewers.
    texts = Counter(norm(x[4]) for x in rv if len(norm(x[4])) >= 30)
    dup = sum(c for t, c in texts.items() if c > 1)
    incent = sum(bool(INCENTIVE.search(x[3] + " " + x[4])) for x in rv)
    rows.append(
        dict(asin=a, n=n, burst=best, expected=expected, p_burst=p_burst,
             burst_start=datetime.fromtimestamp(b[0][0], tz=timezone.utc).date(),
             mean_burst=mean_b, mean_rest=mean_rest, unver_burst=unver_b, unver_rest=unver_rest,
             dup_share=dup / n, incentive_share=incent / n, burst_reviews=b)
    )

print(f"{len(rows)} products with >= 300 reviews\n")
sig = [r for r in rows if r["p_burst"] < 1e-6]
print(f"Products with an extreme 14-day burst (corrected p < 1e-6): {len(sig)}")
glowing = [r for r in sig if r["mean_burst"] - r["mean_rest"] >= 0.5]
print(f"  ... of which the burst averages >= 0.5 stars higher than the rest: {len(glowing)}")
unver = [r for r in glowing if r["unver_burst"] - r["unver_rest"] >= 0.2]
print(f"  ... and has >= 20 points more unverified reviews in the burst: {len(unver)}")
print(f"Products with >= 5% copy-paste openings across reviewers: {sum(r['dup_share'] >= 0.05 for r in rows)}")
print(f"Products where >= 5% of reviews disclose an incentive: {sum(r['incentive_share'] >= 0.05 for r in rows)}\n")

def score(r):
    return int(r["p_burst"] < 1e-6) + int(r["mean_burst"] - r["mean_rest"] >= 0.5) \
        + int(r["unver_burst"] - r["unver_rest"] >= 0.2) + int(r["dup_share"] >= 0.05) + int(r["incentive_share"] >= 0.05)
top = sorted(rows, key=lambda r: (-score(r), r["p_burst"]))[:6]
print(f"{'asin':11} {'n':>5} {'burst':>5} {'expect':>6} {'start':>10} {'★burst':>6} {'★rest':>5} {'unver b/r':>9} {'dup':>5} {'incent':>6} signals")
for r in top:
    print(f"{r['asin']:11} {r['n']:5d} {r['burst']:5d} {r['expected']:6.1f} {str(r['burst_start']):>10} {r['mean_burst']:6.2f} {r['mean_rest']:5.2f}"
          f" {r['unver_burst']:4.0%}/{r['unver_rest']:3.0%} {r['dup_share']:5.1%} {r['incentive_share']:6.1%} {score(r)}")

for r in top[:3]:
    print("\n" + "=" * 100)
    print(f"{r['asin']}: {r['burst']} reviews in 14 days from {r['burst_start']} (normal pace: {r['expected']:.1f}); "
          f"burst ★{r['mean_burst']:.2f} vs ★{r['mean_rest']:.2f} otherwise; unverified {r['unver_burst']:.0%} vs {r['unver_rest']:.0%}")
    for t, stars, ver, title, text, _ in r["burst_reviews"][:: max(1, len(r["burst_reviews"]) // 6)][:6]:
        d = datetime.fromtimestamp(t, tz=timezone.utc).date()
        print(f"  {d} {int(stars)}★ {'verified' if ver else 'UNVERIFIED'}  {(title + ' — ' + text)[:170]}")
