/** Client-safe preference for the TMDB switch. Stored in a cookie so the server can read it too,
 *  which means the first paint already matches the person's choice (no flash of posters). */
export const TMDB_COOKIE = "mm_tmdb";
/** HTTP-only cookie holding a TMDB key the person pasted into Settings. Only ever set/read on the server. */
export const TMDB_KEY_COOKIE = "mm_tmdb_key";

export function saveTmdbPref(on: boolean) {
  document.cookie = `${TMDB_COOKIE}=${on ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}
