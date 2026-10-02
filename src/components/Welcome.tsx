"use client";

import { useMemo } from "react";
import { useLibrary } from "@/lib/library";
import { FACTOR_ORDER, scoreMovie, TIER_CUTOFFS, TIERS, WEIGHTS, type FactorKey } from "@/lib/score";
import type { Starter } from "@/lib/types";

/** Faint, static picture of a mesh behind the hero. Purely decorative. */
function MeshBackdrop() {
  const nodes = [
    [90, 70, "#2FA66A"], [250, 150, "#8CBF3F"], [160, 270, "#E3A008"], [400, 60, "#8089A3"],
    [470, 220, "#2FA66A"], [330, 330, "#8CBF3F"], [600, 120, "#E3A008"], [640, 300, "#2FA66A"],
  ] as const;
  const links = [[0, 1], [1, 2], [1, 3], [1, 5], [3, 4], [4, 5], [4, 6], [6, 7], [4, 7]];
  return (
    <svg aria-hidden viewBox="0 0 720 400" preserveAspectRatio="xMaxYMid slice" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.55]">
      {links.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="var(--line-strong)" strokeWidth="1.5" />
      ))}
      {nodes.map(([x, y, c], i) => (
        <g key={i}>
          <rect x={x - 34} y={y - 15} width="68" height="30" rx="8" fill="var(--surface)" stroke={c} strokeWidth="3" />
          <rect x={x - 26} y={y - 4} width="34" height="4" rx="2" fill="var(--line)" />
          <rect x={x - 26} y={y + 4} width="22" height="4" rx="2" fill="var(--line)" />
        </g>
      ))}
    </svg>
  );
}

type Explainer = { name: string; source: string; text: string };

/** Plain-English version of each indicator in lib/score.ts. The weights shown come from WEIGHTS, so they can't drift. */
const EXPLAIN: Record<FactorKey, Explainer> = {
  quality: {
    name: "Rating",
    source: "From the catalog",
    text: "The average MovieLens rating, nudged toward the middle for movies with only a few votes so one fan can't top the chart. 2.5 stars earns nothing, 4.5 stars earns full marks.",
  },
  streak: {
    name: "Streak",
    source: "From your list",
    text: "Rewards picks that keep a run going: three movies of one genre in a row, or two with the same actor (actors need TMDB). A pick that breaks your streak scores lower. No streak, no points either way.",
  },
  season: {
    name: "Season",
    source: "From the calendar",
    text: "Some movies belong to a time of year. A pick scores full marks in its peak month and fades as that month gets further away. Movies with no seasonal pattern skip this.",
  },
  vibe: {
    name: "Vibe",
    source: "From your ratings",
    text: "Compares what people tag a movie with the movies you've rated. Feeling like something you loved helps; feeling like something you disliked hurts. A three-star rating says nothing either way.",
  },
  genre: {
    name: "Genre",
    source: "From your ratings",
    text: "How you've felt about movies in the same genres. It needs a few watches before it means much, so one rating barely moves it.",
  },
  era: {
    name: "Era",
    source: "From your ratings",
    text: "How you've felt about movies from the same decade, with the same few-watches caution as genre.",
  },
  history: {
    name: "You",
    source: "From your ratings",
    text: "Only for movies you've already watched: your own star rating decides whether it's worth a rewatch. One star earns nothing, five stars earns full marks.",
  },
};

const MAX_WEIGHT = Math.max(...Object.values(WEIGHTS));
const TIER_ROWS = [
  { tier: TIERS.now, range: `${TIER_CUTOFFS.now}+` },
  { tier: TIERS.good, range: `${TIER_CUTOFFS.good}-${TIER_CUTOFFS.now - 1}` },
  { tier: TIERS.maybe, range: `${TIER_CUTOFFS.maybe}-${TIER_CUTOFFS.good - 1}` },
  { tier: TIERS.low, range: `under ${TIER_CUTOFFS.maybe}` },
];

/** How the watch score is built, one card per ingredient. */
function HowItWorks() {
  return (
    <section id="how-scoring-works" aria-labelledby="how-h" className="mt-16 scroll-mt-6">
      <h3 id="how-h" className="font-display text-2xl font-semibold tracking-tight">
        How the watch score works
      </h3>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Every movie gets a score out of 100 from up to seven signals. A signal that doesn&apos;t apply to a movie is skipped and
        the rest are scaled up to fill the 100, so missing data is never held against it. Pick a movie to see its own breakdown.
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {FACTOR_ORDER.map((key) => {
          const e = EXPLAIN[key];
          return (
            <li
              key={key}
              className={`rounded-xl border border-line bg-surface/90 p-4 backdrop-blur ${key === "history" ? "sm:col-span-2" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="font-display text-base font-semibold">{e.name}</h4>
                <span className="text-[11px] uppercase tracking-wide text-muted">{e.source}</span>
              </div>
              <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-ink/70" style={{ width: `${(WEIGHTS[key] / MAX_WEIGHT) * 100}%` }} />
              </span>
              <p className="mt-1 text-xs text-muted">Weight {WEIGHTS[key]}</p>
              <p className="mt-2 text-sm leading-relaxed">{e.text}</p>
            </li>
          );
        })}
      </ul>

      <h4 className="mt-8 text-sm font-medium">The colour around each movie</h4>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {TIER_ROWS.map(({ tier, range }) => (
          <li key={tier.id} className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: tier.color }} />
            <span className="font-medium">{tier.label}</span>
            <span className="text-muted">{range}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The empty state: a short pitch plus a few starting points, ranked by how good a pick each is right now. */
export function Welcome({ starters, now, onPick }: { starters: Starter[]; now: Date; onPick: (id: number) => void }) {
  const lib = useLibrary();
  const ranked = useMemo(
    () =>
      starters
        .map((s) => ({ s, scored: scoreMovie(s, lib, now) }))
        .sort((a, b) => (b.scored.score ?? -1) - (a.scored.score ?? -1)),
    [starters, lib, now],
  );

  return (
    <div className="hero-bg relative h-full overflow-y-auto">
      <MeshBackdrop />
      <div className="relative mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-12">
        <h2 className="rise font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl" style={{ animationDelay: "60ms" }}>
          Find your next watch,
          <br />
          one connection at a time.
        </h2>
        <p className="rise mt-4 max-w-md text-muted" style={{ animationDelay: "120ms" }}>
          Search any movie above, or start from one below. Every node links to similar films, and the rim colour tells you how good a pick it is right now.
        </p>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {ranked.map(({ s, scored }, i) => (
            <li key={s.id} className="rise" style={{ animationDelay: `${180 + i * 50}ms` }}>
              <button
                type="button"
                onClick={() => onPick(s.id)}
                className="group flex w-full items-center gap-3 rounded-xl bg-surface/90 p-3 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ border: `2px ${scored.tier.dashed ? "dashed" : "solid"} ${scored.tier.color}` }}
              >
                <span
                  aria-hidden
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg font-display text-lg font-semibold"
                  style={{ background: `color-mix(in srgb, ${scored.tier.color} 22%, var(--surface))` }}
                >
                  {s.title.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.title}</span>
                  <span className="block text-xs text-muted" suppressHydrationWarning>
                    {s.year} · {scored.tier.label}
                  </span>
                </span>
                {scored.score !== null && (
                  <span className="font-display text-xl font-semibold tabular-nums" style={{ color: scored.tier.color }} suppressHydrationWarning>
                    {scored.score}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <p className="rise mt-6 text-sm" style={{ animationDelay: "480ms" }}>
          <a href="#how-scoring-works" className="text-muted underline underline-offset-4 hover:text-ink">
            See how the score works ↓
          </a>
        </p>

        <HowItWorks />
      </div>
    </div>
  );
}
