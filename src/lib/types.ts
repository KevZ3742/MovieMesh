// Month indices are 0-11 (Jan = 0) everywhere in the app.

export type Seasonal = { peakMonth: number; lift: number; peakYears: number };

export type Movie = {
  id: number;
  title: string;
  altTitle: string | null;
  year: number | null;
  genres: string[];
  tags: { tag: string; n: number }[];
  imdbId: string | null;
  tmdbId: number | null;
  nRatings: number | null;
  avgRating: number | null;
  seasonal: Seasonal | null;
};

export type MovieSummary = {
  id: number;
  title: string;
  year: number | null;
  genres: string[];
  tmdbId: number | null;
};

/** Where a movie sits in the year, and why we think so. */
export type When = {
  peakMonth: number | null;
  source: "learned" | "tags" | "genre" | "none";
  strength: "strong" | "mild" | "none";
  reason: string;
};

export type CastMember = {
  id: number;
  name: string;
  character: string | null;
  profilePath: string | null;
};

export type TmdbMovie = {
  posterPath: string | null;
  overview: string | null;
  tagline: string | null;
  runtime: number | null;
  cast: CastMember[];
};

export type TmdbStatus = "ok" | "disabled" | "unavailable";

export type MovieDetail = {
  movie: Movie;
  when: When;
  tmdb: TmdbMovie | null;
  tmdbStatus: TmdbStatus;
};

export type SearchHit = {
  id: number;
  title: string;
  year: number | null;
  genres: string[];
};

// ---- mesh ----
export type MeshMovieData = {
  kind: "movie";
  movieId: number;
  title: string;
  year: number | null;
  tmdbId: number | null;
  posterPath: string | null;
  peakMonth: number | null;
  /** True when the peak month is only a weak, genre-level guess (drawn with a dashed rim). */
  weak?: boolean;
  via: string | null;
  loading?: boolean;
};

export type MeshPersonData = {
  kind: "person";
  personId: number;
  name: string;
  character: string | null;
  profilePath: string | null;
  via: string | null;
  loading?: boolean;
};

export type MeshNodeData = MeshMovieData | MeshPersonData;

export type ExpandResponse = {
  nodes: ({ id: string } & MeshNodeData)[];
  edges: { source: string; target: string; via: string }[];
  tmdb: TmdbStatus;
};
