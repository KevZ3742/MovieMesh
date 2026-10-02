import { catalogHasRatings, getMovie, getStarters } from "./catalog";
import { featuresOf } from "./score";
import { getTmdbMovie, tmdbEnabled } from "./tmdb";
import type { MovieDetail, Starter } from "./types";
import { computeWhen } from "./when";

/** Everything the UI needs about one movie. Server-only (reads the catalog, may call TMDB). */
export async function loadMovieDetail(id: number, useTmdb = true): Promise<MovieDetail | null> {
  const movie = getMovie(id);
  if (!movie) return null;
  const enabled = await tmdbEnabled();
  const tmdb = enabled && useTmdb && movie.tmdbId ? await getTmdbMovie(movie.tmdbId) : null;
  return {
    movie,
    when: computeWhen(movie),
    tmdb,
    ratingsMissing: !catalogHasRatings(),
    tmdbStatus: !enabled ? "disabled" : !useTmdb ? "off" : tmdb ? "ok" : "unavailable",
  };
}

/** Quick-start movies for the empty state, each carrying what the watch score needs. */
export function loadStarters(): Starter[] {
  return getStarters().flatMap((s) => {
    const full = getMovie(s.id);
    return full ? [{ id: s.id, ...featuresOf(full, computeWhen(full)) }] : [];
  });
}
