import { cookies } from "next/headers";
import { Explorer } from "@/components/Explorer";
import { SetupMessage } from "@/components/SetupMessage";
import { CatalogMissingError } from "@/lib/db";
import { loadMovieDetail, loadStarters } from "@/lib/detail";
import { TMDB_COOKIE } from "@/lib/prefs";
import { tmdbEnabled } from "@/lib/tmdb";
import type { MovieDetail } from "@/lib/types";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).m;
  const m = Number(Array.isArray(raw) ? raw[0] : raw);
  const tmdbAvailable = await tmdbEnabled();
  const useTmdb = tmdbAvailable && (await cookies()).get(TMDB_COOKIE)?.value !== "0";

  let starters: ReturnType<typeof loadStarters> = [];
  let initial: MovieDetail | null = null;
  let setupError: string | null = null;
  try {
    starters = loadStarters();
    if (Number.isInteger(m) && m > 0) initial = await loadMovieDetail(m, useTmdb);
  } catch (err) {
    if (!(err instanceof CatalogMissingError)) throw err;
    setupError = err.message;
  }

  if (setupError) return <SetupMessage message={setupError} />;
  return <Explorer starters={starters} initial={initial} initialAvailable={tmdbAvailable} initialUseTmdb={useTmdb} />;
}
