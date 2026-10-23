import { describe, expect, it } from "vitest";
import { planWeek, regenerateDay } from "@/server/stylist";
import { getWeek, setDayLocked, setDayOutfit, getPlanRow, createActivity } from "@/server/services/plans";
import { outfitGarmentIds, createOutfit, getOutfit } from "@/server/services/outfits";
import { setGarmentStatus, getGarmentsByIds } from "@/server/services/garments";
import { markOutfitWorn, deleteWearLog, listWearLogs } from "@/server/services/wear";
import { today } from "@/server/services/settings";
import { addDays, weekDates } from "@/lib/dates";
import { slotFor } from "@/lib/domain";
import { seedSample } from "../helpers";

describe("weekly planner", () => {
  it("plans every remaining day with valid, varied outfits", async () => {
    seedSample();
    const start = today();
    const res = await planWeek(start);
    expect(res.planned).toEqual(weekDates(start));
    expect(res.source).toBe("rules");
    const { days } = await getWeek(start);
    const sets = days.map((d) => outfitGarmentIds(d.outfit!.id).sort().join(","));
    expect(new Set(sets).size).toBe(7);
    for (const d of days) expect(d.flags).toEqual([]);
    // garments washed after every wear (t-shirts) aren't scheduled twice in one week
    const tees = days.flatMap((d) => getGarmentsByIds(outfitGarmentIds(d.outfit!.id))).filter((g) => g.subcategory === "t-shirt");
    const counts = new Map<number, number>();
    for (const t of tees) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBe(1);
  });

  it("never overwrites locked days and leaves unrelated days alone when regenerating one", async () => {
    const g = seedSample();
    const start = today();
    const locked = createOutfit({ name: "Locked look", source: "manual", garmentIds: [g["White oxford shirt"].id, g["Grey wide-leg wool trousers"].id, g["Oxblood penny loafers"].id] });
    setDayOutfit(addDays(start, 2), locked.id, { copySaved: false });
    setDayLocked(addDays(start, 2), true);
    const res = await planWeek(start);
    expect(res.skipped).toContainEqual({ date: addDays(start, 2), reason: "locked" });
    expect(getPlanRow(addDays(start, 2))!.outfitId).toBe(locked.id);

    const before = new Map(weekDates(start).map((d) => [d, getPlanRow(d)!.outfitId]));
    const target = addDays(start, 4);
    const { outfit } = await regenerateDay(target);
    expect(outfit.id).not.toBe(before.get(target));
    for (const d of weekDates(start)) if (d !== target) expect(getPlanRow(d)!.outfitId).toBe(before.get(d));
    await expect(regenerateDay(addDays(start, 2))).rejects.toThrow(/locked/);
  });

  it("flags planned outfits that become unavailable instead of silently changing them", async () => {
    const g = seedSample();
    const start = today();
    const o = createOutfit({ name: "Plan", source: "manual", garmentIds: [g["White oxford shirt"].id, g["Stone chinos"].id, g["Oxblood penny loafers"].id] });
    setDayOutfit(addDays(start, 1), o.id, { copySaved: false });
    const { affectedPlans } = setGarmentStatus([g["Stone chinos"].id], "in_wash");
    expect(affectedPlans.map((p) => p.date)).toEqual([addDays(start, 1)]);
    const { days } = await getWeek(start);
    const day = days.find((d) => d.date === addDays(start, 1))!;
    expect(day.flags.join(" ")).toMatch(/Stone chinos is currently unavailable/);
    expect(outfitGarmentIds(day.outfit!.id)).toContain(g["Stone chinos"].id);
  });

  it("copies saved outfits when assigning them to a day so per-day edits don't alter the original", () => {
    const g = seedSample();
    const saved = createOutfit({ name: "Favourite", source: "manual", saved: true, garmentIds: [g["Black t-shirt"].id, g["Raw denim jeans"].id, g["Black combat boots"].id] });
    const plan = setDayOutfit(today(), saved.id);
    expect(plan.outfitId).not.toBe(saved.id);
    expect(getOutfit(plan.outfitId!).basedOnOutfitId).toBe(saved.id);
  });

  it("uses activities to set formality", async () => {
    const g = seedSample();
    const d = addDays(today(), 1);
    createActivity({ date: d, title: "Job interview", startTime: "10:00", dressCode: "business", setting: "indoor" });
    await regenerateDay(d);
    const gs = getGarmentsByIds(outfitGarmentIds(getPlanRow(d)!.outfitId!));
    const core = gs.filter((x) => slotFor(x) !== "accessory");
    const avg = core.reduce((s, x) => s + x.formality, 0) / core.length;
    expect(avg).toBeGreaterThanOrEqual(3.4);
    expect(gs.map((x) => x.id)).not.toContain(g["White canvas sneakers"].id);
  });
});

describe("wear tracking", () => {
  it("records history, updates counts and applies per-category care", () => {
    const g = seedSample();
    const ids = [g["White t-shirt"].id, g["Raw denim jeans"].id, g["Charcoal wool overcoat"].id, g["Black combat boots"].id];
    const o = createOutfit({ name: "Cold day", source: "manual", garmentIds: ids });
    const d = today();
    setDayOutfit(d, o.id, { copySaved: false });
    const res = markOutfitWorn(o.id, d);
    expect(res.markedForWash.map((x) => x.name)).toEqual(["White t-shirt"]);
    const after = new Map(getGarmentsByIds(ids).map((x) => [x.name, x]));
    expect(after.get("White t-shirt")!.status).toBe("worn");
    expect(after.get("Raw denim jeans")!.status).toBe("clean"); // trousers: 5 wears by default
    expect(after.get("Charcoal wool overcoat")!.status).toBe("clean"); // outerwear never auto-marked
    expect(after.get("Raw denim jeans")!.wearCount).toBe(1);
    expect(after.get("Raw denim jeans")!.lastWornOn).toBe(d);
    // planned and actual records are separate but linked
    const plan = getPlanRow(d)!;
    expect(plan.outfitId).toBe(o.id);
    expect(plan.wearLogId).toBe(res.wearLogId);
    expect(listWearLogs()[0].items).toHaveLength(4);
  });

  it("keeps history snapshots when a garment is later edited or deleted, and can undo a wear", async () => {
    const g = seedSample();
    const ids = [g["Black t-shirt"].id, g["Stone chinos"].id, g["White canvas sneakers"].id];
    const o = createOutfit({ name: "Easy", source: "manual", garmentIds: ids });
    const res = markOutfitWorn(o.id, today());
    const { deleteGarment } = await import("@/server/services/garments");
    deleteGarment(g["White canvas sneakers"].id);
    const log = listWearLogs()[0];
    expect(log.items.find((i) => i.garmentId === null)!.snapshot.name).toBe("White canvas sneakers");
    expect(getOutfit(o.id).issues.join(" ")).toMatch(/removed from the wardrobe/);
    deleteWearLog(res.wearLogId);
    const chinos = getGarmentsByIds([g["Stone chinos"].id])[0];
    expect(chinos.wearCount).toBe(0);
    expect(chinos.lastWornOn).toBeNull();
    expect(getPlanRow(today())!.wearLogId).toBeNull();
  });
});
