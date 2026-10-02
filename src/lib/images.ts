/** TMDB image URLs. Client-safe: no fetching, no secrets. */
export const imageUrl = (p: string | null, size: "w92" | "w185" | "w342" = "w185") =>
  p ? `https://image.tmdb.org/t/p/${size}${p}` : null;
