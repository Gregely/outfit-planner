import { route, readJson } from "@/server/api";
import { createGarment, listGarments, type GarmentFilters } from "@/server/services/garments";
import { garmentInputSchema } from "@/lib/schemas";

export const GET = route((req) => {
  const p = new URL(req.url).searchParams;
  const filters: GarmentFilters = {
    q: p.get("q") ?? undefined,
    category: p.get("category") ?? undefined,
    status: p.get("status") ?? undefined,
    availability: (p.get("availability") as GarmentFilters["availability"]) ?? undefined,
    colour: p.get("colour") ?? undefined,
    season: p.get("season") ?? undefined,
    tag: p.get("tag") ?? undefined,
    formality: p.get("formality") ? Number(p.get("formality")) : undefined,
    sort: (p.get("sort") as GarmentFilters["sort"]) ?? undefined,
  };
  return { garments: listGarments(filters) };
});

export const POST = route(async (req) => {
  const input = await readJson(req, garmentInputSchema);
  return { garment: createGarment(input) };
});
