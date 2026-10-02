import { apiError } from "@/lib/api";
import { loadMovieDetail } from "@/lib/detail";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Movie id must be a number." }, { status: 400 });
  try {
    const detail = await loadMovieDetail(id);
    return detail ? Response.json(detail) : Response.json({ error: `No movie with id ${id}.` }, { status: 404 });
  } catch (err) {
    return apiError(err);
  }
}
