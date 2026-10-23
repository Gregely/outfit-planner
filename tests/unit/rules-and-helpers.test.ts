import { describe, expect, it } from "vitest";
import { compositionErrors, validateOutfit, type RuleGarment } from "@/lib/outfit-rules";
import { harmonyScore, isNeutral, resolveColourName } from "@/lib/colours";
import { csvToObjects, parseCsv, toCsv } from "@/lib/csv";
import { addDays, startOfWeek, todayIn, weekDates } from "@/lib/dates";
import { slotFor, coversTorso, nextLaundryStatus } from "@/lib/domain";
import { parseWardrobeText } from "@/server/import/heuristic";
import { parseActivitiesHeuristic } from "@/server/import/activities";
import { sniffImage, readPhotoFile, savePhotoFile } from "@/server/services/photos";

let nextId = 1;
const g = (category: RuleGarment["category"], subcategory: string, over: Partial<RuleGarment> = {}): RuleGarment => ({
  id: nextId++,
  name: `${subcategory} ${nextId}`,
  category,
  subcategory,
  layeringRole: null,
  status: "clean",
  colours: [{ name: "navy", hex: "#1f2a44" }],
  ...over,
});

describe("outfit validation", () => {
  const tee = g("tops", "t-shirt");
  const jeans = g("trousers", "jeans");
  const boots = g("footwear", "chelsea boots");
  const loafers = g("footwear", "loafers");
  const coat = g("outerwear", "overcoat");
  const parka = g("outerwear", "parka");
  const dirty = g("shirts", "oxford shirt", { status: "worn" });
  const cardigan = g("knitwear", "cardigan");
  const jumper = g("knitwear", "crewneck jumper");
  const map = new Map([tee, jeans, boots, loafers, coat, parka, dirty, cardigan, jumper].map((x) => [x.id, x]));

  it("accepts a complete outfit", () => {
    expect(validateOutfit([tee.id, jeans.id, boots.id, coat.id], map).ok).toBe(true);
    expect(validateOutfit([jumper.id, jeans.id, boots.id], map).ok).toBe(true); // a jumper covers the torso
  });
  it("rejects structural problems", () => {
    expect(compositionErrors([tee, jeans])).toContain("Needs one pair of shoes.");
    expect(compositionErrors([tee, jeans, boots, loafers])).toContain("Has more than one pair of shoes.");
    expect(compositionErrors([tee, boots])).toContain("Needs trousers, shorts, a skirt, a dress or a suit.");
    expect(compositionErrors([cardigan, jeans, boots]).join()).toMatch(/torso/); // an open cardigan needs a top
    expect(compositionErrors([tee, jeans, boots, coat, parka])).toContain("Has more than one coat.");
  });
  it("rejects unknown, duplicate, unavailable, excluded and never-combined garments", () => {
    const r = validateOutfit([tee.id, jeans.id, boots.id, 999, tee.id, dirty.id], map, {
      excludeIds: [jeans.id],
      neverCombine: [[tee.id, boots.id]],
      requireIds: [coat.id],
      avoidColours: ["navy"],
    });
    const text = r.errors.join(" ");
    expect(text).toMatch(/#999 does not exist/);
    expect(text).toMatch(/listed twice/);
    expect(text).toMatch(/not available/);
    expect(text).toMatch(/excluded/);
    expect(text).toMatch(/never combine/);
    expect(text).toMatch(/requested but is missing/);
    expect(text).toMatch(/colour you avoid/);
  });
  it("maps garments to outfit slots", () => {
    expect(slotFor({ category: "outerwear", subcategory: "blazer" })).toBe("mid");
    expect(slotFor({ category: "outerwear", subcategory: "trench coat" })).toBe("outer");
    expect(slotFor({ category: "formalwear", subcategory: "suit" })).toBe("suit");
    expect(coversTorso({ category: "knitwear", subcategory: "sweater vest" })).toBe(false);
    expect(nextLaundryStatus("drying", true)).toBe("awaiting_ironing");
    expect(nextLaundryStatus("drying", false)).toBe("clean");
  });
});

describe("colours", () => {
  it("resolves natural colour phrases", () => {
    expect(resolveColourName("navy")).toBe("#1f2a44");
    const blended = resolveColourName("dark brown, almost charcoal")!;
    expect(blended).toMatch(/^#[0-9a-f]{6}$/);
    expect(blended).not.toBe(resolveColourName("dark brown"));
    expect(resolveColourName("blorange")).toBeNull();
  });
  it("treats neutrals as neutral and penalises clashes", () => {
    expect(isNeutral("#1f2a44")).toBe(true);
    expect(isNeutral("#e2c34a")).toBe(false);
    expect(harmonyScore(["#1f2a44", "#f4f1ea", "#6b4a32"])).toBe(1);
    expect(harmonyScore(["#d02020", "#20a040", "#3050d0"])).toBeLessThan(0.6);
  });
});

describe("CSV", () => {
  it("round-trips quotes, commas and newlines and neutralises formulas", () => {
    const csv = toCsv(["name", "notes"], [["Blazer, tweed", 'He said "hi"\nnext line'], ["=SUM(A1)", ""]]);
    expect(csv).toContain("'=SUM(A1)");
    const rows = parseCsv(csv);
    expect(rows[1]).toEqual(["Blazer, tweed", 'He said "hi"\nnext line']);
    expect(csvToObjects("Name,Style Tags\nTee,minimal")[0]).toEqual({ name: "Tee", style_tags: "minimal" });
  });
});

describe("dates", () => {
  it("does calendar arithmetic across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(startOfWeek("2026-10-23", 1)).toBe("2026-10-19");
    expect(weekDates("2026-12-29").at(-1)).toBe("2027-01-04");
    expect(todayIn("Pacific/Kiritimati", new Date("2026-10-23T12:00:00Z"))).toBe("2026-10-24");
    expect(todayIn("Not/AZone", new Date("2026-10-23T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("offline text parsers", () => {
  it("splits several garments and keeps the user's words", () => {
    const res = parseWardrobeText("A cream cable-knit wool jumper, navy chinos and brown suede chelsea boots. Also a grey herringbone overcoat.");
    expect(res.map((r) => r.input.subcategory)).toEqual(["cable knit", "chinos", "chelsea boots", "overcoat"]);
    expect(res[0].input.materials).toContain("wool");
    expect(res[2].input.materials).toContain("suede");
    expect(res[3].input.pattern).toBe("herringbone");
    expect(res[0].assumed).toContain("warmth");
  });
  it("does not invent attributes that weren't mentioned", () => {
    const [r] = parseWardrobeText("a jacket");
    expect(r.input.colours).toEqual([]);
    expect(r.input.materials).toEqual([]);
    expect(r.input.fit).toBeNull();
    expect(r.assumed).toEqual(expect.arrayContaining(["colours", "fit"]));
  });
  it("reads times, dress codes and settings from a day description", () => {
    const acts = parseActivitiesHeuristic("Lecture 9-11am, then a walk in the park at 2pm and dinner at a restaurant at 7", "2026-10-23");
    expect(acts).toHaveLength(3);
    expect(acts[0]).toMatchObject({ startTime: "09:00", endTime: "11:00", dressCode: "casual" });
    expect(acts[1]).toMatchObject({ startTime: "14:00", setting: "outdoor" });
    expect(acts[2]).toMatchObject({ startTime: "19:00", dressCode: "smart-casual" });
  });
});

describe("photo uploads", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  it("checks magic bytes, not the file name or MIME type", () => {
    expect(sniffImage(png)).toBe("png");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(() => savePhotoFile(1, new TextEncoder().encode("<html>"))).toThrow(/JPEG, PNG or WebP/);
    expect(() => savePhotoFile(1, new Uint8Array(6 * 1024 * 1024).fill(0xff))).toThrow(/5 MB/);
  });
  it("stores under a generated name and refuses path traversal", () => {
    const name = savePhotoFile(7, png);
    expect(name).toMatch(/^7-[0-9a-f-]{36}\.png$/);
    expect(readPhotoFile(name).mime).toBe("image/png");
    for (const bad of ["../../etc/passwd", "..%2F..%2Fwardrobe.db", "7-x.png", "/etc/hosts"]) expect(() => readPhotoFile(bad)).toThrow(/not found/);
  });
});
