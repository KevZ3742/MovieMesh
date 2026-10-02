// Runs once when the server starts, before it handles any request.
// Downloads catalog.db from Vercel Blob if it isn't already on disk, so getDb() can stay synchronous.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureCatalogFile } = await import("./lib/db");
    await ensureCatalogFile();
  }
}