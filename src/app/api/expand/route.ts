import { apiError } from "@/lib/api";
import { expandMovie, expandPerson } from "@/lib/mesh";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = Number(sp.get("id"));
  const type = sp.get("type");
  if (!Number.isInteger(id) || (type !== "movie" && type !== "person")) {
    return Response.json({ error: "Use ?type=movie|person&id=<number>." }, { status: 400 });
  }
  try {
    if (type === "movie") {
      const res = await expandMovie(id);
      return res ? Response.json(res) : Response.json({ error: `No movie with id ${id}.` }, { status: 404 });
    }
    return Response.json(await expandPerson(id, (sp.get("name") ?? "This actor").slice(0, 80)));
  } catch (err) {
    return apiError(err);
  }
}
