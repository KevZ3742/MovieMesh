/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { imageUrl } from "@/lib/images";
import { MONTHS, monthColor } from "@/lib/seasons";
import type { MeshMovieData, MeshNodeData, MeshPersonData, MovieDetail, TmdbStatus } from "@/lib/types";
import { MeshCanvas } from "./MeshCanvas";
import { MonthStrip } from "./MonthStrip";
import { MoviePanel } from "./MoviePanel";
import { SearchBox } from "./SearchBox";

type Starter = { id: number; title: string; year: number; peakMonth: number | null; weak: boolean };
type Selection =
  | { kind: "movie"; id: number; detail: MovieDetail | null; via: string | null; error?: string }
  | { kind: "person"; data: MeshPersonData }
  | null;

const rootFrom = (d: MovieDetail): MeshMovieData => ({
  kind: "movie",
  movieId: d.movie.id,
  title: d.movie.title,
  year: d.movie.year,
  tmdbId: d.movie.tmdbId,
  posterPath: d.tmdb?.posterPath ?? null,
  peakMonth: d.when.peakMonth,
  weak: d.when.strength === "mild",
  via: null,
});

async function fetchDetail(id: number): Promise<MovieDetail> {
  const res = await fetch(`/api/movie/${id}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Couldn't load that movie.");
  return body as MovieDetail;
}

export function Explorer({ starters, initial }: { starters: Starter[]; initial: MovieDetail | null }) {
  // `initial` is loaded on the server when the URL has ?m=<id>, so the first paint already has the mesh root.
  const [root, setRoot] = useState<MeshMovieData | null>(() => (initial ? rootFrom(initial) : null));
  const [selection, setSelection] = useState<Selection>(() =>
    initial ? { kind: "movie", id: initial.movie.id, detail: initial, via: null } : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [tmdb, setTmdb] = useState<TmdbStatus | null>(null);
  const now = useMemo(() => new Date(), []);
  const cache = useRef(new Map<number, MovieDetail>(initial ? [[initial.movie.id, initial]] : []));

  const loadDetail = useCallback(async (id: number) => {
    const hit = cache.current.get(id);
    if (hit) return hit;
    const d = await fetchDetail(id);
    cache.current.set(id, d);
    return d;
  }, []);

  const choose = useCallback(
    async (id: number) => {
      setNotice(null);
      try {
        const d = await loadDetail(id);
        setSelection({ kind: "movie", id, detail: d, via: null });
        setRoot(rootFrom(d));
        window.history.replaceState(null, "", `/?m=${id}`);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Couldn't load that movie.");
      }
    },
    [loadDetail],
  );

  const onSelect = useCallback(
    async (data: MeshNodeData) => {
      if (data.kind === "person") {
        setSelection({ kind: "person", data });
        return;
      }
      const id = data.movieId;
      setSelection({ kind: "movie", id, detail: cache.current.get(id) ?? null, via: data.via });
      try {
        const d = await loadDetail(id);
        setSelection((s) => (s?.kind === "movie" && s.id === id ? { ...s, detail: d } : s));
      } catch (e) {
        const error = e instanceof Error ? e.message : "Couldn't load that movie.";
        setSelection((s) => (s?.kind === "movie" && s.id === id ? { ...s, error } : s));
      }
    },
    [loadDetail],
  );

  const tmdbNote =
    tmdb === "disabled"
      ? "Add a TMDB key to see posters and actors in the mesh. See the README."
      : tmdb === "unavailable"
        ? "TMDB didn't respond, so posters and actors are hidden for now."
        : null;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface px-4 py-3">
        <h1 className="font-display text-xl font-semibold">MovieMesh</h1>
        <SearchBox onChoose={choose} />
        <p className="ml-auto flex items-center gap-2 text-sm text-muted" suppressHydrationWarning>
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: monthColor(now.getMonth()) }} />
          It&apos;s {MONTHS[now.getMonth()]}
        </p>
      </header>

      <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label="Movie mesh" className="relative h-[62dvh] border-b border-line lg:h-auto lg:border-b-0 lg:border-r">
          {root ? (
            <MeshCanvas key={root.movieId} root={root} onSelect={onSelect} onTmdb={setTmdb} onError={setNotice} />
          ) : (
            <div className="grid h-full place-items-center p-6">
              <div className="max-w-md">
                <h2 className="font-display text-3xl font-semibold leading-tight">Pick a movie to start your mesh</h2>
                <p className="mt-3 text-muted">
                  Each movie links to similar ones. Click any node to grow the mesh from it.
                </p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {starters.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => void choose(s.id)}
                        className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-line-strong"
                      >
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 rounded-full"
                          style={
                            s.weak
                              ? { border: `2px solid ${monthColor(s.peakMonth)}` }
                              : { background: monthColor(s.peakMonth) }
                          }
                        />
                        {s.title} ({s.year})
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-sm flex-col gap-2" role="status">
            {notice && (
              <p className="pointer-events-auto rounded-md border border-line bg-surface px-3 py-2 text-sm shadow">{notice}</p>
            )}
            {!notice && tmdbNote && (
              <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted shadow">{tmdbNote}</p>
            )}
          </div>

          {root && (
            <div className="pointer-events-none absolute bottom-3 left-14 z-10 hidden w-60 rounded-md border border-line bg-surface/95 p-3 sm:block">
              <MonthStrip all now={now} />
              <p className="mt-2 text-xs text-muted">
                A node&apos;s rim shows the month it&apos;s best watched. Grey means no seasonal pattern, and a dashed
                rim is only a weak genre-level guess.
              </p>
            </div>
          )}
        </section>

        <aside aria-label="Details" className="overflow-y-auto bg-surface p-5 lg:min-h-0">
          {selection?.kind === "movie" && selection.detail && (
            <MoviePanel detail={selection.detail} now={now} via={selection.via} showTmdbNote={false} />
          )}
          {selection?.kind === "movie" && !selection.detail && !selection.error && (
            <p className="text-sm text-muted">Loading movie...</p>
          )}
          {selection?.kind === "movie" && selection.error && <p className="text-sm">{selection.error}</p>}
          {selection?.kind === "person" && (
            <div className="flex items-center gap-4">
              {imageUrl(selection.data.profilePath, "w185") ? (
                <img src={imageUrl(selection.data.profilePath, "w185")!} alt="" className="h-24 w-24 rounded-full object-cover" />
              ) : (
                <div aria-hidden className="grid h-24 w-24 place-items-center rounded-full bg-ground font-display text-3xl">
                  {selection.data.name.slice(0, 1)}
                </div>
              )}
              <div>
                <h2 className="font-display text-2xl font-semibold">{selection.data.name}</h2>
                {selection.data.character && <p className="text-sm text-muted">as {selection.data.character}</p>}
                {selection.data.via && <p className="mt-1 text-sm text-muted">{selection.data.via}</p>}
                <p className="mt-3 text-sm">Their other films in the catalog branch out from this node.</p>
              </div>
            </div>
          )}
          {!selection && (
            <p className="max-w-prose text-sm text-muted">
              Select a movie in the mesh to see when it&apos;s best to watch, what people tag it, and who&apos;s in it.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
