// Pure helpers, safe to import from both server and client code.

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTH_SHORT = MONTHS.map((m) => m.slice(0, 3));

// One colour per month. These colours are the one loud thing in the UI:
// every movie is rimmed with the colour of the month it is best watched in.
export const MONTH_COLORS = [
  "#4F86D6", // Jan  frost
  "#4F86D6", // Feb  frost
  "#3E9E6E", // Mar  spring
  "#3E9E6E", // Apr  spring
  "#3E9E6E", // May  spring
  "#E3A008", // Jun  sun
  "#E3A008", // Jul  sun
  "#E3A008", // Aug  sun
  "#B8643B", // Sep  rust
  "#E2681F", // Oct  ember
  "#8A6A9E", // Nov  dusk
  "#C23B4E", // Dec  holiday
];
export const NEUTRAL = "#8089A3";

export const monthColor = (m: number | null) => (m === null ? NEUTRAL : MONTH_COLORS[m]);

/** Months from now until the next time `peak` comes round (0 = this month). */
export const monthsUntil = (peak: number, now = new Date()) => (peak - now.getMonth() + 12) % 12;

export function seasonStatus(peak: number | null, now = new Date()) {
  if (peak === null) return { label: "Any time works", tone: "any" as const };
  const d = monthsUntil(peak, now);
  if (d === 0) return { label: "In season now", tone: "now" as const };
  if (d === 1) return { label: "In season next month", tone: "soon" as const };
  if (d === 2) return { label: "In season in 2 months", tone: "soon" as const };
  return { label: `Best in ${MONTHS[peak]}`, tone: "later" as const };
}
