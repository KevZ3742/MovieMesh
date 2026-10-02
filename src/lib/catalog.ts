import { getDb, hasTable } from "./db";
import { MONTH_SHORT } from "./seasons";
import type { Movie, MovieSummary, SearchHit } from "./types";

const ph = (n: number) => Array(n).fill("?").join(",");
const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
// "A Christmas Story" and "Christmas Story" should count as the same title when ranking.
const norm = (s: string) => words(s).filter((w, i) => !(i === 0 && ["a", "an", "the"].includes(w))).join(" ");

function genresFor(ids: number[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (!ids.length) return out;
  const rows = getDb()
    .prepare(`SELECT movie_id id, genre FROM movie_genres WHERE movie_id IN (${ph(ids.length)}) ORDER BY genre`)
    .all(...ids) as { id: number; genre: string }[];
  for (const r of rows) (out.get(r.id) ?? out.set(r.id, []).get(r.id)!).push(r.genre);
  return out;
}

export function getMovie(id: number): Movie | null {
  const db = getDb();
  const r = db
    .prepare(
      `SELECT movie_id id, title, alt_title altTitle, year, imdb_id imdbId, tmdb_id tmdbId,
              n_ratings nRatings, avg_rating avgRating FROM movies WHERE movie_id = ?`,
    )
    .get(id) as Omit<Movie, "genres" | "tags" | "seasonal"> | undefined;
  if (!r) return null;
  const tags = db
    .prepare("SELECT tag, n_taggers n FROM movie_tags WHERE movie_id = ? ORDER BY n_taggers DESC, tag LIMIT 20")
    .all(id) as Movie["tags"];

  let seasonal: Movie["seasonal"] = null;
  if (hasTable("seasonal_movies")) {
    const s = db
      .prepare("SELECT peak_month pm, lift, peak_years py FROM seasonal_movies WHERE movie_id = ?")
      .get(id) as { pm: string; lift: number; py: number } | undefined;
    const idx = s ? MONTH_SHORT.indexOf(s.pm) : -1;
    if (s && idx >= 0) seasonal = { peakMonth: idx, lift: s.lift, peakYears: s.py };
  }
  return { ...r, genres: genresFor([id]).get(id) ?? [], tags, seasonal };
}

/** Full-text title search, re-ranked so exact titles and well-known movies come first. */
export function searchMovies(q: string, limit = 8): SearchHit[] {
  const db = getDb();
  const tokens = words(q);
  if (!tokens.length) return [];
  const qNorm = norm(q);

  type Row = { id: number; title: string; year: number | null; nRatings: number | null; hasTags: number };
  const base = `SELECT m.movie_id id, m.title, m.year, m.n_ratings nRatings,
                       EXISTS(SELECT 1 FROM movie_tags t WHERE t.movie_id = m.movie_id) hasTags`;
  const like = () =>
    db.prepare(`${base} FROM movies m WHERE m.title LIKE ? LIMIT 200`).all(`%${tokens.join("%")}%`) as Row[];
  let rows: Row[];
  if (hasTable("movies_fts")) {
    // Tokens are quoted so user input can never be read as FTS operators; last token is a prefix match.
    const match = tokens.map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`)).join(" ");
    try {
      rows = db
        .prepare(`${base} FROM movies_fts f JOIN movies m ON m.movie_id = f.rowid
                  WHERE movies_fts MATCH ? ORDER BY bm25(movies_fts) LIMIT 60`)
        .all(match) as Row[];
    } catch {
      rows = like(); // this SQLite build has no FTS5: fall back to a plain title search
    }
  } else {
    rows = like();
  }

  const score = (r: Row) => {
    const t = norm(r.title);
    let s = t === qNorm ? 1000 : t.startsWith(qNorm) ? 200 : 0;
    s += r.nRatings != null ? Math.min(60, Math.log10(1 + r.nRatings) * 12) : r.hasTags ? 40 : 0;
    return s - t.length * 0.2;
  };
  const top = rows.sort((a, b) => score(b) - score(a)).slice(0, limit);
  const g = genresFor(top.map((r) => r.id));
  return top.map((r) => ({ id: r.id, title: r.title, year: r.year, genres: g.get(r.id) ?? [] }));
}

export function getMoviesByTmdbIds(tmdbIds: number[]): MovieSummary[] {
  if (!tmdbIds.length) return [];
  const rows = getDb()
    .prepare(`SELECT movie_id id, title, year, tmdb_id tmdbId FROM movies WHERE tmdb_id IN (${ph(tmdbIds.length)})`)
    .all(...tmdbIds) as Omit<MovieSummary, "genres">[];
  const g = genresFor(rows.map((r) => r.id));
  const order = new Map(tmdbIds.map((id, i) => [id, i]));
  return rows
    .map((r) => ({ ...r, genres: g.get(r.id) ?? [] }))
    .sort((a, b) => order.get(a.tmdbId!)! - order.get(b.tmdbId!)!);
}

export type SimilarHit = { movie: MovieSummary; via: string; score: number };

let hasPopularity: boolean | null = null;

/**
 * Content-based neighbours from shared tags and genres.
 * PLACEHOLDER for the real recommender: when catalog.db has n_ratings (build_catalog.py --ratings)
 * popularity is used as a signal; without it, "has agreed-upon tags" stands in for "well known".
 */
export function getSimilar(id: number, limit = 6): SimilarHit[] {
  const db = getDb();
  const t = getMovie(id);
  if (!t) return [];
  if (hasPopularity === null) {
    hasPopularity = !!db.prepare("SELECT 1 FROM movies WHERE n_ratings IS NOT NULL LIMIT 1").get();
  }

  const tagNames = t.tags.map((x) => x.tag);
  const cand = new Set<number>();
  if (tagNames.length) {
    const rows = db
      .prepare(`SELECT movie_id id FROM movie_tags WHERE tag IN (${ph(tagNames.length)}) AND movie_id != ?
                GROUP BY movie_id ORDER BY COUNT(*) DESC LIMIT 300`)
      .all(...tagNames, id) as { id: number }[];
    rows.forEach((r) => cand.add(r.id));
  }
  if (t.genres.length) {
    const rows = db
      .prepare(`SELECT g.movie_id id FROM movie_genres g JOIN movies m ON m.movie_id = g.movie_id
                WHERE g.genre IN (${ph(t.genres.length)}) AND g.movie_id != ?
                ${hasPopularity ? "" : "AND EXISTS (SELECT 1 FROM movie_tags x WHERE x.movie_id = g.movie_id)"}
                GROUP BY g.movie_id HAVING COUNT(*) >= ?
                ORDER BY COALESCE(m.n_ratings, 0) DESC, ABS(COALESCE(m.year, 0) - ?) ASC LIMIT 300`)
      .all(...t.genres, id, Math.min(2, t.genres.length), t.year ?? 0) as { id: number }[];
    rows.forEach((r) => cand.add(r.id));
  }
  const ids = [...cand];
  if (!ids.length) return [];

  const info = new Map(
    (db
      .prepare(`SELECT movie_id id, title, year, tmdb_id tmdbId, n_ratings nRatings FROM movies WHERE movie_id IN (${ph(ids.length)})`)
      .all(...ids) as { id: number; title: string; year: number | null; tmdbId: number | null; nRatings: number | null }[]
    ).map((r) => [r.id, r]),
  );
  const genres = genresFor(ids);
  const tagCount = new Map(
    (db
      .prepare(`SELECT movie_id id, COUNT(*) c FROM movie_tags WHERE movie_id IN (${ph(ids.length)}) GROUP BY movie_id`)
      .all(...ids) as { id: number; c: number }[]
    ).map((r) => [r.id, r.c]),
  );
  const shared = new Map<number, string[]>();
  if (tagNames.length) {
    const rows = db
      .prepare(`SELECT movie_id id, tag FROM movie_tags WHERE movie_id IN (${ph(ids.length)}) AND tag IN (${ph(tagNames.length)})`)
      .all(...ids, ...tagNames) as { id: number; tag: string }[];
    for (const r of rows) (shared.get(r.id) ?? shared.set(r.id, []).get(r.id)!).push(r.tag);
  }

  const G = new Set(t.genres);
  const hits: SimilarHit[] = [];
  for (const cid of ids) {
    const m = info.get(cid);
    if (!m) continue;
    const gc = genres.get(cid) ?? [];
    const sharedGenres = gc.filter((g) => G.has(g));
    const sharedTags = (shared.get(cid) ?? []).sort((a, b) => tagNames.indexOf(a) - tagNames.indexOf(b));
    // Must have something concrete in common, not just one broad genre.
    if (!sharedTags.length && sharedGenres.length < Math.min(2, t.genres.length)) continue;

    const genreJ = sharedGenres.length / (G.size + gc.length - sharedGenres.length || 1);
    const tc = tagCount.get(cid) ?? 0;
    const tagCos = tagNames.length && tc ? sharedTags.length / Math.sqrt(tagNames.length * tc) : 0;
    const yearProx = t.year && m.year ? Math.exp(-Math.abs(t.year - m.year) / 15) : 0.3;
    const pop = m.nRatings != null ? Math.min(1, Math.log10(1 + m.nRatings) / 5) : tc > 0 ? 0.6 : 0;
    const score = tagNames.length
      ? 0.45 * tagCos + 0.3 * genreJ + 0.1 * yearProx + 0.15 * pop
      : 0.6 * genreJ + 0.2 * yearProx + 0.2 * pop;

    hits.push({
      movie: { id: cid, title: m.title, year: m.year, genres: gc, tmdbId: m.tmdbId },
      via: sharedTags.length ? sharedTags.slice(0, 3).join(", ") : sharedGenres.join(", "),
      score,
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

const STARTERS: [string, number][] = [
  ["Elf", 2003], ["The Shining", 1980], ["Jaws", 1975],
  ["Home Alone", 1990], ["Gone Girl", 2014], ["Toy Story", 1995],
];

export function getStarters(): { id: number; title: string; year: number }[] {
  const q = getDb().prepare("SELECT movie_id id, title, year FROM movies WHERE title = ? AND year = ?");
  return STARTERS.map(([t, y]) => q.get(t, y) as { id: number; title: string; year: number } | undefined).filter(
    (r): r is { id: number; title: string; year: number } => !!r,
  );
}
