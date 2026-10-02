// The watch score: one number (0-100) per movie, blended from several signals.
// Pure and client/server safe. Each signal returns a Factor that carries its own
// human-readable reason, so "why is this recommended" can never disagree with the score.

import { MONTHS, monthsUntil } from "./seasons";
import type { Library, LibraryEntry, Movie, MovieFeatures, When } from "./types";

// ---------- tiers (the rim colour) ----------
export type TierId = "now" | "good" | "maybe" | "low" | "unknown" | "watched";
export type Tier = { id: TierId; label: string; color: string; dashed?: boolean };

export const TIERS: Record<TierId, Tier> = {
  now: { id: "now", label: "Watch now", color: "#2FA66A" },
  good: { id: "good", label: "Good fit", color: "#8CBF3F" },
  maybe: { id: "maybe", label: "Maybe later", color: "#E3A008" },
  low: { id: "low", label: "Not now", color: "#8089A3" },
  unknown: { id: "unknown", label: "No signal yet", color: "#8089A3", dashed: true },
  watched: { id: "watched", label: "Watched", color: "#8089A3" },
};

export const TIER_CUTOFFS = { now: 75, good: 60, maybe: 45 };

export function tierFor(score: number): Tier {
  if (score >= TIER_CUTOFFS.now) return TIERS.now;
  if (score >= TIER_CUTOFFS.good) return TIERS.good;
  if (score >= TIER_CUTOFFS.maybe) return TIERS.maybe;
  return TIERS.low;
}

// ---------- factors ----------
export type FactorKey = "season" | "taste" | "quality" | "planned";
export type Factor = {
  key: FactorKey;
  label: string;
  /** 0-1: how good this signal looks for this movie. */
  value: number;
  /** How much this signal counts in the blend. */
  weight: number;
  reason: string;
  tone: "good" | "neutral" | "bad";
};

// Tune these. Only signals that apply to a movie are blended (weights are re-normalised),
// so a movie with no seasonal pattern is graded on taste and quality alone.
export const WEIGHTS: Record<"season" | "taste" | "quality", number> = { season: 0.3, taste: 0.4, quality: 0.2 };
/** Points added on top when a movie is on your plan-to-watch list. */
export const PLANNED_BONUS = 10;

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const toneOf = (v: number): Factor["tone"] => (v >= 0.6 ? "good" : v < 0.35 ? "bad" : "neutral");

// ---------- features ----------
export function featuresOf(
  m: Pick<Movie, "id" | "title" | "year" | "genres" | "tags" | "avgRating" | "nRatings">,
  when: Pick<When, "peakMonth" | "strength" | "source">,
): MovieFeatures {
  return {
    movieId: m.id,
    title: m.title,
    year: m.year,
    genres: m.genres,
    tags: m.tags.slice(0, 15).map((t) => t.tag),
    avgRating: m.avgRating,
    nRatings: m.nRatings,
    peakMonth: when.peakMonth,
    weak: when.strength === "mild",
    seasonSource: when.source,
  };
}

// ---------- season ----------
function seasonFactor(f: MovieFeatures, now: Date): Factor | null {
  if (f.peakMonth === null) return null; // "any time works": not a signal either way
  const peak = MONTHS[f.peakMonth];
  const d = monthsUntil(f.peakMonth, now);
  const raw = d === 0 ? 1 : d === 1 ? 0.7 : d === 2 ? 0.4 : d === 11 ? 0.45 : d === 10 ? 0.25 : 0.1;
  const value = f.weak ? 0.5 + (raw - 0.5) * 0.5 : raw; // genre-level guesses count for less
  const when =
    d === 0 ? `In season now (best in ${peak})`
    : d === 1 ? `In season next month (${peak})`
    : d === 2 ? `Season starts in 2 months (${peak})`
    : `Best in ${peak}, which is ${d} months away`;
  return {
    key: "season",
    label: "Season",
    value,
    weight: WEIGHTS.season,
    reason: f.weak ? `${when}. Weak, genre-level pattern` : when,
    tone: toneOf(value),
  };
}

// ---------- quality ----------
const PRIOR_MEAN = 3.4; // rough MovieLens-wide average
const PRIOR_WEIGHT = 150; // pretend every movie starts with this many average votes

function qualityFactor(f: MovieFeatures): Factor | null {
  if (f.avgRating == null || f.nRatings == null) return null; // catalog built without --ratings
  const shrunk = (f.nRatings * f.avgRating + PRIOR_WEIGHT * PRIOR_MEAN) / (f.nRatings + PRIOR_WEIGHT);
  const value = clamp((shrunk - 2.5) / 2); // 2.5 stars -> 0, 4.5 stars -> 1
  const n = f.nRatings.toLocaleString("en-US");
  const reason =
    value >= 0.65 ? `Highly rated: ${f.avgRating.toFixed(1)}/5 from ${n} MovieLens users`
    : value < 0.35 ? `Rated low: ${f.avgRating.toFixed(1)}/5 from ${n} MovieLens users`
    : `Decent ratings: ${f.avgRating.toFixed(1)}/5 from ${n} MovieLens users`;
  return { key: "quality", label: "Quality", value, weight: WEIGHTS.quality, reason, tone: toneOf(value) };
}

// ---------- taste (compares against what you've watched, rated and planned) ----------
type Sig = { genres: string[]; tags: string[] };
const signature = (m: Sig) => new Set([...m.tags.map((t) => `t:${t}`), ...m.genres.map((g) => `g:${g}`)]);

function compare(a: Set<string>, b: Set<string>) {
  const shared: string[] = [];
  for (const x of a) if (b.has(x)) shared.push(x);
  const sim = a.size + b.size ? (2 * shared.length) / (a.size + b.size) : 0; // Dice coefficient
  shared.sort((x, y) => (x[0] === "t" ? 0 : 1) - (y[0] === "t" ? 0 : 1)); // tags are more specific than genres
  return { sim, shared: shared.map((x) => x.slice(2)) };
}

/** How much a library entry says about your taste: -1 (hated it) to +1 (loved it). */
function affinity(e: LibraryEntry) {
  if (e.rating != null) return (e.rating - 3) / 2;
  return e.status === "watched" ? 0.2 : 0.1; // watched-but-unrated and planned are mild positives
}

const verb = (e: LibraryEntry) =>
  e.rating != null ? `rated ${e.rating}★` : e.status === "planned" ? "plan to watch" : "watched";

type Hit = { strength: number; entry: LibraryEntry; shared: string[] };

function tasteFactor(f: MovieFeatures, lib: Library): Factor | null {
  const mine = signature(f);
  let pos: Hit | null = null;
  let neg: Hit | null = null;
  let near = 0;
  let signal = 0;
  for (const [id, entry] of Object.entries(lib)) {
    if (Number(id) === f.movieId) continue;
    const a = affinity(entry);
    if (a === 0) continue; // a 3-star rating says nothing either way
    signal++;
    const { sim, shared } = compare(mine, signature({ genres: entry.genres ?? [], tags: entry.tags ?? [] }));
    const strength = Math.min(1, sim * 2.5) * (0.4 + 0.6 * Math.abs(a));
    if (a > 0) {
      if (sim >= 0.15) near++;
      if (!pos || strength > pos.strength) pos = { strength, entry, shared };
    } else if (!neg || strength > neg.strength) {
      neg = { strength, entry, shared };
    }
  }
  if (!signal) return null; // empty library: nothing to match against

  const extra = Math.max(0, near - 1);
  const posValue = pos ? Math.min(1, pos.strength + Math.min(0.16, extra * 0.08)) : 0;
  const negValue = neg?.strength ?? 0;
  const value = clamp(posValue - 0.7 * negValue);

  let reason = "Different from what you've watched so far";
  if (neg && negValue >= 0.2 && negValue > posValue * 0.7) {
    reason = `Similar to ${neg.entry.title}, which you ${verb(neg.entry)}`;
  } else if (pos && pos.strength >= 0.2) {
    reason = `Shares ${pos.shared.slice(0, 3).join(", ")} with ${pos.entry.title}, which you ${verb(pos.entry)}`;
    if (extra > 0) reason += ` (+${extra} more like it)`;
  }
  return { key: "taste", label: "Taste", value, weight: WEIGHTS.taste, reason, tone: toneOf(value) };
}

// ---------- the blend ----------
export type Scored = {
  state: "scored" | "unknown" | "watched";
  /** null when watched (nothing to recommend) or when there is no signal at all. */
  score: number | null;
  tier: Tier;
  /** Most influential first. Empty when watched. */
  factors: Factor[];
  status: LibraryEntry["status"] | null;
  rating: number | null;
};

export function scoreMovie(f: MovieFeatures, lib: Library, now: Date): Scored {
  const entry = lib[String(f.movieId)] ?? null;
  const base = { status: entry?.status ?? null, rating: entry?.rating ?? null };
  if (entry?.status === "watched") return { ...base, state: "watched", score: null, tier: TIERS.watched, factors: [] };

  const blended = [seasonFactor(f, now), tasteFactor(f, lib), qualityFactor(f)].filter((x): x is Factor => !!x);
  const planned = entry?.status === "planned";
  if (!blended.length && !planned) return { ...base, state: "unknown", score: null, tier: TIERS.unknown, factors: [] };

  const totalWeight = blended.reduce((s, x) => s + x.weight, 0);
  // With no other signal, a planned movie starts from a neutral 50.
  const blend = totalWeight ? (100 * blended.reduce((s, x) => s + x.weight * x.value, 0)) / totalWeight : 50;
  const score = Math.round(Math.min(100, blend + (planned ? PLANNED_BONUS : 0)));

  const factors = [...blended];
  // Order by how far each signal pulls the score away from "meh" (0.5), in either direction.
  factors.sort((a, b) => b.weight * Math.abs(b.value - 0.5) - a.weight * Math.abs(a.value - 0.5));
  if (planned) factors.unshift({ key: "planned", label: "Plan", value: 1, weight: 0, reason: "On your plan-to-watch list (+10)", tone: "good" });
  return { ...base, state: "scored", score, tier: tierFor(score), factors };
}
