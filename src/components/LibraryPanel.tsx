"use client";

import { useState } from "react";
import { setRating, setStatus, useLibrary } from "@/lib/library";
import type { LibraryEntry, WatchStatus } from "@/lib/types";

const tab = (on: boolean) =>
  `flex-1 rounded-full border px-3 py-1.5 text-sm ${on ? "border-ink bg-ink text-surface" : "border-line hover:border-line-strong"}`;
const small = "rounded-full border border-line px-2.5 py-1 text-xs hover:border-line-strong";

const snap = (id: string, e: LibraryEntry) => ({
  movieId: Number(id),
  title: e.title,
  year: e.year,
  genres: e.genres,
  tags: e.tags,
});

const when = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Your watch history and plan-to-watch list. Only movies you marked yourself appear here. */
export function LibraryPanel({ onOpen }: { onOpen: (movieId: number) => void }) {
  const lib = useLibrary();
  const [which, setWhich] = useState<WatchStatus>("watched");
  const all = Object.entries(lib);
  const counts = {
    watched: all.filter(([, e]) => e.status === "watched").length,
    planned: all.filter(([, e]) => e.status === "planned").length,
  };
  const rows = all.filter(([, e]) => e.status === which).sort((a, b) => b[1].at - a[1].at);

  return (
    <section aria-label="My list" className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-semibold">My list</h2>
      <div className="flex gap-2" role="group" aria-label="List">
        <button type="button" aria-pressed={which === "watched"} onClick={() => setWhich("watched")} className={tab(which === "watched")} suppressHydrationWarning>
          Watched ({counts.watched})
        </button>
        <button type="button" aria-pressed={which === "planned"} onClick={() => setWhich("planned")} className={tab(which === "planned")} suppressHydrationWarning>
          Plan to watch ({counts.planned})
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          {which === "watched"
            ? "Nothing here yet. Open a movie and press Watched when you've seen it. Clicking nodes in the mesh doesn't count."
            : "Nothing planned yet. Open a movie and press Plan to watch."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(([id, e]) => (
            <li key={id} className="flex flex-col gap-2 py-3">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => onOpen(Number(id))} className="min-w-0 text-left">
                  <span className="block font-medium leading-tight underline-offset-4 hover:underline">{e.title}</span>
                  <span className="text-xs text-muted">
                    {e.year ?? ""}
                    {e.year ? " · " : ""}
                    {which === "watched" ? "watched" : "added"} {when(e.at)}
                  </span>
                </button>
                {which === "watched" && (
                  <span className="flex shrink-0 text-base leading-none" role="group" aria-label="Your rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                        aria-pressed={e.rating === n}
                        onClick={() => setRating(snap(id, e), n)}
                        className={e.rating !== null && n <= e.rating ? "text-ink" : "text-line-strong"}
                      >
                        ★
                      </button>
                    ))}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onOpen(Number(id))} className={small}>Open in mesh</button>
                {which === "planned" && (
                  <button type="button" onClick={() => setStatus(snap(id, e), "watched")} className={small}>Mark watched</button>
                )}
                {which === "watched" && (
                  <button type="button" onClick={() => setStatus(snap(id, e), "planned")} className={small}>Move to plan</button>
                )}
                <button type="button" onClick={() => setStatus(snap(id, e), null)} className={small}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
