// The watch score: one number (0-100) per movie. Each indicator earns a share of the 100 points,
// and the shares below say how much each one counts. Pure and client/server safe.
//
// Every indicator returns a Factor that carries its own number and its own reason, so the
// breakdown on screen can never disagree with the score: the points always add up to it.

import { streakFit, streakText } from "./streaks";
import { MONTHS, monthsUntil } from "./seasons";
import type { Library, LibraryEntry, Movie, MovieFeatures, When } from "./types";

// ---------- tiers (the rim colour) ----------
export type TierId = "now" | "good" | "maybe" | "low" | "unknown";
export type Tier = { id: TierId; label: string; color: string; dashed?: boolean };

export const TIERS: Record<TierId, Tier> = {
  now: { id: "now", label: "Watch now", color: "#2FA66A" },
  good: { id: "good", label: "Good fit", color: "#8CBF3F" },
  maybe: { id: "maybe", label: "Maybe later", color: "#E3A008" },
  low: { id: "low", label: "Not now", color: "#8089A3" },
  unknown: { id: "unknown", label: "No signal yet", color: "#8089A3", dashed: true },
};

export const TIER_CUTOFFS = { now: 75, good: 60, maybe: 45 };

export function tierFor(score: number): Tier {
  if (score >= TIER_CUTOFFS.now) return TIERS.now;
  if (score >= TIER_CUTOFFS.good) return TIERS.good;
  if (score >= TIER_CUTOFFS.maybe) return TIERS.maybe;
  return TIERS.low;
}

// ---------- the red-to-green scale used everywhere a 0-1 value is drawn ----------
export const SCALE = { low: "#D0594A", mid: "#E3A008", high: "#2FA66A" };
export const SCALE_GRADIENT = `linear-gradient(90deg, ${SCALE.low}, ${SCALE.mid} 50%, ${SCALE.high})`;

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export function valueColor(v: number): string {
  const t = Math.min(1, Math.max(0, v));
  const [from, to, u] = t < 0.5 ? [SCALE.low, SCALE.mid, t * 2] : [SCALE.mid, SCALE.high, (t - 0.5) * 2];
  const a = hex(from);
  const b = hex(to);
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * u)).join(",")})`;
}

// ---------- indicators ----------
export type FactorKey = "quality" | "streak" | "season" | "vibe" | "genre" | "era" | "history";

/**
 * TUNE HERE. How many of the 100 points each indicator can earn.
 * Indicators that don't apply to a movie (no seasonal pattern, no active streak, ...) are left out
 * and the rest are scaled up to fill the 100, so a movie is never punished for missing data.
 * `history` (your own rating) only applies to movies you've already watched, so it's the rewatch signal.
 */
export const WEIGHTS: Record<FactorKey, number> = {
  quality: 30, // very high: is it actually good?
  streak: 22, // mildly high: does it continue what you're on a roll with?
  season: 18, // mid: is it the right time of year?
  vibe: 12, // does it feel like specific movies you loved?
  genre: 10, // mild: genres you tend to enjoy
  era: 8, // mild: decades you tend to enjoy
  history: 25, // your own verdict, for rewatches
};

/** Fixed display order (also the order of the spider graph's axes). */
export const FACTOR_ORDER: FactorKey[] = ["quality", "streak", "season", "vibe", "genre", "era", "history"];
const LABELS: Record<FactorKey, string> = {
  quality: "Rating",
  streak: "Streak",
  season: "Season",
  vibe: "Vibe",
  genre: "Genre",
  era: "Era",
  history: "You",
};

export type Factor = {
  key: FactorKey;
  label: string;
  /** 0-1 how good this signal looks, or null when it doesn't apply to this movie. */
  value: number | null;
  /** Points this indicator contributes to the score. All points add up to the score exactly. */
  points: number;
  /** The most it could contribute for this movie (its share of the 100). 0 when it doesn't apply. */
  max: number;
  reason: string;
};
type RawFactor = Pick<Factor, "key" | "value" | "reason">;

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const na = (key: FactorKey, reason: string): RawFactor => ({ key, value: null, reason });

// ---------- features ----------
export function featuresOf(
  m: Pick<Movie, "id" | "title" | "year" | "genres" | "tags" | "avgRating" | "nRatings">,
  when: Pick<When, "peakMonth" | "strength" | "source">,
  cast?: { id: number; name: string }[],
): MovieFeatures {
  return {
    movieId: m.id,
    title: m.title,
    year: m.year,
    genres: m.genres,
    tags: m.tags.slice(0, 15).map((t) => t.tag),
    cast: cast?.slice(0, 5).map((c) => ({ id: c.id, name: c.name })),
    avgRating: m.avgRating,
    nRatings: m.nRatings,
    peakMonth: when.peakMonth,
    weak: when.strength === "mild",
    seasonSource: when.source,
  };
}

// ---------- rating (very high) ----------
const PRIOR_MEAN = 3.4; // rough MovieLens-wide average
const PRIOR_WEIGHT = 150; // pretend every movie starts with this many average votes

function qualityFactor(f: MovieFeatures): RawFactor {
  if (f.avgRating == null || f.nRatings == null) return na("quality", "No rating data for this movie");
  const shrunk = (f.nRatings * f.avgRating + PRIOR_WEIGHT * PRIOR_MEAN) / (f.nRatings + PRIOR_WEIGHT);
  const value = clamp((shrunk - 2.5) / 2); // 2.5 stars -> 0, 4.5 stars -> 1
  const n = f.nRatings.toLocaleString("en-US");
  const reason =
    value >= 0.65 ? `Highly rated: ${f.avgRating.toFixed(1)}/5 from ${n} MovieLens users`
    : value < 0.35 ? `Rated low: ${f.avgRating.toFixed(1)}/5 from ${n} MovieLens users`
    : `Decent ratings: ${f.avgRating.toFixed(1)}/5 from ${n} MovieLens users`;
  return { key: "quality", value, reason };
}

// ---------- streak (mildly high) ----------
// If you're on a roll (3 comedies in a row, 2 films with the same actor in a row), movies that keep
// it going score high and movies that break it score lower. No active streak: it doesn't apply.
const STREAK = { base: 0.55, perStep: 0.09, breaks: 0.4 }; // value = base + perStep * (length so far), max 1

function streakFactor(f: MovieFeatures, lib: Library, entry: LibraryEntry | null): RawFactor {
  if (entry?.status === "watched") return na("streak", "You've already watched this");
  const fit = streakFit(lib, { genres: f.genres, cast: f.cast });
  if (fit.kind === "none") return na("streak", "No active streak. Watch 3 of a genre or 2 with the same actor in a row to start one");
  if (fit.kind === "breaks") {
    return { key: "streak", value: STREAK.breaks, reason: `Breaks your streak of ${streakText(fit.current)}` };
  }
  const value = clamp(STREAK.base + STREAK.perStep * fit.prev);
  const more = fit.others > 0 ? ` (+${fit.others} more streak${fit.others > 1 ? "s" : ""})` : "";
  const reason = fit.continued
    ? `Keeps your streak going: ${streakText(fit.streak)}${more}`
    : `Would start a streak: ${streakText(fit.streak)}${more}`;
  return { key: "streak", value, reason };
}

// ---------- season (mid) ----------
function seasonFactor(f: MovieFeatures, now: Date): RawFactor {
  if (f.peakMonth === null) return na("season", "No seasonal pattern, works any time of year");
  const peak = MONTHS[f.peakMonth];
  const d = monthsUntil(f.peakMonth, now);
  const raw = d === 0 ? 1 : d === 1 ? 0.7 : d === 2 ? 0.4 : d === 11 ? 0.45 : d === 10 ? 0.25 : 0.1;
  const value = f.weak ? 0.5 + (raw - 0.5) * 0.5 : raw; // genre-level guesses count for less
  const when =
    d === 0 ? `In season now (best in ${peak})`
    : d === 1 ? `In season next month (${peak})`
    : d === 2 ? `Season starts in 2 months (${peak})`
    : `Best in ${peak}, which is ${d} months away`;
  return { key: "season", value, reason: f.weak ? `${when}. Weak, genre-level pattern` : when };
}

// ---------- what you've watched (shared by vibe, genre, era) ----------
type Watched = { id: number; entry: LibraryEntry; a: number };

/** How much a library entry says about your taste: -1 (hated it) to +1 (loved it). */
const affinity = (e: LibraryEntry) => (e.rating != null ? (e.rating - 3) / 2 : 0.2); // unrated: mild positive

const watchedExcept = (lib: Library, movieId: number): Watched[] =>
  Object.entries(lib)
    .filter(([id, e]) => e.status === "watched" && Number(id) !== movieId)
    .map(([id, entry]) => ({ id: Number(id), entry, a: affinity(entry) }));

type Fit = { value: number; key: string; n: number; avg: number | null };

/**
 * How you've felt about movies sharing each of `keys` (a genre, a decade). Each key's average affinity is
 * shrunk toward neutral when you've only seen a few, then averaged. null = you've seen none of these.
 */
function fitFor(keys: string[], watched: Watched[], keysOf: (e: LibraryEntry) => string[], k: number): Fit | null {
  let total = 0;
  let used = 0;
  let best: (Fit & { s: number }) | null = null;
  for (const key of keys) {
    const hits = watched.filter((w) => keysOf(w.entry).includes(key));
    if (!hits.length) continue;
    const s = (hits.reduce((x, w) => x + w.a, 0) / hits.length) * (hits.length / (hits.length + k));
    total += s;
    used++;
    const rated = hits.filter((w) => w.entry.rating != null);
    const avg = rated.length ? rated.reduce((x, w) => x + w.entry.rating!, 0) / rated.length : null;
    if (!best || Math.abs(s) > Math.abs(best.s)) best = { s, key, n: hits.length, avg, value: 0 };
  }
  if (!used || !best) return null;
  return { value: clamp(0.5 + 0.5 * (total / used)), key: best.key, n: best.n, avg: best.avg };
}

const fitReason = (fit: Fit, seen: string) => {
  const avg = fit.avg != null ? `, rated ${fit.avg.toFixed(1)}★ on average` : "";
  return fit.value >= 0.6 ? `You've liked ${seen}${avg}` : fit.value < 0.4 ? `You haven't loved ${seen}${avg}` : `You've watched ${seen}${avg}`;
};

// ---------- genre (mild) ----------
function genreFactor(f: MovieFeatures, watched: Watched[]): RawFactor {
  if (!watched.length) return na("genre", "Mark and rate movies you've watched to learn your genres");
  const fit = fitFor(f.genres, watched, (e) => e.genres ?? [], 2);
  if (!fit) return na("genre", "You haven't watched this genre yet");
  return { key: "genre", value: fit.value, reason: fitReason(fit, `${fit.n} ${fit.key} movie${fit.n > 1 ? "s" : ""}`) };
}

// ---------- era (mild) ----------
const decadeOf = (y: number | null) => (y == null ? null : `${Math.floor(y / 10) * 10}s`);

function eraFactor(f: MovieFeatures, watched: Watched[]): RawFactor {
  const decade = decadeOf(f.year);
  if (!decade) return na("era", "No release year for this movie");
  if (!watched.length) return na("era", "Mark and rate movies you've watched to learn your eras");
  const fit = fitFor([decade], watched, (e) => (decadeOf(e.year) ? [decadeOf(e.year)!] : []), 3);
  if (!fit) return na("era", `You haven't watched anything from the ${decade} yet`);
  return { key: "era", value: fit.value, reason: fitReason(fit, `${fit.n} movie${fit.n > 1 ? "s" : ""} from the ${fit.key}`) };
}

// ---------- vibe (compares tags with specific movies you've watched and rated) ----------
const tagSet = (tags: string[]) => new Set(tags);

function compare(a: Set<string>, b: Set<string>) {
  const shared: string[] = [];
  for (const x of a) if (b.has(x)) shared.push(x);
  const sim = a.size + b.size ? (2 * shared.length) / (a.size + b.size) : 0; // Dice coefficient
  return { sim, shared };
}

type Hit = { strength: number; entry: LibraryEntry; shared: string[] };
const verb = (e: LibraryEntry) => (e.rating != null ? `rated ${e.rating}★` : "watched");

function vibeFactor(f: MovieFeatures, watched: Watched[]): RawFactor {
  if (!f.tags.length) return na("vibe", "No tags for this movie to compare");
  const mine = tagSet(f.tags);
  let pos: Hit | null = null;
  let neg: Hit | null = null;
  let near = 0;
  let signal = 0;
  for (const { entry, a } of watched) {
    if (a === 0) continue; // a 3-star rating says nothing either way
    signal++;
    const { sim, shared } = compare(mine, tagSet(entry.tags ?? []));
    const strength = Math.min(1, sim * 2.5) * (0.4 + 0.6 * Math.abs(a));
    if (a > 0) {
      if (sim >= 0.15) near++;
      if (!pos || strength > pos.strength) pos = { strength, entry, shared };
    } else if (!neg || strength > neg.strength) {
      neg = { strength, entry, shared };
    }
  }
  if (!signal) return na("vibe", "Rate movies you've watched to match vibes");

  const extra = Math.max(0, near - 1);
  const posValue = pos ? Math.min(1, pos.strength + Math.min(0.16, extra * 0.08)) : 0;
  const negValue = neg?.strength ?? 0;
  // Nothing in common with anything you've watched is a shrug, not a strike: it bottoms out at 0.3.
  const value = clamp(0.3 + 0.7 * posValue - 0.7 * negValue);

  let reason = "Different from what you've watched so far";
  if (neg && negValue >= 0.2 && negValue > posValue * 0.7) {
    reason = `Similar to ${neg.entry.title}, which you ${verb(neg.entry)}`;
  } else if (pos && pos.strength >= 0.2) {
    reason = `Shares ${pos.shared.slice(0, 3).join(", ")} with ${pos.entry.title}, which you ${verb(pos.entry)}`;
    if (extra > 0) reason += ` (+${extra} more like it)`;
  }
  return { key: "vibe", value, reason };
}

// ---------- you (your own rating of this movie, for rewatches) ----------
function historyFactor(entry: LibraryEntry | null): RawFactor {
  if (entry?.status !== "watched") return na("history", "Not watched yet");
  if (entry.rating == null) return na("history", "You haven't rated it yet");
  const value = (entry.rating - 1) / 4; // 1 star -> 0, 5 stars -> 1
  const r = entry.rating;
  const reason =
    r >= 4 ? `You rated it ${r}★, so it's worth a rewatch`
    : r === 3 ? `You rated it ${r}★`
    : `You rated it ${r}★, so probably not a rewatch`;
  return { key: "history", value, reason };
}

// ---------- the blend ----------
export type Scored = {
  state: "scored" | "unknown";
  /** null only when no indicator applies at all. Watched movies are scored too: you can always rewatch. */
  score: number | null;
  tier: Tier;
  /** Every indicator in FACTOR_ORDER. Ones that don't apply have value null and 0 points. */
  factors: Factor[];
  status: LibraryEntry["status"] | null;
  rating: number | null;
};

/** Round each contribution to a whole number so the whole numbers still add up to `target` (largest remainder). */
function splitPoints(exact: number[], target: number): number[] {
  const out = exact.map(Math.floor);
  let left = target - out.reduce((s, n) => s + n, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

export function scoreMovie(f: MovieFeatures, lib: Library, now: Date): Scored {
  const entry = lib[String(f.movieId)] ?? null;
  const base = { status: entry?.status ?? null, rating: entry?.rating ?? null };
  const watched = watchedExcept(lib, f.movieId);

  const byKey: Record<FactorKey, RawFactor> = {
    quality: qualityFactor(f),
    streak: streakFactor(f, lib, entry),
    season: seasonFactor(f, now),
    vibe: vibeFactor(f, watched),
    genre: genreFactor(f, watched),
    era: eraFactor(f, watched),
    history: historyFactor(entry),
  };
  const raw = FACTOR_ORDER.map((k) => byKey[k]);
  const applies = raw.filter((x) => x.value !== null);
  if (!applies.length) {
    const factors = raw.map((x): Factor => ({ ...x, label: LABELS[x.key], points: 0, max: 0 }));
    return { ...base, state: "unknown", score: null, tier: TIERS.unknown, factors };
  }

  // The 100 points are split by weight across the indicators that apply; each earns value * its share.
  const totalWeight = applies.reduce((s, x) => s + WEIGHTS[x.key], 0);
  const maxOf = (x: RawFactor) => (x.value === null ? 0 : (100 * WEIGHTS[x.key]) / totalWeight);
  const exact = raw.map((x) => (x.value === null ? 0 : maxOf(x) * x.value));
  const score = Math.round(exact.reduce((s, n) => s + n, 0));
  const points = splitPoints(exact, score);
  const factors = raw.map(
    (x, i): Factor => ({ ...x, label: LABELS[x.key], points: points[i], max: Math.max(Math.round(maxOf(x)), points[i]) }),
  );
  return { ...base, state: "scored", score, tier: tierFor(score), factors };
}
