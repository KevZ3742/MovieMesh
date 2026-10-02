import { MONTHS } from "./seasons";
import type { Movie, When } from "./types";

/**
 * "When should I watch this?"  v0.
 *
 * Priority:
 *  1. learned  - the movie passed the recurrence check in explore_ratings.py
 *                (peak month repeats across several different years)
 *  2. tags     - tagged/titled as a Christmas or Halloween movie
 *  3. genre    - horror leans October
 *  4. none     - no evidence of seasonality; we say so instead of guessing
 *
 * The multipliers in the reasons come from the ml-32m run of explore_ratings.py
 * (bulk days removed, ratings >= 2 years after release):
 *   Christmas movies: December share 2.25x   Halloween movies: October 1.70x
 *   Horror genre: October 1.35x
 */
export function computeWhen(m: Pick<Movie, "title" | "genres" | "tags" | "seasonal">): When {
  if (m.seasonal) {
    const { peakMonth, peakYears } = m.seasonal;
    return {
      peakMonth,
      source: "learned",
      strength: "strong",
      reason: `Ratings for this movie peak in ${MONTHS[peakMonth]}, in ${peakYears} different years.`,
    };
  }

  const text = [m.title, ...m.tags.map((t) => t.tag)].join(" ").toLowerCase();
  if (/\b(christmas|xmas)\b/.test(text)) {
    return {
      peakMonth: 11,
      source: "tags",
      strength: "strong",
      reason: "Christmas movies get about twice their usual share of ratings in December.",
    };
  }
  if (/\bhalloween\b/.test(text)) {
    return {
      peakMonth: 9,
      source: "tags",
      strength: "strong",
      reason: "Halloween movies get about 1.7 times their usual share of ratings in October.",
    };
  }
  if (m.genres.includes("Horror")) {
    return {
      peakMonth: 9,
      source: "genre",
      strength: "mild",
      reason: "Horror gets about 1.35 times its usual share of ratings in October.",
    };
  }
  return {
    peakMonth: null,
    source: "none",
    strength: "none",
    reason: "No seasonal pattern found for this movie. Timing by runtime and mood comes later.",
  };
}
