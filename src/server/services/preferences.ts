import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { feedback, outfits, profile, styleRules, type Feedback, type StyleRule } from "@/server/db/schema";
import { feedbackInputSchema, profileSchema, ruleInputSchema, type FeedbackInput, type Profile, type RuleInput } from "@/lib/schemas";
import { BadRequestError, NotFoundError } from "@/server/errors";
import { addDays } from "@/lib/dates";
import type { HardConstraints } from "@/lib/outfit-rules";
import { today } from "./settings";
import { outfitGarmentIds } from "./outfits";

export function getProfile(): Profile {
  const row = getDb().select().from(profile).where(eq(profile.id, 1)).get();
  const parsed = profileSchema.safeParse(row?.data ?? {});
  return parsed.success ? parsed.data : profileSchema.parse({});
}

export function saveProfile(input: unknown): Profile {
  const data = profileSchema.parse({ ...getProfile(), ...(input as object) });
  getDb()
    .insert(profile)
    .values({ id: 1, data, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: profile.id, set: { data, updatedAt: new Date().toISOString() } })
    .run();
  return data;
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

function isActive(r: StyleRule, on: string) {
  return r.active && (!r.expiresAt || r.expiresAt >= on);
}

export function listRules(opts: { activeOnly?: boolean } = {}): StyleRule[] {
  const rows = getDb().select().from(styleRules).orderBy(desc(styleRules.createdAt)).all();
  if (!opts.activeOnly) return rows;
  const d = today();
  return rows.filter((r) => isActive(r, d));
}

export function createRule(input: RuleInput, feedbackId?: number): StyleRule {
  const data = ruleInputSchema.parse(input);
  if (data.kind === "never_combine" && data.garmentIds.length < 2) throw new BadRequestError("Pick at least two garments that shouldn't be combined.");
  if ((data.kind === "avoid_garment" || data.kind === "prefer_garment") && data.garmentIds.length === 0) throw new BadRequestError("Pick a garment.");
  if (data.kind === "avoid_colour" && data.colours.length === 0) throw new BadRequestError("Name at least one colour.");
  if (data.kind === "note" && !data.text) throw new BadRequestError("Write the rule.");
  return getDb()
    .insert(styleRules)
    .values({
      ...data,
      expiresAt: data.permanent ? null : (data.expiresAt ?? addDays(today(), 30)),
      feedbackId: feedbackId ?? null,
    })
    .returning()
    .get();
}

export function updateRule(id: number, patch: { active?: boolean; text?: string; permanent?: boolean; expiresAt?: string | null }) {
  const db = getDb();
  const r = db.select().from(styleRules).where(eq(styleRules.id, id)).get();
  if (!r) throw new NotFoundError("Rule");
  const set: Partial<StyleRule> = {};
  if (typeof patch.active === "boolean") set.active = patch.active;
  if (typeof patch.text === "string") set.text = patch.text.slice(0, 500);
  if (typeof patch.permanent === "boolean") {
    set.permanent = patch.permanent;
    set.expiresAt = patch.permanent ? null : (patch.expiresAt ?? addDays(today(), 30));
  }
  return db.update(styleRules).set(set).where(eq(styleRules.id, id)).returning().get();
}

export function deleteRule(id: number) {
  getDb().delete(styleRules).where(eq(styleRules.id, id)).run();
}

/** Turn active rules into hard constraints enforced by the validator. */
export function ruleConstraints(): HardConstraints {
  const rules = listRules({ activeOnly: true });
  return {
    neverCombine: rules.filter((r) => r.kind === "never_combine").map((r) => r.garmentIds),
    avoidGarmentIds: rules.filter((r) => r.kind === "avoid_garment").flatMap((r) => r.garmentIds),
    avoidColours: rules.filter((r) => r.kind === "avoid_colour").flatMap((r) => r.colours),
  };
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function recordFeedback(input: FeedbackInput): { feedback: Feedback; rule: StyleRule | null } {
  const data = feedbackInputSchema.parse(input);
  const db = getDb();
  let garmentIds = data.garmentIds;
  if (garmentIds.length === 0 && data.outfitId) garmentIds = outfitGarmentIds(data.outfitId);
  // "Don't combine these again" is a standing rule unless the user said otherwise.
  const scope = data.kind === "dont_combine" && data.scope === "one_off" ? "permanent" : data.scope;
  const d = today();
  const expiresAt = scope === "permanent" ? null : scope === "temporary" ? addDays(d, 30) : addDays(d, 7);
  return db.transaction(() => {
    const fb = db
      .insert(feedback)
      .values({ outfitId: data.outfitId ?? null, garmentIds, kind: data.kind, scope, context: data.context ?? null, note: data.note ?? null, expiresAt })
      .returning()
      .get();
    let rule: StyleRule | null = null;
    if (data.kind === "dont_combine") {
      if (garmentIds.length < 2) throw new BadRequestError("Choose at least two garments that shouldn't be worn together.");
      rule = createRule({ kind: "never_combine", garmentIds, permanent: scope === "permanent", expiresAt, text: data.note ?? "" }, fb.id);
    }
    if (data.kind === "love" && data.outfitId) {
      db.update(outfits).set({ favourite: true, saved: true, updatedAt: new Date().toISOString() }).where(eq(outfits.id, data.outfitId)).run();
    }
    return { feedback: fb, rule };
  });
}

export function listFeedback(limit = 100): Feedback[] {
  return getDb().select().from(feedback).orderBy(desc(feedback.createdAt)).limit(limit).all();
}

/** Feedback still relevant today (permanent, or not yet expired). */
export function activeFeedback(): Feedback[] {
  const d = today();
  return listFeedback(300).filter((f) => !f.expiresAt || f.expiresAt >= d);
}

export function deleteFeedback(id: number) {
  getDb().delete(feedback).where(eq(feedback.id, id)).run();
}
