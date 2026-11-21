"""Find products whose reviewers explicitly say the product changed (formula, scent, size...).

Usage: .venv/Scripts/python find_formula_changes.py
Independent of the change-point method: a plain phrase search, used as "ground truth
candidates" to check whether the method flags these products at the right time.
"""
import gzip
import html
import json
import re
from collections import defaultdict
from datetime import datetime, timezone

DATA = "data/All_Beauty.jsonl.gz"
PHRASE = re.compile(
    r"(changed (the |their )?(formula|formulation|recipe|scent|smell|ingredients|packaging)"
    r"|new (formula|formulation|version|packaging)"
    r"|(formula|formulation|scent|smell|ingredients) (has |have )?(been )?changed"
    r"|not the same (as|product) (before|it used to|i used to)"
    r"|(smells?|feels?|looks?|works?) (different|differently) (now|than before|than it used to)"
    r"|used to (be|love|buy) .{0,40}(but|until|now)"
    r"|(old|original) formula)",
    re.I,
)

hits = defaultdict(list)  # asin -> [(date, rating, snippet)]
total = defaultdict(int)
seen = set()
with gzip.open(DATA, "rt", encoding="utf-8") as f:
    for line in f:
        r = json.loads(line)
        key = (r["parent_asin"], r.get("user_id"), r["timestamp"], r.get("text"))
        if key in seen:  # exact duplicates in the dump
            continue
        seen.add(key)
        a = r["parent_asin"]
        total[a] += 1
        text = html.unescape(re.sub(r"<br\s*/?>", " ", f"{r.get('title') or ''}. {r.get('text') or ''}", flags=re.I))
        m = PHRASE.search(text)
        if m:
            d = datetime.fromtimestamp(r["timestamp"] / 1000, tz=timezone.utc).date()
            s = max(0, m.start() - 80)
            hits[a].append((d, int(r["rating"]), text[s : m.end() + 120].replace("\n", " ")))

# Products with enough reviews and a meaningful number of "it changed" reviews.
rows = []
for a, h in hits.items():
    if total[a] >= 300 and len(h) >= 8:
        dates = sorted(d for d, _, _ in h)
        rows.append((len(h) / total[a], len(h), total[a], a, dates[0], dates[len(dates) // 2], dates[-1]))
rows.sort(reverse=True)

print(f"{len(rows)} products (>= 300 reviews) with >= 8 reviews saying the product changed\n")
print(f"{'share':>6} {'hits':>5} {'reviews':>7}  asin        first       median      last")
for share, n, tot, a, d0, dm, d1 in rows[:15]:
    print(f"{share:6.1%} {n:5d} {tot:7d}  {a}  {d0}  {dm}  {d1}")

for share, n, tot, a, *_ in rows[:4]:
    print("\n" + "=" * 100)
    print(f"{a}: {n} of {tot} reviews say it changed. Examples (date, stars):")
    for d, stars, snip in sorted(hits[a])[:: max(1, len(hits[a]) // 6)][:6]:
        print(f"  {d} {stars}★  …{snip[:230]}…")
