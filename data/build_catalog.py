"""
Build catalog.db (SQLite) from MovieLens ml-32m files.

Tables
  movies(movie_id, title, alt_title, year, genres_raw, imdb_id, tmdb_id, n_ratings, avg_rating)
  movie_genres(movie_id, genre)
  movie_tags(movie_id, tag, n_taggers)      -- cleaned: spam user removed, >= MIN_TAGGERS distinct users, top TAGS_PER_MOVIE
  seasonal_movies(movie_id, peak_month, lift, n, peak_years)   -- only if seasonal_movies.csv exists
  movies_fts                                -- full-text search over title + alt_title (if SQLite has FTS5)

Usage:  python build_catalog.py [path/to/ml-32m] [--no-ratings]
  Ratings are read from ratings.csv by default, to fill n_ratings / avg_rating (this is what the app's Rating
  score and popularity ranking use). It adds a few minutes because ratings.csv has ~32M rows.
  --no-ratings   skip ratings.csv for a faster build. Rating data will be empty in the app.
Output: data/catalog.db if a data/ folder exists in the current folder, otherwise ./catalog.db.
"""
import re
import sqlite3
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SPAM_USER = 78213     # wrote ~36% of all tags
MIN_TAGGERS = 3       # a tag must come from >= this many distinct users for that movie
TAGS_PER_MOVIE = 20   # keep the most-agreed-upon tags per movie

args = [a for a in sys.argv[1:] if not a.startswith("--")]
use_ratings = "--no-ratings" not in sys.argv
def find_data_root(arg):
    """Find the folder holding movies.csv. Tries: the path given, ./ml-32m, ./data/ml-32m, ./data."""
    base = Path(arg) if arg else Path(".")
    tried = [base, base / "ml-32m", base / "data" / "ml-32m", base / "data"]
    for c in tried:
        if (c / "movies.csv").exists():
            return c
    sys.exit("Can't find movies.csv. Looked in:\n  " + "\n  ".join(str(t.resolve()) for t in tried)
             + "\nPass the folder containing the CSVs, e.g.  python build_catalog.py data/ml-32m")

root = find_data_root(args[0] if args else None)
print(f"Using data in {root.resolve()}")
for f in ("movies.csv", "links.csv", "tags.csv") + (("ratings.csv",) if use_ratings else ()):
    if not (root / f).exists():
        hint = "  (Ratings are on by default. Pass --no-ratings to build without them.)" if f == "ratings.csv" else ""
        sys.exit(f"Can't find {f} in {root.resolve()}.{hint}")

# ---------- movies ----------
ARTICLE = re.compile(r"^(.*), (The|A|An|Les|La|Le|Los|Las|El|Il|Der|Die|Das|L')$")


def split_title(raw):
    """'City of Lost Children, The (Cité des enfants perdus, La) (1995)' -> ('The City of Lost Children', 'Cité des enfants perdus, La', 1995)"""
    year = None
    m = re.search(r"\((\d{4})\)\s*$", raw)
    if m:
        year, raw = int(m.group(1)), raw[:m.start()].strip()
    main, _, alt = raw.partition(" (")
    a = ARTICLE.match(main)
    if a:
        main = f"{a.group(2)}{'' if a.group(2).endswith(chr(39)) else ' '}{a.group(1)}"
    return main.strip(), alt.rstrip(")").strip() or None, year


movies = pd.read_csv(root / "movies.csv")
parts = movies.title.map(split_title)
movies["title_clean"] = [p[0] for p in parts]
movies["alt_title"] = [p[1] for p in parts]
movies["year"] = [p[2] for p in parts]

links = pd.read_csv(root / "links.csv", dtype={"imdbId": str, "tmdbId": str})  # keep leading zeros on imdbId
movies = movies.merge(links, on="movieId", how="left")
movies["imdb_id"] = np.where(movies.imdbId.notna(), "tt" + movies.imdbId.fillna(""), None)
movies["tmdb_id"] = pd.to_numeric(movies.tmdbId, errors="coerce")

movies["n_ratings"] = None
movies["avg_rating"] = None
if use_ratings:
    n_max = int(movies.movieId.max()) + 1
    cnt, tot = np.zeros(n_max), np.zeros(n_max)
    for chunk in pd.read_csv(root / "ratings.csv", usecols=["movieId", "rating"], chunksize=4_000_000):
        mid = chunk.movieId.values
        cnt += np.bincount(mid, minlength=n_max)
        tot += np.bincount(mid, weights=chunk.rating.values, minlength=n_max)
    c = cnt[movies.movieId.values]
    movies["n_ratings"] = c.astype(int)
    movies["avg_rating"] = np.where(c > 0, tot[movies.movieId.values] / np.maximum(c, 1), np.nan).round(3)

genres = (movies[["movieId", "genres"]].assign(genre=movies.genres.str.split("|")).explode("genre")
          .query("genre != '(no genres listed)'")[["movieId", "genre"]]
          .rename(columns={"movieId": "movie_id"}))

# ---------- tags ----------
tags = pd.read_csv(root / "tags.csv", usecols=["userId", "movieId", "tag"])
n_raw = len(tags)
tags = tags[tags.userId != SPAM_USER].dropna(subset=["tag"])
tags["tag"] = tags.tag.str.lower().str.replace(r"\s+", " ", regex=True).str.strip()
tags = tags[tags.tag != ""]
agg = (tags.groupby(["movieId", "tag"]).userId.nunique().rename("n_taggers").reset_index()
       .query("n_taggers >= @MIN_TAGGERS")
       .sort_values(["movieId", "n_taggers"], ascending=[True, False])
       .groupby("movieId").head(TAGS_PER_MOVIE)
       .rename(columns={"movieId": "movie_id"}))

# ---------- write sqlite ----------
# Write into ./data/ when it exists (that's where the Next.js app looks), otherwise the current folder.
db_path = (Path.cwd() / "data" if (Path.cwd() / "data").is_dir() else Path.cwd()) / "catalog.db"
if db_path.exists():
    db_path.unlink()
con = sqlite3.connect(db_path)
con.executescript("""
CREATE TABLE movies(
  movie_id INTEGER PRIMARY KEY, title TEXT NOT NULL, alt_title TEXT, year INTEGER,
  genres_raw TEXT, imdb_id TEXT, tmdb_id INTEGER, n_ratings INTEGER, avg_rating REAL);
CREATE TABLE movie_genres(movie_id INTEGER NOT NULL, genre TEXT NOT NULL);
CREATE TABLE movie_tags(movie_id INTEGER NOT NULL, tag TEXT NOT NULL, n_taggers INTEGER NOT NULL);
""")


def obj(df):  # NaN/NA -> None so sqlite stores NULL
    return df.astype(object).where(df.notna(), None)


m_out = obj(movies[["movieId", "title_clean", "alt_title", "year", "genres", "imdb_id", "tmdb_id",
                    "n_ratings", "avg_rating"]])
m_out["year"] = m_out.year.map(lambda v: None if v is None else int(v))
m_out["tmdb_id"] = m_out.tmdb_id.map(lambda v: None if v is None else int(v))
con.executemany("INSERT INTO movies VALUES (?,?,?,?,?,?,?,?,?)", m_out.itertuples(index=False, name=None))
genres.to_sql("movie_genres", con, if_exists="append", index=False)
agg.to_sql("movie_tags", con, if_exists="append", index=False)
con.executescript("""
CREATE INDEX idx_genres_movie ON movie_genres(movie_id);
CREATE INDEX idx_genres_genre ON movie_genres(genre);
CREATE INDEX idx_tags_movie ON movie_tags(movie_id);
CREATE INDEX idx_tags_tag ON movie_tags(tag);
CREATE INDEX idx_movies_tmdb ON movies(tmdb_id);
CREATE INDEX idx_movies_year ON movies(year);
""")

# explore_ratings.py writes seasonal_movies.csv next to where catalog.db goes; also accept the current folder.
seasonal_csv = next((c for c in (db_path.parent / "seasonal_movies.csv", Path.cwd() / "seasonal_movies.csv") if c.exists()),
                    db_path.parent / "seasonal_movies.csv")
if seasonal_csv.exists():
    s = pd.read_csv(seasonal_csv).rename(columns={"movieId": "movie_id"})
    con.execute("CREATE TABLE seasonal_movies(movie_id INTEGER PRIMARY KEY, peak_month TEXT, lift REAL, n INTEGER, peak_years INTEGER)")
    s[["movie_id", "peak_month", "lift", "n", "peak_years"]].to_sql("seasonal_movies", con, if_exists="append", index=False)

fts = True
try:
    con.execute("CREATE VIRTUAL TABLE movies_fts USING fts5(title, alt_title, content='movies', content_rowid='movie_id')")
    con.execute("INSERT INTO movies_fts(rowid, title, alt_title) SELECT movie_id, title, COALESCE(alt_title,'') FROM movies")
except sqlite3.OperationalError:
    fts = False
con.commit()

# ---------- report ----------
q = lambda sql: con.execute(sql).fetchall()
print(f"Wrote {db_path} ({db_path.stat().st_size/1e6:.1f} MB)")
print(f"movies: {q('SELECT COUNT(*) FROM movies')[0][0]:,}")
print(f"  no year: {q('SELECT COUNT(*) FROM movies WHERE year IS NULL')[0][0]:,} | "
      f"no tmdb id: {q('SELECT COUNT(*) FROM movies WHERE tmdb_id IS NULL')[0][0]:,} | "
      f"no genres: {q('SELECT COUNT(*) FROM movies WHERE movie_id NOT IN (SELECT movie_id FROM movie_genres)')[0][0]:,}")
print(f"tags: {n_raw:,} raw rows -> {len(agg):,} kept (spam user removed, >= {MIN_TAGGERS} taggers, top {TAGS_PER_MOVIE}/movie)")
print(f"  movies with >=1 tag: {agg.movie_id.nunique():,} | distinct tags kept: {agg.tag.nunique():,}")
print(f"  no genres but has tags (tags can fill the gap): "
      f"{q('SELECT COUNT(*) FROM movies WHERE movie_id NOT IN (SELECT movie_id FROM movie_genres) AND movie_id IN (SELECT movie_id FROM movie_tags)')[0][0]:,}")
print("  most common tags:", ", ".join(f"{t} ({n})" for t, n in q("SELECT tag, COUNT(*) c FROM movie_tags GROUP BY tag ORDER BY c DESC LIMIT 25")))
n_rated = q("SELECT COUNT(*) FROM movies WHERE avg_rating IS NOT NULL")[0][0]
if use_ratings:
    print(f"ratings: {n_rated:,} movies have n_ratings / avg_rating")
else:
    print("ratings: NONE. Built with --no-ratings, so the app's Rating score and popularity ranking will be empty.")
    print("         Re-run without that flag (needs ratings.csv in the same folder as movies.csv).")
print("full-text search:", "yes" if fts else "no (this SQLite build lacks FTS5)")
if seasonal_csv.exists():
    print(f"seasonal_movies: {q('SELECT COUNT(*) FROM seasonal_movies')[0][0]:,}")
print("sample:", q("SELECT movie_id, title, alt_title, year, tmdb_id FROM movies WHERE movie_id IN (1, 2, 11, 3114, 112556)"))
