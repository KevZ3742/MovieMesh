import { valueColor, type Factor } from "@/lib/score";

const W = 340;
const H = 280;
const CX = W / 2;
const CY = 140;
const R = 88; // radius of the outer ring (value = 1)
const RINGS = [0.25, 0.5, 0.75, 1];

const at = (i: number, n: number, r: number) => {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n; // first axis points straight up, then clockwise
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a), cos: Math.cos(a), sin: Math.sin(a) };
};

/**
 * Spider graph of the indicators. Each spoke is one indicator, farther out = better for this movie.
 * Indicators that don't apply sit on the halfway ring, dimmed, and don't count toward the score.
 */
export function ScoreRadar({ factors, color }: { factors: Factor[]; color: string }) {
  const n = factors.length;
  const shape = factors.map((f, i) => at(i, n, R * (f.value ?? 0.5)));
  const label = factors
    .map((f) => (f.value === null ? `${f.label}: not applicable` : `${f.label}: ${Math.round(f.value * 100)} out of 100`))
    .join(", ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Spider graph. ${label}`} className="mx-auto w-full max-w-[340px]">
      {RINGS.map((r) => (
        <polygon
          key={r}
          points={factors.map((_, i) => { const p = at(i, n, R * r); return `${p.x},${p.y}`; }).join(" ")}
          fill="none"
          stroke="var(--line)"
          strokeWidth={r === 1 ? 1.5 : 1}
        />
      ))}
      {factors.map((_, i) => {
        const p = at(i, n, R);
        return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="var(--line)" />;
      })}
      <polygon
        points={shape.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={color}
        fillOpacity={0.22}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {factors.map((f, i) =>
        f.value === null ? (
          <circle key={f.key} cx={shape[i].x} cy={shape[i].y} r={3} fill="var(--surface)" stroke="var(--line-strong)" strokeWidth={1.5} />
        ) : (
          <circle key={f.key} cx={shape[i].x} cy={shape[i].y} r={4} fill={valueColor(f.value)} stroke="var(--surface)" strokeWidth={1.5} />
        ),
      )}
      {factors.map((f, i) => {
        const p = at(i, n, R + 14);
        const anchor = Math.abs(p.cos) < 0.3 ? "middle" : p.cos > 0 ? "start" : "end";
        const dy = p.sin < -0.5 ? 0 : p.sin > 0.5 ? 10 : 4;
        return (
          <text
            key={f.key}
            x={p.x}
            y={p.y + dy}
            textAnchor={anchor}
            fontSize={12}
            fontWeight={500}
            fill={f.value === null ? "var(--muted)" : "var(--ink)"}
            opacity={f.value === null ? 0.6 : 1}
          >
            {f.label}
            {f.value !== null && <tspan fill="var(--muted)" fontWeight={400}>{` ${f.points}`}</tspan>}
          </text>
        );
      })}
    </svg>
  );
}
