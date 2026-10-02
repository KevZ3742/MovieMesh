import path from "node:path";
// Node's built-in SQLite (Node 22.13+). No native module to compile, so no Visual Studio / node-gyp on Windows.
import { DatabaseSync } from "node:sqlite";

export class CatalogMissingError extends Error {
  constructor(public file: string) {
    super(`catalog.db not found at ${file}. Copy your catalog.db to data/catalog.db or set CATALOG_DB.`);
  }
}

/** The small slice of the SQLite API this app uses. Rows are untyped; callers cast them. */
export type Db = {
  prepare(sql: string): {
    all(...params: (string | number)[]): unknown[];
    get(...params: (string | number)[]): unknown;
  };
};

const g = globalThis as unknown as { __catalog?: Db; __tables?: Map<string, boolean> };

export function getDb(): Db {
  if (g.__catalog) return g.__catalog;
  const file = process.env.CATALOG_DB || path.join(process.cwd(), "data", "catalog.db");
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
