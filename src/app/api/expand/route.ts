import { apiError, wantsTmdb } from "@/lib/api";
import { expandMovie } from "@/lib/mesh";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = Number(sp.get("id"));
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Use ?id=<number>." }, { status: 400 });
  }
  try {
    const res = await expandMovie(id, wantsTmdb(sp));
    return res ? Response.json(res) : Response.json({ error: `No movie with id ${id}.` }, { status: 404 });
  } catch (err) {
    return apiError(err);
  }
}
