import { route, intParam } from "@/server/api";
import { duplicateOutfit } from "@/server/services/outfits";

export const POST = route<{ id: string }>((_req, { id }) => ({ outfit: duplicateOutfit(intParam(id), { saved: true }) }));
