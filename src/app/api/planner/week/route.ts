import { z } from "zod";
import { route, readJson } from "@/server/api";
import { planWeek } from "@/server/stylist";
import { getWeek } from "@/server/services/plans";
import { dateString } from "@/lib/schemas";
import { BadRequestError } from "@/server/errors";
import { isDateString } from "@/lib/dates";

export const GET = route(async (req) => {
  const start = new URL(req.url).searchParams.get("start") ?? "";
  if (!isDateString(start)) throw new BadRequestError("Pass ?start=YYYY-MM-DD");
  return getWeek(start);
});

export const POST = route(async (req) => {
  const body = await readJson(req, z.object({ start: dateString, useAi: z.boolean().default(true), request: z.string().max(2000).optional() }));
  return planWeek(body.start, { useAi: body.useAi, request: body.request });
});
