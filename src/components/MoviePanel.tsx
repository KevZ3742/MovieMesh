/* eslint-disable @next/next/no-img-element */
import { imageUrl } from "@/lib/images";
import { monthColor, seasonStatus } from "@/lib/seasons";
import type { MovieDetail } from "@/lib/types";
import { MonthStrip } from "./MonthStrip";

const chip = "rounded-full border border-line px-2.5 py-0.5 text-xs text-ink";

function runtime(min: number | null) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}

/** Everything we know about one movie. Pure (no hooks), so it renders on the server and the client. */
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
  const status = seasonStatus(when.peakMonth, now);
  const color = monthColor(when.peakMonth);
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

      <section aria-labelledby="when-h">
        <h3 id="when-h" className="font-display text-base font-semibold">When to watch</h3>
        <p className="mt-2 flex items-center gap-2 font-display text-xl">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: color }} />
          {status.label}
        </p>
        <div className="mt-3">
          <MonthStrip peak={when.peakMonth} now={now} />
        </div>
        <p className="mt-3 text-sm text-muted">
          {when.reason}
          {when.strength === "mild" && " This is a weak, genre-level pattern."}
        </p>
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
