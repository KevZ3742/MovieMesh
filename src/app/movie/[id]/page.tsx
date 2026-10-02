import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MoviePanel } from "@/components/MoviePanel";
import { SetupMessage } from "@/components/SetupMessage";
import { getMovie } from "@/lib/catalog";
import { CatalogMissingError } from "@/lib/db";
import { loadMovieDetail } from "@/lib/detail";
import type { MovieDetail } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = Number((await params).id);
  try {
    const m = Number.isInteger(id) ? getMovie(id) : null;
    return { title: m ? `${m.title}${m.year ? ` (${m.year})` : ""} - MovieMesh` : "MovieMesh" };
  } catch {
    return { title: "MovieMesh" };
  }
}

export default async function MoviePage({ params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  let detail: MovieDetail | null = null;
  let setupError: string | null = null;
  try {
    detail = await loadMovieDetail(id);
  } catch (err) {
    if (!(err instanceof CatalogMissingError)) throw err;
    setupError = err.message;
  }

  if (setupError) return <SetupMessage message={setupError} />;
  if (!detail) notFound();
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <nav className="mb-6 flex items-center justify-between text-sm">
        <Link href="/" className="font-display text-lg font-semibold">MovieMesh</Link>
        <Link href={`/?m=${id}`} className="underline underline-offset-4">Open in the mesh</Link>
      </nav>
      <MoviePanel detail={detail} now={new Date()} />
    </main>
  );
}
