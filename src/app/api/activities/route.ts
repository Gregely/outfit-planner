import { route, readJson } from "@/server/api";
import { createActivity } from "@/server/services/plans";
import { activityInputSchema } from "@/lib/schemas";

export const POST = route(async (req) => ({ activity: createActivity(await readJson(req, activityInputSchema)) }));
