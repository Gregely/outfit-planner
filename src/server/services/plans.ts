import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/server/db";
import { activities, dayPlans, type Activity, type DayPlan } from "@/server/db/schema";
import { activityInputSchema, manualWeatherSchema, type ActivityInput } from "@/lib/schemas";
import { isDateString, weekDates } from "@/lib/dates";
import { weatherNeeds, type DayWeather, type WeatherNeeds } from "@/lib/weather";
import { BadRequestError, NotFoundError } from "@/server/errors";
import { weatherForDates, type WeatherStatus } from "@/server/weather";
import { discardIfOrphan, duplicateOutfit, getOutfitRecord, getOutfits, type OutfitView } from "./outfits";
import { listWearLogs, type WearLogView } from "./wear";

export type DayView = {
  date: string;
  plan: DayPlan | null;
  outfit: OutfitView | null;
  activities: Activity[];
  weather: DayWeather;
  needs: WeatherNeeds;
  /** problems with the planned outfit (garments now unavailable etc.) */
  flags: string[];
  worn: WearLogView | null;
};

function assertDate(date: string) {
  if (!isDateString(date)) throw new BadRequestError("Invalid date.");
}

export function getPlanRow(date: string): DayPlan | null {
  return getDb().select().from(dayPlans).where(eq(dayPlans.date, date)).get() ?? null;
}

function ensurePlan(date: string): DayPlan {
  assertDate(date);
  const db = getDb();
  db.insert(dayPlans).values({ date }).onConflictDoNothing().run();
  return getPlanRow(date)!;
}

export function listActivities(dates: string[]): Activity[] {
  if (dates.length === 0) return [];
  return getDb()
    .select()
    .from(activities)
    .where(inArray(activities.date, dates))
    .orderBy(asc(activities.date), asc(activities.startTime), asc(activities.position), asc(activities.id))
    .all();
}

export async function getDays(dates: string[], opts: { forceWeather?: boolean } = {}): Promise<{ days: DayView[]; weatherStatus: WeatherStatus }> {
  const db = getDb();
  const plans = dates.length ? db.select().from(dayPlans).where(inArray(dayPlans.date, dates)).all() : [];
  const planByDate = new Map(plans.map((p) => [p.date, p]));
  const outfits = getOutfits(plans.map((p) => p.outfitId).filter((x): x is number => x !== null));
  const outfitById = new Map(outfits.map((o) => [o.id, o]));
  const acts = listActivities(dates);
  const { days: weather, status } = await weatherForDates(dates, { force: opts.forceWeather });
  const wearIds = new Set(plans.map((p) => p.wearLogId).filter(Boolean));
  const logs = wearIds.size ? listWearLogs({ limit: 500 }).filter((l) => wearIds.has(l.id)) : [];
  const days = dates.map((date) => {
    const plan = planByDate.get(date) ?? null;
    const outfit = plan?.outfitId ? (outfitById.get(plan.outfitId) ?? null) : null;
    const dayActs = acts.filter((a) => a.date === date);
    const worn = plan?.wearLogId ? (logs.find((l) => l.id === plan.wearLogId) ?? null) : null;
    return {
      date,
      plan,
      outfit,
      activities: dayActs,
      weather: weather[date],
      needs: weatherNeeds(weather[date], dayActs),
      flags: worn ? [] : (outfit?.issues ?? []),
      worn,
    };
  });
  return { days, weatherStatus: status };
}

export async function getDay(date: string) {
  assertDate(date);
  const { days, weatherStatus } = await getDays([date]);
  return { day: days[0], weatherStatus };
}

export async function getWeek(start: string) {
  assertDate(start);
  return getDays(weekDates(start));
}

/**
 * Put an outfit on a day. Saved collection outfits are copied so later per-day edits
 * (replacing an item) don't change the saved original.
 */
export function setDayOutfit(date: string, outfitId: number | null, opts: { copySaved?: boolean } = { copySaved: true }) {
  const plan = ensurePlan(date);
  let id = outfitId;
  if (id !== null) {
    const o = getOutfitRecord(id);
    if (o.saved && opts.copySaved !== false) id = duplicateOutfit(o.id, { saved: false, name: o.name }).id;
  }
  getDb()
    .update(dayPlans)
    .set({ outfitId: id, updatedAt: new Date().toISOString() })
    .where(eq(dayPlans.date, date))
    .run();
  if (plan.outfitId && plan.outfitId !== id) discardIfOrphan(plan.outfitId);
  return getPlanRow(date)!;
}

export function setDayLocked(date: string, locked: boolean) {
  ensurePlan(date);
  getDb().update(dayPlans).set({ locked, updatedAt: new Date().toISOString() }).where(eq(dayPlans.date, date)).run();
  return getPlanRow(date)!;
}

export function setDayNotes(date: string, notes: string | null) {
  ensurePlan(date);
  getDb()
    .update(dayPlans)
    .set({ notes: notes ? notes.slice(0, 1000) : null, updatedAt: new Date().toISOString() })
    .where(eq(dayPlans.date, date))
    .run();
  return getPlanRow(date)!;
}

export function setWeatherOverride(date: string, value: unknown | null) {
  ensurePlan(date);
  const parsed = value === null ? null : manualWeatherSchema.parse(value);
  if (parsed && parsed.low > parsed.high) throw new BadRequestError("The low can't be above the high.");
  getDb()
    .update(dayPlans)
    .set({ weatherOverride: parsed, updatedAt: new Date().toISOString() })
    .where(eq(dayPlans.date, date))
    .run();
  return getPlanRow(date)!;
}

export function plansBetween(from: string, to: string) {
  return getDb()
    .select()
    .from(dayPlans)
    .where(and(gte(dayPlans.date, from), lte(dayPlans.date, to)))
    .all();
}

/* ------------------------------------------------------------------ */
/* Activities                                                          */
/* ------------------------------------------------------------------ */

export function createActivity(input: ActivityInput): Activity {
  const data = activityInputSchema.parse(input);
  if (data.startTime && data.endTime && data.endTime < data.startTime) throw new BadRequestError("The end time is before the start time.");
  return getDb()
    .insert(activities)
    .values({ ...data, startTime: data.startTime ?? null, endTime: data.endTime ?? null, notes: data.notes ?? null })
    .returning()
    .get();
}

export function updateActivity(id: number, patch: Partial<ActivityInput>): Activity {
  const db = getDb();
  const a = db.select().from(activities).where(eq(activities.id, id)).get();
  if (!a) throw new NotFoundError("Activity");
  const data = activityInputSchema.parse({ ...a, ...patch });
  return db
    .update(activities)
    .set({ ...data, startTime: data.startTime ?? null, endTime: data.endTime ?? null, notes: data.notes ?? null })
    .where(eq(activities.id, id))
    .returning()
    .get();
}

export function deleteActivity(id: number) {
  getDb().delete(activities).where(eq(activities.id, id)).run();
}

export function addActivities(list: ActivityInput[]): Activity[] {
  return getDb().transaction(() => list.map((a) => createActivity(a)));
}
