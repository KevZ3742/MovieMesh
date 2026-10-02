import { apiError } from "@/lib/api";
import { searchMovies } from "@/lib/catalog";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return Response.json({ results: q.trim().length < 2 ? [] : searchMovies(q.slice(0, 80)) });
  } catch (err) {
    return apiError(err);
  }
}
