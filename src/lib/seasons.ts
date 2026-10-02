// Pure helpers, safe to import from both server and client code.
// (Colour now comes from the watch score in score.ts, not from the month.)

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTH_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** Months from now until the next time `peak` comes round (0 = this month). */
export const monthsUntil = (peak: number, now = new Date()) => (peak - now.getMonth() + 12) % 12;
