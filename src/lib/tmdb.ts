import { cookies } from "next/headers";
import { TMDB_KEY_COOKIE } from "./prefs";
import type { CastMember, TmdbMovie } from "./types";

const BASE = "https://api.themoviedb.org/3";
const DAY = 60 * 60 * 24;

export type TmdbAuth = {
  /** "token" = v4 read access token (Bearer), "key" = v3 api_key. */
  kind: "token" | "key";
  value: string;
  /** "user" = pasted into Settings, "env" = from .env.local. */
  source: "user" | "env";
};

/** v4 tokens are long JWTs starting "eyJ"; v3 keys are 32 hex characters. */
export const classifyKey = (v: string): TmdbAuth["kind"] => (v.startsWith("eyJ") || v.length > 40 ? "token" : "key");

/** Which credential to use. A key saved in Settings wins over .env.local. */
export async function tmdbAuth(): Promise<TmdbAuth | null> {
  let saved: string | undefined;
  try {
    saved = (await cookies()).get(TMDB_KEY_COOKIE)?.value;
  } catch {
    // not inside a request (a script, say): fall through to the env vars
  }
  if (saved) return { kind: classifyKey(saved), value: saved, source: "user" };
  if (process.env.TMDB_READ_TOKEN) return { kind: "token", value: process.env.TMDB_READ_TOKEN, source: "env" };
  if (process.env.TMDB_API_KEY) return { kind: "key", value: process.env.TMDB_API_KEY, source: "env" };
  return null;
}

export async function tmdbEnabled(): Promise<boolean> {
  return !!(await tmdbAuth());
}

function buildRequest(auth: TmdbAuth, pathname: string, params: Record<string, string> = {}) {
  const url = new URL(BASE + pathname);
  const headers: Record<string, string> = { accept: "application/json" };
  if (auth.kind === "token") headers.authorization = `Bearer ${auth.value}`;
  else url.searchParams.set("api_key", auth.value);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { url, headers };
}

/** Asks TMDB whether a key works (used by Settings before it saves one). */
export async function checkTmdbKey(value: string): Promise<"ok" | "rejected" | "unreachable"> {
  const { url, headers } = buildRequest({ kind: classifyKey(value), value, source: "user" }, "/configuration");
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.ok) return "ok";
    return res.status === 401 ? "rejected" : "unreachable";
  } catch {
    return "unreachable";
  }
}

async function tmdbGet<T>(pathname: string, params: Record<string, string> = {}): Promise<T | null> {
  const auth = await tmdbAuth();
  if (!auth) return null;
  const { url, headers } = buildRequest(auth, pathname, params);
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
