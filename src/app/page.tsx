import { Explorer } from "@/components/Explorer";
import { SetupMessage } from "@/components/SetupMessage";
import { CatalogMissingError } from "@/lib/db";
import { loadMovieDetail, loadStarters } from "@/lib/detail";
import type { MovieDetail } from "@/lib/types";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).m;
  const m = Number(Array.isArray(raw) ? raw[0] : raw);

  let starters: ReturnType<typeof loadStarters> = [];
  let initial: MovieDetail | null = null;
  let setupError: string | null = null;
  try {
    starters = loadStarters();
    if (Number.isInteger(m) && m > 0) initial = await loadMovieDetail(m);
  } catch (err) {
    if (!(err instanceof CatalogMissingError)) throw err;
    setupError = err.message;
  }

  if (setupError) return <SetupMessage message={setupError} />;
  return <Explorer starters={starters} initial={initial} />;
}
