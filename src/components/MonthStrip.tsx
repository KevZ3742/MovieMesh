import { MONTHS, MONTH_COLORS, MONTH_SHORT } from "@/lib/seasons";

/**
 * Twelve cells, one per month. With `peak`, only that month is filled in its colour.
 * With `all`, every month shows its colour (used as the legend). A dot marks the current month.
 */
export function MonthStrip({ peak = null, all = false, now }: { peak?: number | null; all?: boolean; now?: Date }) {
  const current = now?.getMonth();
  const label = all
    ? "Colour for each month of the year"
    : peak === null
      ? "No seasonal peak"
      : `Best in ${MONTHS[peak]}`;
  return (
    <div role="img" aria-label={label} className="grid grid-cols-12 gap-[3px]">
      {MONTHS.map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div
            className="h-5 w-full rounded-[3px]"
            style={{ background: all || i === peak ? MONTH_COLORS[i] : "var(--line)" }}
          />
          <span className="text-[10px] leading-none text-muted">{MONTH_SHORT[i][0]}</span>
          <span className={`h-1 w-1 rounded-full ${current === i ? "bg-ink" : ""}`} />
        </div>
      ))}
    </div>
  );
}
