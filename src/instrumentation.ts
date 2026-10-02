// Runs once when the server starts, before it handles any request.
// Downloads catalog.db from Vercel Blob if it isn't already on disk, so getDb() can stay synchronous.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[catalog] instrumentation running; token present:", !!process.env.BLOB_READ_WRITE_TOKEN);
    const { ensureCatalogFile } = await import("./lib/db");
    try {
      await ensureCatalogFile();
    } catch {
      // already logged inside ensureCatalogFile; the setup page will show the reason
    }
  }
}