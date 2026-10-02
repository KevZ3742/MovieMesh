import { cookies } from "next/headers";
import { TMDB_KEY_COOKIE } from "@/lib/prefs";
import { checkTmdbKey, tmdbAuth } from "@/lib/tmdb";

export type SettingsStatus = {
  /** A usable TMDB credential exists (from Settings or .env.local). */
  available: boolean;
  source: "user" | "env" | null;
  /** Last 4 characters of a key saved in Settings, so you can tell which one it is. Never the whole key. */
  hint: string | null;
};

async function status(): Promise<SettingsStatus> {
  const auth = await tmdbAuth();
  return {
    available: !!auth,
    source: auth?.source ?? null,
    hint: auth?.source === "user" ? auth.value.slice(-4) : null,
  };
}

export async function GET() {
  return Response.json(await status(), { headers: { "cache-control": "no-store" } });
}

/** Save a TMDB key. It's checked with TMDB first, then kept in an HTTP-only cookie (never in page JS). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!/^[A-Za-z0-9._-]{16,800}$/.test(key)) {
    return Response.json({ error: "That doesn't look like a TMDB key or read access token." }, { status: 400 });
  }
  const check = await checkTmdbKey(key);
  if (check === "rejected") {
    return Response.json({ error: "TMDB rejected that key. Check that you copied all of it." }, { status: 400 });
  }
  if (check === "unreachable") {
    return Response.json({ error: "Couldn't reach TMDB to check the key. Try again in a moment." }, { status: 502 });
  }
  (await cookies()).set(TMDB_KEY_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // (the cookie we just set isn't visible to this same request yet, so build the answer directly)
  return Response.json({ available: true, source: "user", hint: key.slice(-4) } satisfies SettingsStatus);
}

/** Forget the saved key (falls back to .env.local if there is one). */
export async function DELETE() {
  (await cookies()).delete(TMDB_KEY_COOKIE);
  const env = process.env.TMDB_READ_TOKEN || process.env.TMDB_API_KEY;
  return Response.json({ available: !!env, source: env ? "env" : null, hint: null } satisfies SettingsStatus);
}
