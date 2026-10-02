import { getMovie, getStarters } from "./catalog";
import { getTmdbMovie, tmdbEnabled } from "./tmdb";
import type { MovieDetail } from "./types";
import { computeWhen } from "./when";

/** Everything the UI needs about one movie. Server-only (reads the catalog, may call TMDB). */
export async function loadMovieDetail(id: number): Promise<MovieDetail | null> {
  const movie = getMovie(id);
  if (!movie) return null;
  const tmdb = movie.tmdbId ? await getTmdbMovie(movie.tmdbId) : null;
  return {
    movie,
    when: computeWhen(movie),
    tmdb,
    tmdbStatus: !tmdbEnabled() ? "disabled" : tmdb ? "ok" : "unavailable",
  };
}

/** Quick-start movies for the empty state, each tagged with its season colour. */
export function loadStarters() {
  return getStarters().map((s) => {
    const full = getMovie(s.id);
    const when = full ? computeWhen(full) : null;
    return { ...s, peakMonth: when?.peakMonth ?? null, weak: when?.strength === "mild" };
  });
}
