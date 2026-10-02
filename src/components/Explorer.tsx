/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { imageUrl } from "@/lib/images";
import { useLibrary } from "@/lib/library";
import { featuresOf, scoreMovie } from "@/lib/score";
import { MONTHS } from "@/lib/seasons";
import type { MeshMovieData, MeshNodeData, MeshPersonData, MovieDetail, Starter, TmdbStatus } from "@/lib/types";
import { GradeLegend } from "./GradeLegend";
import { LibraryPanel } from "./LibraryPanel";
import { MeshCanvas, type Focus } from "./MeshCanvas";
import { MoviePanel } from "./MoviePanel";
import { SearchBox } from "./SearchBox";

type Selection =
  | { kind: "movie"; id: number; detail: MovieDetail | null; via: string | null; error?: string }
  | { kind: "person"; data: MeshPersonData }
  | null;

const rootFrom = (d: MovieDetail): MeshMovieData => ({
  ...featuresOf(d.movie, d.when, d.tmdb?.cast),
  kind: "movie",
  tmdbId: d.movie.tmdbId,
  posterPath: d.tmdb?.posterPath ?? null,
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
  const [focus, setFocus] = useState<Focus | null>(null);
  const focusNonce = useRef(0);
  const [view, setView] = useState<"details" | "list">("details");
  const [notice, setNotice] = useState<string | null>(null);
  const [tmdb, setTmdb] = useState<TmdbStatus | null>(null);
  const now = useMemo(() => new Date(), []);
  const lib = useLibrary();
  const entries = Object.values(lib);
  const watchedCount = entries.filter((e) => e.status === "watched").length;
  const plannedCount = entries.length - watchedCount;
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
      setView("details");
      setFocus(null); // a fresh mesh must not replay an old "reveal this movie" request
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

  /** From My list: zoom to the movie if it's on the mesh, otherwise add it (linked if it relates to anything). */
  const openFromList = useCallback(
    async (id: number) => {
      if (!root) return choose(id);
      setNotice(null);
      setView("details");
      try {
        const d = await loadDetail(id);
        setFocus({
          data: { ...rootFrom(d), via: "From your list" },
          castIds: d.tmdb?.cast.map((c) => c.id) ?? [],
          nonce: ++focusNonce.current,
        });
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Couldn't load that movie.");
      }
    },
    [choose, loadDetail, root],
  );

  const onSelect = useCallback(
    async (data: MeshNodeData) => {
      setView("details");
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
        <div className="ml-auto flex items-center gap-4">
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView((v) => (v === "list" ? "details" : "list"))}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              view === "list" ? "border-ink bg-ink text-surface" : "border-line hover:border-line-strong"
            }`}
          >
            My list
            <span className="ml-1.5 opacity-70" suppressHydrationWarning>
              {watchedCount}✓ · {plannedCount}+
            </span>
          </button>
          <p className="text-sm text-muted" suppressHydrationWarning>
            It&apos;s {MONTHS[now.getMonth()]}
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label="Movie mesh" className="relative h-[62dvh] border-b border-line lg:h-auto lg:border-b-0 lg:border-r">
          {root ? (
            <MeshCanvas key={root.movieId} root={root} focus={focus} onSelect={onSelect} onTmdb={setTmdb} onError={setNotice} />
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
                          style={{ background: scoreMovie(s, lib, now).tier.color }}
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

          {root && <GradeLegend />}
        </section>

        <aside aria-label={view === "list" ? "My list" : "Details"} className="overflow-y-auto bg-surface p-5 lg:min-h-0">
          {view === "list" && <LibraryPanel onOpen={(id) => void openFromList(id)} />}
          {view === "details" && (
            <>
          {selection?.kind === "movie" && selection.detail && (
            <MoviePanel key={selection.id} detail={selection.detail} now={now} via={selection.via} showTmdbNote={false} />
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
              Select a movie in the mesh to see its watch score and why, what people tag it, and who&apos;s in it.
            </p>
          )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
