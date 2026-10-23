import { route, intParam } from "@/server/api";
import { duplicateGarment } from "@/server/services/garments";

export const POST = route<{ id: string }>((_req, { id }) => ({ garment: duplicateGarment(intParam(id)) }));
