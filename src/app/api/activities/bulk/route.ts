import { z } from "zod";
import { route, readJson } from "@/server/api";
import { addActivities } from "@/server/services/plans";
import { activityInputSchema } from "@/lib/schemas";

export const POST = route(async (req) => {
  const { activities } = await readJson(req, z.object({ activities: z.array(activityInputSchema).min(1).max(20) }));
  return { activities: addActivities(activities) };
});
