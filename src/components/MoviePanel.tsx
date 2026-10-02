/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo } from "react";
import { imageUrl } from "@/lib/images";
import { setRating, setStatus, useLibrary } from "@/lib/library";
import { featuresOf, scoreMovie, tierFor } from "@/lib/score";
import type { MovieDetail, WatchStatus } from "@/lib/types";

const chip = "rounded-full border border-line px-2.5 py-0.5 text-xs text-ink";
const toggle = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm ${on ? "border-ink bg-ink text-surface" : "border-line hover:border-line-strong"}`;

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
  const features = useMemo(() => featuresOf(movie, when), [movie, when]);
  const scored = useMemo(() => scoreMovie(features, lib, now), [features, lib, now]);
  const color = scored.tier.color;
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
        <p className="mt-2 flex items-center gap-2 font-display text-xl">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: color }} />
          {scored.tier.label}
          {scored.score !== null && <span className="text-sm text-muted">{scored.score}/100</span>}
        </p>
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
        {scored.factors.length > 0 && (
          <>
            <h4 className="mt-4 text-sm font-medium">Why</h4>
            <ul className="mt-2 space-y-2.5">
              {scored.factors.map((f) => (
                <li key={f.key} className="flex items-start gap-3 text-sm">
                  <span className="mt-1 flex w-14 shrink-0 flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{f.label}</span>
                    <span aria-hidden className="h-1.5 overflow-hidden rounded bg-line">
                      <span className="block h-full" style={{ width: `${Math.round(f.value * 100)}%`, background: tierFor(f.value * 100).color }} />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">{f.reason}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              A weighted blend of the signals above. Rating more movies sharpens the taste match.
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
