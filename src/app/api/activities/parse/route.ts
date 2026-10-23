import { z } from "zod";
import { route, readJson } from "@/server/api";
import { parseDayPlan } from "@/server/import/activities";
import { dateString } from "@/lib/schemas";

export const POST = route(async (req) => {
  const body = await readJson(req, z.object({ text: z.string().max(2000), date: dateString, useAi: z.boolean().default(true) }));
  return parseDayPlan(body.text, body.date, { useAi: body.useAi });
});
