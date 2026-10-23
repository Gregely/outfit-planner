import { route, readJson } from "@/server/api";
import { suggestOutfits } from "@/server/stylist";
import { stylistRequestSchema } from "@/lib/schemas";

export const POST = route(async (req) => suggestOutfits(await readJson(req, stylistRequestSchema)));
