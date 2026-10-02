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
  // ---- inputs to the watch score (see lib/score.ts) ----
  genres: string[];
  /** Most agreed-upon tags first. */
  tags: string[];
  /** Top-billed cast when TMDB is available (used for actor streaks). */
  cast?: { id: number; name: string }[];
  avgRating: number | null;
  nRatings: number | null;
  peakMonth: number | null;
  /** True when the peak month is only a weak, genre-level guess. */
  weak?: boolean;
  seasonSource: When["source"];
  via: string | null;
  loading?: boolean;
};

/** Everything the watch score needs to know about a movie. */
export type MovieFeatures = Pick<
  MeshMovieData,
  "movieId" | "title" | "year" | "genres" | "tags" | "cast" | "avgRating" | "nRatings" | "peakMonth" | "weak" | "seasonSource"
>;

export type Starter = MovieFeatures & { id: number };

// ---- personal library (watched / plan to watch) ----
export type WatchStatus = "watched" | "planned";

export type LibraryEntry = {
  status: WatchStatus;
  /** 1-5 stars, only meaningful once watched. */
  rating: number | null;
  // Snapshot of the movie so taste matching works without re-fetching anything.
  title: string;
  year: number | null;
  genres: string[];
  tags: string[];
  /** Top-billed cast, saved when TMDB was available. Missing = unknown (used for actor streaks). */
  cast?: { id: number; name: string }[];
  at: number;
};

/** Keyed by MovieLens movie id (as a string). */
export type Library = Record<string, LibraryEntry>;

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
