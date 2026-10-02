"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLibrary } from "@/lib/library";
import { saveTmdbPref } from "@/lib/prefs";
import { featuresOf } from "@/lib/score";
import type { MeshMovieData, MeshNodeData, MovieDetail, Starter, TmdbStatus } from "@/lib/types";
import { GradeLegend } from "./GradeLegend";
import { LibraryPanel } from "./LibraryPanel";
import { MeshCanvas, type Focus } from "./MeshCanvas";
import { MoviePanel } from "./MoviePanel";
import { SearchBox } from "./SearchBox";
import { SettingsDialog } from "./SettingsDialog";
import { Welcome } from "./Welcome";

type Selection =
  | { kind: "movie"; id: number; detail: MovieDetail | null; via: string | null; error?: string }
  | null;

const rootFrom = (d: MovieDetail): MeshMovieData => ({
  ...featuresOf(d.movie, d.when, d.tmdb?.cast),
  kind: "movie",
  tmdbId: d.movie.tmdbId,
  posterPath: d.tmdb?.posterPath ?? null,
  via: null,
});

async function fetchDetail(id: number, useTmdb: boolean): Promise<MovieDetail> {
  const res = await fetch(`/api/movie/${id}${useTmdb ? "" : "?tmdb=0"}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Couldn't load that movie.");
  return body as MovieDetail;
}

export function Explorer({
  starters,
  initial,
  initialAvailable,
  initialUseTmdb,
}: {
  starters: Starter[];
  initial: MovieDetail | null;
  /** Whether the server has a usable TMDB key (from Settings or .env.local). */
  initialAvailable: boolean;
  initialUseTmdb: boolean;
}) {
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
  const [tmdbAvailable, setTmdbAvailable] = useState(initialAvailable);
  const [useTmdb, setUseTmdb] = useState(initialUseTmdb);
  const [meshEpoch, setMeshEpoch] = useState(0); // bump to throw the mesh away and rebuild it
  const [confirmClear, setConfirmClear] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const tmdbOn = tmdbAvailable && useTmdb;
  const now = useMemo(() => new Date(), []);
  const lib = useLibrary();
  const entries = Object.values(lib);
  const watchedCount = entries.filter((e) => e.status === "watched").length;
  const plannedCount = entries.length - watchedCount;
  const cache = useRef(new Map<number, MovieDetail>(initial ? [[initial.movie.id, initial]] : []));

  const loadDetail = useCallback(async (id: number) => {
    const hit = cache.current.get(id);
    if (hit) return hit;
    const d = await fetchDetail(id, tmdbOn);
    cache.current.set(id, d);
    return d;
  }, [tmdbOn]);

  // "Clear" asks twice so one stray click can't throw away a mesh you've built up.
  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  /** Back to the start screen: no mesh, no selection, clean URL. Also what the logo does. */
  const clearMesh = useCallback(() => {
    setRoot(null);
    setSelection(null);
    setFocus(null);
    setNotice(null);
    setTmdb(null);
    setView("details");
    setConfirmClear(false);
    window.history.replaceState(null, "", "/");
  }, []);

  /**
   * Apply a TMDB change (switch flipped, key saved or removed). Posters are baked into
   * the nodes, so the mesh restarts from its first movie.
   */
  const applyTmdb = useCallback(
    async (available: boolean, pref: boolean) => {
      setTmdbAvailable(available);
      setUseTmdb(pref);
      saveTmdbPref(pref);
      setNotice(null);
      cache.current.clear();
      if (!root) return;
      try {
        const d = await fetchDetail(root.movieId, available && pref);
        cache.current.set(root.movieId, d);
        setFocus(null);
        setTmdb(null);
        setRoot(rootFrom(d));
        setSelection({ kind: "movie", id: d.movie.id, detail: d, via: null });
        setMeshEpoch((n) => n + 1);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Couldn't restart the mesh.");
      }
    },
    [root],
  );

  const choose = useCallback(
    async (id: number) => {
      setNotice(null);
      setView("details");
      setPanelOpen(true);
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
      setPanelOpen(true); // picking a node means you want its details
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

  // The side panel only exists when there's something to put in it: a mesh to inspect, or My list.
  // Starting out, it stays out of the way so the home screen gets the full width.
  const panelVisible = panelOpen && (!!root || view === "list");
  const toggleList = () => {
    if (view === "list" && panelVisible) setView("details");
    else {
      setView("list");
      setPanelOpen(true);
    }
  };

  const needsKey = tmdb === "disabled" || (!tmdbAvailable && !!root);
  const tmdbNote =
    needsKey
      ? "Add a TMDB key to see posters in the mesh."
      : tmdb === "unavailable"
        ? "TMDB didn't respond, so posters are hidden for now."
        : null;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 md:grid-cols-[1fr_minmax(0,36rem)_1fr]">
        <h1 className="font-display text-xl font-semibold">
          <Link
            href="/"
            aria-label="MovieMesh home"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let "open in new tab" work
              e.preventDefault();
              clearMesh();
            }}
            className="rounded-sm"
          >
            MovieMesh
          </Link>
        </h1>
        <div className="order-3 col-span-2 flex justify-center md:order-none md:col-span-1">
          <SearchBox onChoose={choose} />
        </div>
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          {root && (
            <button
              type="button"
              onClick={() => (confirmClear ? clearMesh() : setConfirmClear(true))}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                confirmClear ? "border-[#D0594A] bg-[#D0594A] text-white" : "border-line hover:border-line-strong"
              }`}
            >
              {confirmClear ? "Click to confirm" : "Clear mesh"}
            </button>
          )}
          <button
            type="button"
            aria-pressed={view === "list" && panelVisible}
            onClick={toggleList}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              view === "list" && panelVisible ? "border-ink bg-ink text-surface" : "border-line hover:border-line-strong"
            }`}
          >
            My list
            <span className="ml-1.5 opacity-70" suppressHydrationWarning>
              {watchedCount}✓ · {plannedCount}+
            </span>
          </button>
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-full border border-line hover:border-line-strong"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </button>
        </div>
      </header>

      <div
        className={`flex flex-1 flex-col lg:grid lg:min-h-0 ${
          panelVisible ? "lg:grid-cols-[minmax(0,1fr)_400px]" : "lg:grid-cols-1"
        }`}
      >
        <section
          aria-label="Movie mesh"
          className={`relative border-line ${
            panelVisible ? "h-[62dvh] border-b lg:h-auto lg:border-b-0 lg:border-r" : "min-h-[70dvh] flex-1 lg:min-h-0"
          }`}
        >
          {root ? (
            <MeshCanvas
              key={`${root.movieId}:${meshEpoch}`}
              root={root}
              focus={focus}
              onSelect={onSelect}
              onTmdb={setTmdb}
              onError={setNotice}
              useTmdb={tmdbOn}
            />
          ) : (
            <Welcome starters={starters} now={now} onPick={(id) => void choose(id)} />
          )}

          <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-sm flex-col gap-2" role="status">
            {notice && (
              <p className="pointer-events-auto rounded-md border border-line bg-surface px-3 py-2 text-sm shadow">{notice}</p>
            )}
            {!notice && tmdbNote && (
              <p className="pointer-events-auto rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted shadow">
                {tmdbNote}
                {needsKey && (
                  <>
                    {" "}
                    <button type="button" onClick={() => setSettingsOpen(true)} className="font-medium text-ink underline underline-offset-4">
                      Open settings
                    </button>
                  </>
                )}
              </p>
            )}
          </div>

          {root && !panelVisible && (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="absolute right-3 top-3 z-10 rounded-full border border-line bg-surface px-3 py-1.5 text-sm shadow-sm hover:border-line-strong"
            >
              ◂ Show panel
            </button>
          )}

          {root && <GradeLegend />}
        </section>

        {panelVisible && (
        <aside aria-label={view === "list" ? "My list" : "Details"} className="overflow-y-auto bg-surface p-5 lg:min-h-0">
          <div className="-mt-1 mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-line-strong hover:text-ink"
            >
              Hide panel ▸
            </button>
          </div>
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
          {!selection && (
            <p className="max-w-prose text-sm text-muted">
              Select a movie in the mesh to see its watch score and why, what people tag it, and who&apos;s in it.
            </p>
          )}
            </>
          )}
        </aside>
        )}
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tmdbOn={tmdbOn}
        tmdbPref={useTmdb}
        onTogglePref={(on) => void applyTmdb(tmdbAvailable, on)}
        onKeyChanged={(available) => void applyTmdb(available, available ? true : useTmdb)}
      />
    </div>
  );
}
