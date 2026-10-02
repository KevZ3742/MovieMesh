import { CatalogMissingError } from "./db";

/** Turns thrown errors into JSON responses a person can act on. */
export function apiError(err: unknown): Response {
  if (err instanceof CatalogMissingError) return Response.json({ error: err.message }, { status: 500 });
  console.error(err);
  return Response.json({ error: "Something went wrong reading the catalog. Check the server log." }, { status: 500 });
}
