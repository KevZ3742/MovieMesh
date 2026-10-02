// Decides whether a movie dropped onto the mesh (e.g. from your list) belongs next to
// anything that is already there. Pure, so it runs on the client against node data.

import type { MovieFeatures } from "./types";

export type Link = { nodeId: string; via: string; score: number };

/** At most this many links for one new node. */
export const MAX_MOVIE_LINKS = 3;

/** Same ingredients as the server's getSimilar, but a yes/no with a reason. */
export function movieLink(a: MovieFeatures, b: MovieFeatures): { via: string; score: number } | null {
  const bTags = new Set(b.tags);
  const bGenres = new Set(b.genres);
  const sharedTags = a.tags.filter((t) => bTags.has(t));
  const sharedGenres = a.genres.filter((g) => bGenres.has(g));

  const hasTags = a.tags.length > 0 && b.tags.length > 0;
  const concrete = hasTags
    ? sharedTags.length >= 2 || (sharedTags.length >= 1 && sharedGenres.length >= 1)
    : sharedGenres.length >= 2; // no tags to go on: need more than one broad genre in common
  if (!concrete) return null;

  const tagDice = hasTags ? (2 * sharedTags.length) / (a.tags.length + b.tags.length) : 0;
  const genreJ = sharedGenres.length / (new Set([...a.genres, ...b.genres]).size || 1);
  return {
    score: hasTags ? 0.6 * tagDice + 0.4 * genreJ : genreJ,
    via: (sharedTags.length ? sharedTags.slice(0, 3) : sharedGenres).join(", "),
  };
}

type NodeLike = { id: string; data: Partial<MovieFeatures> };

/** Which existing nodes should the new movie connect to? Empty means "leave it unconnected". */
export function findLinks(movie: MovieFeatures, nodes: NodeLike[]): Link[] {
  const movies: Link[] = [];
  for (const n of nodes) {
    if (n.data.movieId === movie.movieId) continue;
    const l = movieLink(movie, n.data as MovieFeatures);
    if (l) movies.push({ nodeId: n.id, ...l });
  }
  movies.sort((a, b) => b.score - a.score);
  return movies.slice(0, MAX_MOVIE_LINKS);
}

type Pt = { x: number; y: number };

/** A spot on a ring around `anchor` that is as far as possible from every other node. */
export function spotNear(anchor: Pt, awayFrom: Pt | null, others: Pt[], radius = 300): Pt {
  const base = awayFrom ? Math.atan2(anchor.y - awayFrom.y, anchor.x - awayFrom.x) : -Math.PI / 2;
  let best = { x: anchor.x + Math.cos(base) * radius, y: anchor.y + Math.sin(base) * radius };
  let bestGap = -1;
  for (let i = 0; i < 24; i++) {
    // fan out from the direction pointing away from where the anchor came from
    const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * ((Math.PI * 2) / 24);
    const p = { x: anchor.x + Math.cos(a) * radius, y: anchor.y + Math.sin(a) * radius };
    const gap = Math.min(...others.map((o) => Math.hypot(o.x - p.x, o.y - p.y)), Infinity);
    if (gap > bestGap + 40) { // prefer earlier (more "outward") angles unless a later one is clearly roomier
      best = p;
      bestGap = gap;
    }
  }
  return best;
}

/** A spot to the right of everything, for movies that connect to nothing. */
export function spotAside(others: Pt[]): Pt {
  if (!others.length) return { x: 0, y: 0 };
  const maxX = Math.max(...others.map((o) => o.x));
  const ys = others.map((o) => o.y);
  return { x: maxX + 320, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
