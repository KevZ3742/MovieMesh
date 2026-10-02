import type { CastMember, TmdbMovie } from "./types";

const BASE = "https://api.themoviedb.org/3";
const DAY = 60 * 60 * 24;

/** Works with either a v4 "read access token" (TMDB_READ_TOKEN) or a v3 key (TMDB_API_KEY). */
export function tmdbEnabled(): boolean {
  return !!(process.env.TMDB_READ_TOKEN || process.env.TMDB_API_KEY);
}

async function tmdbGet<T>(pathname: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!tmdbEnabled()) return null;
  const url = new URL(BASE + pathname);
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.TMDB_READ_TOKEN) headers.authorization = `Bearer ${process.env.TMDB_READ_TOKEN}`;
  else url.searchParams.set("api_key", process.env.TMDB_API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { headers, next: { revalidate: DAY } });
    if (!res.ok) {
      console.warn(`[tmdb] ${pathname} -> ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[tmdb] ${pathname} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

type RawMovie = {
  poster_path: string | null;
  overview: string | null;
  tagline: string | null;
  runtime: number | null;
  credits?: { cast?: { id: number; name: string; character: string | null; profile_path: string | null; order?: number }[] };
};

export async function getTmdbMovie(tmdbId: number): Promise<TmdbMovie | null> {
  const raw = await tmdbGet<RawMovie>(`/movie/${tmdbId}`, { append_to_response: "credits" });
  if (!raw) return null;
  const cast: CastMember[] = (raw.credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .slice(0, 10)
    .map((c) => ({ id: c.id, name: c.name, character: c.character || null, profilePath: c.profile_path }));
  return {
    posterPath: raw.poster_path,
    overview: raw.overview || null,
    tagline: raw.tagline || null,
    runtime: raw.runtime || null,
    cast,
  };
}

type RawCredits = { cast?: { id: number; media_type?: string; character?: string; vote_count?: number }[] };

/** TMDB ids of movies a person acted in, most-voted first. */
export async function getPersonMovieIds(personId: number): Promise<number[] | null> {
  const raw = await tmdbGet<RawCredits>(`/person/${personId}/combined_credits`);
  if (!raw) return null;
  return (raw.cast ?? [])
    .filter((c) => c.media_type === "movie")
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .map((c) => c.id);
}
