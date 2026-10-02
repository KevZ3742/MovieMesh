"""
Does ratings.csv contain a real "when" signal?  (v2)

New in v2:
  0. Threshold sensitivity: how do the results change if "bulk day" means >5, >15, >30, >100 ratings/day?
  3. Recurrence check: a movie only counts as seasonal if its peak month repeats across
     several different YEARS (filters out one-time bursts like a few users rating one movie in May 2015).
  Exports seasonal_movies.csv (the movies that pass) to the current folder.

Cleaning used for all tables (at the MAIN threshold):
  - drops "bulk days" (user rating > MAIN movies in one day = backfilling, not watching)
  - keeps only ratings made >= MIN_AGE_YEARS after release, so new releases don't look "seasonal"

Usage:  python explore_ratings.py [path/to/ml-32m]
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

THRESHOLDS = [5, 15, 30, 100]   # bulk-day thresholds to compare
MAIN = 15                       # threshold used for sections 1-3 (must be in THRESHOLDS)
MIN_AGE_YEARS = 2
MIN_RATINGS_PER_MOVIE = 300     # section 3: movies with fewer clean ratings are skipped
MIN_GROUP_RATINGS = 2000        # sections 1-2: skip groups with fewer ratings
MIN_LIFT = 2.0                  # "recurring" needs peak-month lift >= this ...
MIN_PEAK_YEARS = 4              # ... in at least this many different years (>= 3 ratings each) ...
MIN_RATINGS_PER_PEAK_YEAR = 3
MAX_TOP_YEAR_SHARE = 0.35       # ... and no single year may hold more than this share of peak-month ratings

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
if not (root / "movies.csv").exists() and (root / "ml-32m" / "movies.csv").exists():
    root = root / "ml-32m"
if not (root / "movies.csv").exists():
    sys.exit(f"Can't find movies.csv in {root.resolve()} (or its ml-32m subfolder). "
             "Pass the folder containing the CSVs: python explore_ratings.py path/to/ml-32m")

movies = pd.read_csv(root / "movies.csv")
movies["year"] = movies.title.str.extract(r"\((\d{4})\)\s*$")[0].astype(float)
N = int(movies.movieId.max()) + 1
year_of = np.full(N, np.nan)
year_of[movies.movieId.values] = movies.year.values
title_of = movies.set_index("movieId").title

tags = pd.read_csv(root / "tags.csv", usecols=["userId", "movieId", "tag"])
tags = tags[tags.userId != 78213]  # one user wrote ~36% of all tags

KEYWORDS = {
    "christmas": r"\bchristmas\b|\bxmas\b",
    "halloween": r"\bhalloween\b",
    "valentine": r"\bvalentine",
    "thanksgiving": r"\bthanksgiving\b",
    "new year": r"\bnew year",
    "summer": r"\bsummer\b",
    "winter": r"\bwinter\b",
    "beach": r"\bbeach\b",
    "snow": r"\bsnow\b",
    "spring": r"\bspring\b",
}


def ids_for(pattern):
    by_title = movies.loc[movies.title.str.contains(pattern, case=False, regex=True), "movieId"]
    t = tags.loc[tags.tag.str.contains(pattern, case=False, regex=True, na=False), "movieId"]
    c = t.value_counts()
    return set(by_title) | set(c[c >= 3].index)  # tag must come from >= 3 taggers


kw_ids = {name: ids_for(p) for name, p in KEYWORDS.items()}
genre_ids = {g: set(grp.movieId) for g, grp in
             movies.assign(genre=movies.genres.str.split("|")).explode("genre").groupby("genre")
             if g != "(no genres listed)"}

# ---- one pass over ratings ----
mms = {t: np.zeros(N * 12, dtype=np.int64) for t in THRESHOLDS}   # movie x month counts per threshold
kept = {t: 0 for t in THRESHOLDS}
rows = []                                                          # (movieId, year, month0) at MAIN threshold
hour, dow = np.zeros(24), np.zeros(7)
total = 0

for chunk in pd.read_csv(root / "ratings.csv", chunksize=2_000_000):
    dt = pd.to_datetime(chunk.timestamp, unit="s")
    total += len(chunk)
    size = chunk.groupby(["userId", dt.dt.floor("D")])["movieId"].transform("size").values
    mid = chunk.movieId.values
    yr = dt.dt.year.values
    month = dt.dt.month.values - 1
    ok_age = (yr - year_of[mid]) >= MIN_AGE_YEARS  # unknown release year -> NaN -> False -> dropped
    for t in THRESHOLDS:
        keep = (size <= t) & ok_age
        kept[t] += int(keep.sum())
        mms[t] += np.bincount(mid[keep] * 12 + month[keep], minlength=N * 12)
        if t == MAIN:
            rows.append(np.stack([mid[keep], yr[keep], month[keep]], 1).astype(np.int32))
            hour += np.bincount(dt.dt.hour.values[keep], minlength=24)
            dow += np.bincount(dt.dt.dayofweek.values[keep], minlength=7)

mats = {t: m.reshape(N, 12) for t, m in mms.items()}
M = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def group_lift(mat, ids):
    ids = np.array(sorted(i for i in ids if i < N))
    c = mat[ids].sum(0)
    if c.sum() == 0:
        return np.full(12, np.nan), 0
    return c / c.sum() / (mat.sum(0) / mat.sum()), int(c.sum())


print(f"{total:,} ratings read.\n")
print("== 0. Sensitivity to the bulk-day threshold")
print("   (does a stricter/looser definition of 'bulk day' change the conclusions?)")
print(f"{'bulk if >':>10} {'kept':>12} {'%':>5} {'movies>=300':>12} {'xmas Dec':>9} {'hallo Oct':>10} {'horror Oct':>11}")
for t in THRESHOLDS:
    mat = mats[t]
    n_m = mat.sum(1)
    xm = group_lift(mat, kw_ids["christmas"])[0][11]
    hw = group_lift(mat, kw_ids["halloween"])[0][9]
    hr = group_lift(mat, genre_ids["Horror"])[0][9]
    star = "  <- used below" if t == MAIN else ""
    print(f"{t:>10} {kept[t]:>12,} {kept[t]/total:>5.0%} {(n_m >= MIN_RATINGS_PER_MOVIE).sum():>12,} "
          f"{xm:>9.2f} {hw:>10.2f} {hr:>11.2f}{star}")

mm = mats[MAIN]
base = mm.sum(0) / mm.sum()
header = " " * 16 + " ".join(f"{m:>5}" for m in M) + "   n"


def lift_row(label, ids):
    lift, n = group_lift(mm, ids)
    if n < MIN_GROUP_RATINGS:
        return None
    return f"{label:>15} " + " ".join(f"{x:5.2f}" for x in lift) + f" {n:>8,}  peak {M[int(np.nanargmax(lift))]}"


print(f"\n== 1. Keyword seasons at bulk threshold {MAIN} (lift 1.0 = no seasonality)")
print(header)
for name, ids in kw_ids.items():
    print(lift_row(f"{name} ({len(ids)})", ids) or f"{name:>15} ({len(ids)} movies) too few ratings")

print("\n== 2. By genre")
print(header)
for genre, ids in genre_ids.items():
    row = lift_row(genre, ids)
    if row:
        print(row)

# ---- section 3: individual movies, with recurrence check ----
print(f"\n== 3. Individual movies: seasonal AND recurring (>= {MIN_RATINGS_PER_MOVIE} clean ratings)")
n_m = mm.sum(1)
cand = np.where(n_m >= MIN_RATINGS_PER_MOVIE)[0]
if len(cand) == 0:
    sys.exit("No movie has enough clean ratings for section 3 (is this a sample of ratings.csv?)")
exp = np.outer(n_m[cand], base)
effect = ((mm[cand] - exp) ** 2 / exp).sum(1) / n_m[cand]      # how uneven across months
lift_m = mm[cand] / n_m[cand][:, None] / base
peak, peak_lift = lift_m.argmax(1), lift_m.max(1)

df = pd.DataFrame(np.concatenate(rows), columns=["movieId", "year", "month"])
df = df[df.movieId.isin(cand)]
df["peak"] = df.movieId.map(pd.Series(peak, index=cand))
per_year = (df[df.month == df.peak].groupby(["movieId", "year"]).size().rename("c").reset_index())
agg = per_year.groupby("movieId").c.agg(
    peak_years=lambda x: int((x >= MIN_RATINGS_PER_PEAK_YEAR).sum()),
    top_year_share=lambda x: x.max() / x.sum())

res = pd.DataFrame({"movieId": cand, "title": [title_of.get(i, str(i)) for i in cand], "n": n_m[cand],
                    "effect": effect, "peak_month": [M[p] for p in peak], "lift": peak_lift}).set_index("movieId")
res = res.join(agg).fillna({"peak_years": 0, "top_year_share": 1.0})
seasonal_enough = res.lift >= MIN_LIFT
recurring = seasonal_enough & (res.peak_years >= MIN_PEAK_YEARS) & (res.top_year_share <= MAX_TOP_YEAR_SHARE)
res["verdict"] = np.where(recurring, "RECURRING", np.where(seasonal_enough, "burst?", "weak"))

print(f"Of {len(res):,} candidate movies: {int(recurring.sum())} RECURRING, "
      f"{int((seasonal_enough & ~recurring).sum())} 'burst?' (high lift but not repeating across years), "
      f"{int((~seasonal_enough).sum())} weak/none.")
print(f"(median effect = {res.effect.median():.3f}: the noise floor)")
print("\nRecurrence needs: lift >= %.1f, >= %d years with >= %d peak-month ratings, no year > %d%% of peak-month ratings."
      % (MIN_LIFT, MIN_PEAK_YEARS, MIN_RATINGS_PER_PEAK_YEAR, MAX_TOP_YEAR_SHARE * 100))


def show(frame, k=30):
    print(f"{'effect':>7} {'n':>6} {'peak':>5} {'lift':>5} {'yrs':>4} {'topyr%':>7}  {'verdict':<9} title")
    for _, r in frame.head(k).iterrows():
        print(f"{r.effect:7.2f} {r.n:6,.0f} {r.peak_month:>5} {r.lift:5.2f} {r.peak_years:4.0f} "
              f"{r.top_year_share:7.0%}  {r.verdict:<9} {r.title}")


top = res.sort_values("effect", ascending=False)
print("\n-- Top 30 by effect size, with verdicts (this is where Body Snatchers etc. should show as 'burst?')")
show(top)
print("\n-- Top 30 RECURRING movies (these are the trustworthy seasonal ones)")
show(top[top.verdict == "RECURRING"])
print("\n-- Recurring movies by peak month")
print(top[top.verdict == "RECURRING"].peak_month.value_counts().reindex(M).fillna(0).astype(int).to_dict())

out = Path.cwd() / "seasonal_movies.csv"
top[top.verdict == "RECURRING"].reset_index()[
    ["movieId", "title", "peak_month", "lift", "n", "peak_years", "top_year_share"]].to_csv(out, index=False)
print(f"\nWrote {out}")

print("\nHour-of-day share (UTC):", np.round(hour / hour.sum(), 3).tolist())
print("Day-of-week share (Mon..Sun, UTC):", np.round(dow / dow.sum(), 3).tolist())
