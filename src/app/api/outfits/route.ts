import { route, readJson } from "@/server/api";
import { createOutfit, listOutfits, type OutfitFilters } from "@/server/services/outfits";
import { outfitInputSchema } from "@/lib/schemas";

export const GET = route((req) => {
  const p = new URL(req.url).searchParams;
  return { outfits: listOutfits({ view: (p.get("view") as OutfitFilters["view"]) ?? "saved", tag: p.get("tag") ?? undefined, q: p.get("q") ?? undefined }) };
});

export const POST = route(async (req) => {
  const data = await readJson(req, outfitInputSchema);
  return { outfit: createOutfit({ ...data, source: "manual" }) };
});
