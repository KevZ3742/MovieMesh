import { getMovie, getMoviesByTmdbIds, getSimilar } from "./catalog";
import { getPersonMovieIds, getTmdbMovie, tmdbEnabled } from "./tmdb";
import { featuresOf } from "./score";
import { computeWhen } from "./when";
import type { ExpandResponse, MeshMovieData, MovieSummary } from "./types";

type MovieNode = { id: string } & MeshMovieData;

async function movieNode(s: MovieSummary, via: string | null): Promise<MovieNode> {
  const full = getMovie(s.id);
  const when = full ? computeWhen(full) : { peakMonth: null, strength: "none" as const, source: "none" as const };
  // Everything the watch score needs rides along on the node, so the client can re-score
  // instantly when the library changes (no refetch).
  const features = featuresOf(
    full ?? { id: s.id, title: s.title, year: s.year, genres: s.genres, tags: [], avgRating: null, nRatings: null },
    when,
  );
  const tmdb = s.tmdbId ? await getTmdbMovie(s.tmdbId) : null;
  return {
    ...features,
    id: `m:${s.id}`,
    kind: "movie",
    tmdbId: s.tmdbId,
    posterPath: tmdb?.posterPath ?? null,
    via,
  };
}

/** Clicking a movie: similar movies (from the catalog) + top cast (from TMDB, if configured). */
export async function expandMovie(id: number): Promise<ExpandResponse | null> {
  const movie = getMovie(id);
  if (!movie) return null;
  const similar = getSimilar(id, 6);
  const [simNodes, tmdb] = await Promise.all([
    Promise.all(similar.map((s) => movieNode(s.movie, s.via))),
    movie.tmdbId ? getTmdbMovie(movie.tmdbId) : Promise.resolve(null),
  ]);

  const source = `m:${id}`;
  const nodes: ExpandResponse["nodes"] = [...simNodes];
  const edges: ExpandResponse["edges"] = similar.map((s) => ({
    source,
    target: `m:${s.movie.id}`,
    via: s.via,
  }));
  for (const c of tmdb?.cast.slice(0, 5) ?? []) {
    nodes.push({
      id: `p:${c.id}`,
      kind: "person",
      personId: c.id,
      name: c.name,
      character: c.character,
      profilePath: c.profilePath,
      via: `Cast of ${movie.title}`,
    });
    edges.push({ source, target: `p:${c.id}`, via: "cast" });
  }
  return { nodes, edges, tmdb: !tmdbEnabled() ? "disabled" : tmdb ? "ok" : "unavailable" };
}

/** Clicking an actor: their films that exist in the catalog (joined on tmdb_id). */
export async function expandPerson(personId: number, name: string): Promise<ExpandResponse> {
  if (!tmdbEnabled()) return { nodes: [], edges: [], tmdb: "disabled" };
  const tmdbIds = await getPersonMovieIds(personId);
  if (!tmdbIds) return { nodes: [], edges: [], tmdb: "unavailable" };
  const found = getMoviesByTmdbIds(tmdbIds.slice(0, 80)).slice(0, 6);
  const nodes = await Promise.all(found.map((f) => movieNode(f, `${name} acted in this`)));
  return {
    nodes,
    edges: found.map((f) => ({ source: `p:${personId}`, target: `m:${f.id}`, via: "acted in" })),
    tmdb: "ok",
  };
}
