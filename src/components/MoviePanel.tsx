/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo } from "react";
import { imageUrl } from "@/lib/images";
import { setRating, setStatus, useLibrary } from "@/lib/library";
import { featuresOf, scoreMovie, SCALE_GRADIENT } from "@/lib/score";
import type { MovieDetail, WatchStatus } from "@/lib/types";
import { ScoreRadar } from "./ScoreRadar";

const chip = "rounded-full border border-line px-2.5 py-0.5 text-xs text-ink";
const toggle = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm ${on ? "border-ink bg-ink text-surface" : "border-line hover:border-line-strong"}`;

/** Bar that fills left to right; the gradient is pinned to the full track so the fill's end colour matches its value. */
function Fill({ value, tall }: { value: number; tall?: boolean }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <span aria-hidden className={`mt-1.5 block overflow-hidden rounded-full bg-line ${tall ? "h-3" : "h-2"}`}>
      <span
        className="block h-full rounded-full"
        style={{ width: `${v * 100}%`, backgroundImage: SCALE_GRADIENT, backgroundSize: `${100 / Math.max(v, 0.05)}% 100%` }}
      />
    </span>
  );
}

function runtime(min: number | null) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}

/** Everything we know about one movie, plus the watched/planned tracker and the watch score. */
export function MoviePanel({
  detail,
  now,
  via,
  showTmdbNote = true,
}: {
  detail: MovieDetail;
  now: Date;
  via?: string | null;
  /** The explorer already shows one TMDB notice over the canvas, so it turns this one off. */
  showTmdbNote?: boolean;
}) {
  const { movie, when, tmdb, tmdbStatus } = detail;
  const lib = useLibrary();
  const features = useMemo(() => featuresOf(movie, when, tmdb?.cast), [movie, when, tmdb]);
  const scored = useMemo(() => scoreMovie(features, lib, now), [features, lib, now]);
  const color = scored.tier.color;
  // Biggest contributors first; indicators that don't apply sink to the bottom.
  const ranked = useMemo(
    () => [...scored.factors].sort((a, b) => (b.value === null ? -1 : b.points) - (a.value === null ? -1 : a.points)),
    [scored.factors],
  );
  // The spider graph keeps its spokes fixed, except "You", which only exists for movies you've watched.
  const radarFactors = scored.factors.filter((f) => f.key !== "history" || f.value !== null);
  const entry = lib[String(movie.id)];
  const toggleStatus = (st: WatchStatus) => setStatus(features, entry?.status === st ? null : st);
  const poster = imageUrl(tmdb?.posterPath ?? null, "w342");
  const meta = [movie.year, runtime(tmdb?.runtime ?? null), movie.avgRating ? `${movie.avgRating.toFixed(1)} avg rating` : null]
    .filter(Boolean);

  return (
    <article className="flex flex-col gap-6">
      <header className="flex gap-4">
        {poster ? (
          <img src={poster} alt={`Poster for ${movie.title}`} className="h-36 w-24 shrink-0 rounded-md object-cover" />
        ) : (
          <div
            aria-hidden
            className="grid h-36 w-24 shrink-0 place-items-center rounded-md font-display text-3xl"
            style={{ background: `color-mix(in srgb, ${color} 25%, var(--surface))` }}
          >
            {movie.title.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold leading-tight">{movie.title}</h2>
          {movie.altTitle && <p className="mt-0.5 text-sm text-muted">{movie.altTitle}</p>}
          <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-muted">
            {meta.map((m) => (
              <span key={String(m)}>{m}</span>
            ))}
          </p>
          {tmdb?.tagline && <p className="mt-2 text-sm italic text-muted">{tmdb.tagline}</p>}
          {via && <p className="mt-2 text-sm text-muted">Linked by: {via}</p>}
        </div>
      </header>

      <section aria-label="Your list" className="-mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={entry?.status === "watched"} onClick={() => toggleStatus("watched")} className={toggle(entry?.status === "watched")}>
            {entry?.status === "watched" ? "✓ Watched" : "Mark as watched"}
          </button>
          <button type="button" aria-pressed={entry?.status === "planned"} onClick={() => toggleStatus("planned")} className={toggle(entry?.status === "planned")}>
            {entry?.status === "planned" ? "✓ On plan-to-watch list" : "+ Plan to watch"}
          </button>
        </div>
        {entry?.status === "watched" && (
          <div className="mt-3 flex items-center gap-1" role="group" aria-label="Your rating">
            <span className="mr-1 text-sm text-muted">Your rating (update it any time, even after a rewatch)</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                aria-pressed={entry.rating === n}
                onClick={() => setRating(features, n)}
                className={`text-xl leading-none ${entry.rating !== null && n <= entry.rating ? "text-ink" : "text-line-strong"}`}
              >
                ★
              </button>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="score-h">
        <h3 id="score-h" className="font-display text-base font-semibold">Watch score</h3>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="flex items-center gap-2 font-display text-xl">
            <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: color }} />
            {scored.tier.label}
          </p>
          {scored.score !== null && (
            <p className="font-display text-2xl font-semibold tabular-nums">
              {scored.score}
              <span className="text-sm font-normal text-muted"> / 100</span>
            </p>
          )}
        </div>
        {scored.score !== null && <Fill value={scored.score / 100} tall />}
        {scored.status === "watched" && (
          <p className="mt-2 text-sm text-muted">
            You&apos;ve watched this. The score shows how good a pick it is for a rewatch.
          </p>
        )}
        {scored.state === "unknown" && (
          <p className="mt-2 text-sm text-muted">
            Nothing to go on yet. Mark movies you&apos;ve watched and rate them, and this will start grading.
          </p>
        )}
        {scored.state === "scored" && (
          <>
            <div className="mt-4">
              <ScoreRadar factors={radarFactors} color={color} />
            </div>
            <h4 className="mt-2 text-sm font-medium">Where the points come from</h4>
            <ul className="mt-2 space-y-3">
              {ranked.map((f) => (
                <li key={f.key} className={f.value === null ? "opacity-60" : ""}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{f.label}</span>
                    {f.value === null ? (
                      <span className="text-xs text-muted">doesn&apos;t apply</span>
                    ) : (
                      <span className="font-display text-sm font-semibold tabular-nums">
                        {f.points}
                        <span className="font-normal text-muted"> / {f.max}</span>
                      </span>
                    )}
                  </div>
                  {f.value !== null && <Fill value={f.value} />}
                  <p className="mt-1 text-sm">{f.reason}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              The points add up to the score. Each bar fills from red to green by how good that signal looks, and the
              number is how many points it adds out of what it could. Rating counts most, then streaks and season.
            </p>
          </>
        )}
      </section>

      {tmdb?.overview && <p className="max-w-prose text-sm leading-relaxed">{tmdb.overview}</p>}
      {showTmdbNote && tmdbStatus === "disabled" && (
        <p className="text-sm text-muted">Posters, summaries and cast need a TMDB key. See the README.</p>
      )}
      {showTmdbNote && tmdbStatus === "unavailable" && (
        <p className="text-sm text-muted">TMDB didn&apos;t respond for this movie, so posters and cast are hidden for now.</p>
      )}

      {movie.genres.length > 0 && (
        <section aria-labelledby="genres-h">
          <h3 id="genres-h" className="font-display text-base font-semibold">Genres</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {movie.genres.map((g) => (
              <li key={g} className={chip}>{g}</li>
            ))}
          </ul>
        </section>
      )}

      {movie.tags.length > 0 && (
        <section aria-labelledby="tags-h">
          <h3 id="tags-h" className="font-display text-base font-semibold">What people tag it</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {movie.tags.slice(0, 12).map((t) => (
              <li key={t.tag} className={chip}>{t.tag}</li>
            ))}
          </ul>
        </section>
      )}

      {tmdb && tmdb.cast.length > 0 && (
        <section aria-labelledby="cast-h">
          <h3 id="cast-h" className="font-display text-base font-semibold">Cast</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {tmdb.cast.slice(0, 8).map((c) => (
              <li key={c.id}>
                {c.name}
                {c.character && <span className="text-muted"> as {c.character}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tmdb && (
        <p className="text-xs text-muted">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      )}
    </article>
  );
}
