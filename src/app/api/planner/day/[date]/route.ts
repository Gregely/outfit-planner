import { z } from "zod";
import { route, readJson } from "@/server/api";
import { getDay, setDayLocked, setDayNotes, setDayOutfit, setWeatherOverride } from "@/server/services/plans";
import { manualWeatherSchema } from "@/lib/schemas";
import { isDateString } from "@/lib/dates";
import { BadRequestError } from "@/server/errors";

type P = { date: string };

function check(date: string) {
  if (!isDateString(date)) throw new BadRequestError("Invalid date.");
  return date;
}

export const GET = route<P>(async (_req, { date }) => getDay(check(date)));

const patchSchema = z.object({
  locked: z.boolean().optional(),
  notes: z.string().max(1000).nullish(),
  outfitId: z.number().int().positive().nullable().optional(),
  weatherOverride: manualWeatherSchema.nullable().optional(),
});

export const PATCH = route<P>(async (req, { date }) => {
  check(date);
  const body = await readJson(req, patchSchema);
  if (body.outfitId !== undefined) setDayOutfit(date, body.outfitId);
  if (body.locked !== undefined) setDayLocked(date, body.locked);
  if (body.notes !== undefined) setDayNotes(date, body.notes ?? null);
  if (body.weatherOverride !== undefined) setWeatherOverride(date, body.weatherOverride);
  return getDay(date);
});
