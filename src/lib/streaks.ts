// Streaks: how many of your most recently watched movies in a row share a genre or an actor.
// Pure and client/server safe. "In a row" means newest-first by when you marked each movie watched.

import type { Library } from "./types";

export type Streak = {
  kind: "genre" | "actor";
  /** Genre name or TMDB person id (as a string). */
  key: string;
  /** Genre name or actor name, for display. */
  label: string;
  length: number;
};

/** Shortest chain worth showing. Genres are common, so they need a longer run than actors. */
export const MIN_STREAK = { genre: 3, actor: 2 } as const;

type Cast = { id: number; name: string }[];
type Item = { genres: string[]; cast?: Cast };

const IGNORED_GENRES = new Set(["(no genres listed)"]);

/**
 * Streaks that include the first item. `cast` being undefined means "unknown", which breaks an actor
 * chain instead of silently extending it, so we never claim a streak we can't back up.
 */
function runs(items: Item[]): Streak[] {
  const head = items[0];
  if (!head) return [];
  const candidates: (Omit<Streak, "length"> & { has: (i: Item) => boolean })[] = [
    ...head.genres
      .filter((g) => !IGNORED_GENRES.has(g))
      .map((g) => ({ kind: "genre" as const, key: g, label: g, has: (i: Item) => i.genres.includes(g) })),
    ...(head.cast ?? []).map((c) => ({
      kind: "actor" as const,
      key: String(c.id),
      label: c.name,
      has: (i: Item) => !!i.cast?.some((x) => x.id === c.id),
    })),
  ];
  const out: Streak[] = [];
  for (const c of candidates) {
    let n = 0;
    while (n < items.length && c.has(items[n])) n++;
    if (n >= MIN_STREAK[c.kind]) out.push({ kind: c.kind, key: c.key, label: c.label, length: n });
  }
  // Longest first; on a tie an actor is the more interesting thing to say.
  return out.sort((a, b) => b.length - a.length || Number(b.kind === "actor") - Number(a.kind === "actor"));
}

const watchedNewestFirst = (lib: Library): Item[] =>
  Object.values(lib)
    .filter((e) => e.status === "watched")
    .sort((a, b) => b.at - a.at)
    .map((e) => ({ genres: e.genres ?? [], cast: e.cast }));

/** Your running streaks right now (they all include your most recently watched movie). */
export function currentStreaks(lib: Library): Streak[] {
  return runs(watchedNewestFirst(lib));
}

/** Streaks you'd have if you watched this movie next. Compare with currentStreaks to see what it extends. */
export function streaksIfWatched(lib: Library, movie: Item): Streak[] {
  return runs([movie, ...watchedNewestFirst(lib)]);
}

export type StreakFit =
  /** No active streak, and this movie wouldn't start one. */
  | { kind: "none" }
  /** You're on a streak and this movie isn't part of it. */
  | { kind: "breaks"; current: Streak }
  /** Watching this next would extend a streak you're on (or start one). `prev` = length before it. */
  | { kind: "extends"; streak: Streak; prev: number; continued: boolean; others: number };

/** How a movie you haven't watched fits with your current streaks. */
export function streakFit(lib: Library, movie: Item): StreakFit {
  const current = currentStreaks(lib);
  const next = streaksIfWatched(lib, movie);
  if (next.length) {
    const streak = next[0];
    const continued = current.some((c) => c.kind === streak.kind && c.key === streak.key);
    return { kind: "extends", streak, prev: streak.length - 1, continued, others: next.length - 1 };
  }
  return current.length ? { kind: "breaks", current: current[0] } : { kind: "none" };
}

export function streakText(s: Streak): string {
  return s.kind === "genre" ? `${s.length} ${s.label} movies in a row` : `${s.length} films with ${s.label} in a row`;
}
