"use client";

import { useEffect, useId, useState } from "react";
import type { SearchHit } from "@/lib/types";

export function SearchBox({ onChoose }: { onChoose: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  const searching = q.trim().length >= 2;

  useEffect(() => {
    if (!searching) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Search failed");
        setResults(body.results);
        setError(null);
        setActive(0);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, searching]);

  const shown = searching ? results : [];

  const choose = (hit: SearchHit) => {
    setQ("");
    setOpen(false);
    onChoose(hit.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      choose(shown[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative w-full max-w-xl">
      <input
        type="search"
        role="combobox"
        aria-label="Search for a movie"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Search for a movie"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-line bg-ground px-3.5 py-2 text-sm placeholder:text-muted"
      />
      {open && searching && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {error && <li className="px-3.5 py-2 text-sm text-muted">{error}</li>}
          {!error && shown.length === 0 && <li className="px-3.5 py-2 text-sm text-muted">No movies match &ldquo;{q}&rdquo;.</li>}
          {shown.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3.5 py-2 ${i === active ? "bg-ground" : ""}`}
            >
              <span className="text-sm font-medium">{r.title}</span>
              {r.year && <span className="ml-2 text-sm text-muted">{r.year}</span>}
              {r.genres.length > 0 && <span className="block text-xs text-muted">{r.genres.slice(0, 3).join(", ")}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
