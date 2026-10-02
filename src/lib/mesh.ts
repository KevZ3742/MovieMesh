import { getMovie, getSimilar } from "./catalog";
import { getTmdbMovie, tmdbEnabled } from "./tmdb";
import { featuresOf } from "./score";
import { computeWhen } from "./when";
import type { ExpandResponse, MeshMovieData, MovieSummary } from "./types";

type MovieNode = { id: string } & MeshMovieData;

async function movieNode(s: MovieSummary, via: string | null, useTmdb: boolean): Promise<MovieNode> {
  const full = getMovie(s.id);
  const when = full ? computeWhen(full) : { peakMonth: null, strength: "none" as const, source: "none" as const };
  // Everything the watch score needs rides along on the node, so the client can re-score
  // instantly when the library changes (no refetch).
  const tmdb = useTmdb && s.tmdbId ? await getTmdbMovie(s.tmdbId) : null;
  const features = featuresOf(
    full ?? { id: s.id, title: s.title, year: s.year, genres: s.genres, tags: [], avgRating: null, nRatings: null },
    when,
    tmdb?.cast, // actor streaks need to know who's in each movie
  );
  return {
    ...features,
    id: `m:${s.id}`,
    kind: "movie",
    tmdbId: s.tmdbId,
    posterPath: tmdb?.posterPath ?? null,
    via,
  };
}

/** Clicking a movie: its most similar movies from the catalog. */
export async function expandMovie(id: number, useTmdb = true): Promise<ExpandResponse | null> {
  const movie = getMovie(id);
  if (!movie) return null;
  const similar = getSimilar(id, 6);
  const [nodes, tmdb] = await Promise.all([
    Promise.all(similar.map((s) => movieNode(s.movie, s.via, useTmdb))),
    // Only used to report whether TMDB answered (the lookup is cached, so this costs nothing extra).
    useTmdb && movie.tmdbId ? getTmdbMovie(movie.tmdbId) : Promise.resolve(null),
  ]);
  const edges: ExpandResponse["edges"] = similar.map((s) => ({
    source: `m:${id}`,
    target: `m:${s.movie.id}`,
    via: s.via,
  }));
  return { nodes, edges, tmdb: !(await tmdbEnabled()) ? "disabled" : !useTmdb ? "off" : tmdb ? "ok" : "unavailable" };
}
