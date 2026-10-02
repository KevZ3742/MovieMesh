"use client";
// Watched / plan-to-watch tracker. Lives in localStorage for now (no accounts needed);
// swap read()/write() for API calls later and nothing else has to change.

import { useSyncExternalStore } from "react";
import type { Library, LibraryEntry, MovieFeatures, WatchStatus } from "./types";

const KEY = "moviemesh:library:v1";
const EMPTY: Library = {}; // server snapshot: the server never sees localStorage

let cache: Library | null = null; // snapshots must be referentially stable between changes
const listeners = new Set<() => void>();

function read(): Library {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Library) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Library) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked: the change still works for this session
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null; // another tab changed it
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLibrary(): Library {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

type Snap = Pick<MovieFeatures, "movieId" | "title" | "year" | "genres" | "tags">;

const entryFor = (m: Snap, status: WatchStatus, rating: number | null, prev?: LibraryEntry): LibraryEntry => ({
  status,
  rating,
  title: m.title,
  year: m.year,
  genres: m.genres,
  tags: m.tags,
  // `at` = when it entered its current list, so history sorts by when you actually marked it
  at: prev && prev.status === status ? prev.at : Date.now(),
});

/** Mark a movie watched / planned, or pass null to remove it from the library. */
export function setStatus(m: Snap, status: WatchStatus | null) {
  const lib = { ...read() };
  const key = String(m.movieId);
  if (status === null) delete lib[key];
  else lib[key] = entryFor(m, status, status === "watched" ? (lib[key]?.rating ?? null) : null, lib[key]);
  write(lib);
}

/** Rate a movie 1-5 (rating a movie implies you watched it). Rating the same value again clears it. */
export function setRating(m: Snap, rating: number | null) {
  const lib = { ...read() };
  const key = String(m.movieId);
  const prev = lib[key];
  const next = prev?.rating === rating ? null : rating;
  lib[key] = entryFor(m, "watched", next, prev);
  write(lib);
}
