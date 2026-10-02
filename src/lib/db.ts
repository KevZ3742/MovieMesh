import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
// Node's built-in SQLite (Node 22.13+). No native module to compile, so no Visual Studio / node-gyp on Windows.
import { DatabaseSync } from "node:sqlite";

export class CatalogMissingError extends Error {
  constructor(public file: string) {
    super(
      `catalog.db not found at ${file}. Copy your catalog.db to data/catalog.db, set CATALOG_DB, ` +
        `or (on Vercel) upload it to a Blob store and set BLOB_READ_WRITE_TOKEN. ` +
        `[debug: ${g.__catalogNote ?? "download step never ran"}; ` +
        `BLOB_READ_WRITE_TOKEN is ${process.env.BLOB_READ_WRITE_TOKEN ? "set" : "NOT set"}]`,
    );
  }
}

/** The small slice of the SQLite API this app uses. Rows are untyped; callers cast them. */
export type Db = {
  prepare(sql: string): {
    all(...params: (string | number)[]): unknown[];
    get(...params: (string | number)[]): unknown;
  };
};

const g = globalThis as unknown as {
  __catalog?: Db;
  __tables?: Map<string, boolean>;
  __catalogReady?: Promise<void>;
  __catalogNote?: string; // what the download step did, shown on the setup page to help debug
};

// ---------- where is the file? ----------

const LOCAL_FILE = path.join(process.cwd(), "data", "catalog.db");
// On Vercel only /tmp is writable. os.tmpdir() gives /tmp there and the normal temp folder elsewhere.
const TMP_FILE = path.join(os.tmpdir(), "catalog.db");
// Pathname of the file inside your Blob store (the name you gave it when uploading).
const BLOB_PATHNAME = process.env.CATALOG_BLOB_PATH || "catalog.db";

/** CATALOG_DB wins, then data/catalog.db (local dev), then the copy downloaded from Blob. */
function catalogPath(): string {
  if (process.env.CATALOG_DB) return process.env.CATALOG_DB;
  // turbopackIgnore: these paths are only known at runtime; without it Turbopack traces the whole project.
  if (fs.existsSync(/* turbopackIgnore: true */ LOCAL_FILE)) return LOCAL_FILE;
  return TMP_FILE;
}

/**
 * Makes sure the catalog file exists on disk. Call once at server start (see instrumentation.ts).
 * Does nothing if the file is already there (local dev, or a warm serverless instance).
 * Otherwise downloads it from a private Vercel Blob store into the temp folder.
 */
export function ensureCatalogFile(): Promise<void> {
  g.__catalogReady ??= download().catch((err) => {
    g.__catalogNote = `download failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[catalog]", g.__catalogNote);
    g.__catalogReady = undefined; // let the next call retry instead of caching the failure
    throw err;
  });
  return g.__catalogReady;
}

async function download(): Promise<void> {
  const existing = catalogPath();
  if (fs.existsSync(/* turbopackIgnore: true */ existing)) {
    g.__catalogNote = `file already at ${existing}`;
    return;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    g.__catalogNote = "download skipped: no token";
    console.error("[catalog] BLOB_READ_WRITE_TOKEN is not set, so catalog.db can't be downloaded.");
    return; // nothing to download from; getDb() will report the missing file
  }

  // Imported lazily so local dev without the package/token never touches it.
  const { get } = await import("@vercel/blob");
  const result = await get(BLOB_PATHNAME, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Could not download "${BLOB_PATHNAME}" from Vercel Blob (status ${result?.statusCode ?? "none"}).`);
  }

  // Write to a scratch name and rename, so a half-finished download is never opened as a database.
  const partial = `${TMP_FILE}.${process.pid}.part`;
  await pipeline(
    Readable.fromWeb(result.stream as unknown as NodeWebStream),
    fs.createWriteStream(/* turbopackIgnore: true */ partial),
  );
  fs.renameSync(/* turbopackIgnore: true */ partial, /* turbopackIgnore: true */ TMP_FILE);
  g.__catalogNote = "downloaded from Blob";
  console.log("[catalog] downloaded catalog.db from Vercel Blob");
}

// ---------- opening it ----------

export function getDb(): Db {
  if (g.__catalog) return g.__catalog;
  const file = catalogPath();
  try {
    // readOnly never creates a file, so a wrong path fails here instead of silently making an empty database.
    const raw = new DatabaseSync(file, { readOnly: true });
    // node:sqlite returns rows with a null prototype, which React refuses to pass from a Server Component
    // to a Client Component. Copy each row into a plain object once, here, so nothing downstream has to care.
    const plain = (row: unknown) => (row && typeof row === "object" ? { ...(row as object) } : row);
    g.__catalog = {
      prepare(sql) {
        const stmt = raw.prepare(sql);
        return {
          all: (...params) => stmt.all(...params).map(plain),
          get: (...params) => plain(stmt.get(...params)),
        };
      },
    };
  } catch (err) {
    if (err instanceof Error && /unable to open|does not exist|cannot open/i.test(err.message)) {
      throw new CatalogMissingError(file);
    }
    throw err;
  }
  g.__tables = new Map();
  return g.__catalog;
}

/** Optional tables (seasonal_movies, movies_fts) may not exist in every catalog build. */
export function hasTable(name: string): boolean {
  const db = getDb();
  const cache = g.__tables!;
  if (!cache.has(name)) {
    cache.set(name, !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(name));
  }
  return cache.get(name)!;
}