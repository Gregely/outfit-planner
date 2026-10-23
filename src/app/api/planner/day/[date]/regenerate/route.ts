import { z } from "zod";
import { route, readJson } from "@/server/api";
import { regenerateDay } from "@/server/stylist";
import { isDateString } from "@/lib/dates";
import { BadRequestError } from "@/server/errors";

export const POST = route<{ date: string }>(async (req, { date }) => {
  if (!isDateString(date)) throw new BadRequestError("Invalid date.");
  const body = await readJson(req, z.object({ useAi: z.boolean().default(true), request: z.string().max(2000).optional() }));
  return regenerateDay(date, body);
});
