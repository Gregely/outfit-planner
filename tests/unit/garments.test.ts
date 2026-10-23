import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resetDbConnection } from "@/server/db";
import {
  advanceLaundry,
  createGarment,
  deleteGarment,
  duplicateGarment,
  findDuplicates,
  getGarment,
  garmentIllustration,
  listGarments,
  setGarmentStatus,
  updateGarment,
} from "@/server/services/garments";
import { setCareDefault } from "@/server/services/settings";

const blazer = {
  name: "Charcoal tweed blazer",
  category: "outerwear" as const,
  subcategory: "blazer",
  colours: [{ name: "charcoal", hex: "#36383b" }],
  materials: ["Wool", "wool"],
  styleTags: ["Dark Academia"],
  formality: 4,
};

describe("garment CRUD", () => {
  it("creates a garment with defaults, normalised tags and a cached illustration", () => {
    const g = createGarment(blazer);
    expect(g.id).toBeGreaterThan(0);
    expect(g.status).toBe("clean");
    expect(g.available).toBe(true);
    expect(g.materials).toEqual(["wool"]);
    expect(g.styleTags).toEqual(["dark academia"]);
    expect(g.layeringRole).toBe("mid");
    expect(g.illustrationKey).toMatch(/^v\d+-/);
    expect(garmentIllustration(g.id).svg.startsWith("<svg")).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(() => createGarment({ ...blazer, name: "" })).toThrow();
    expect(() => createGarment({ ...blazer, category: "hats" as never })).toThrow();
    expect(() => createGarment({ ...blazer, colours: [{ name: "x", hex: "red" }] })).toThrow();
    expect(() => createGarment({ ...blazer, warmth: 9 })).toThrow();
  });

  it("updates, regenerates the illustration when drawing attributes change, duplicates and deletes", () => {
    const g = createGarment(blazer);
    const updated = updateGarment(g.id, { colours: [{ name: "navy", hex: "#1f2a44" }], notes: "Patched elbows" });
    expect(updated.notes).toBe("Patched elbows");
    expect(updated.illustrationKey).not.toBe(g.illustrationKey);
    const copy = duplicateGarment(g.id);
    expect(copy.id).not.toBe(g.id);
    expect(copy.name).toBe("Charcoal tweed blazer (copy)");
    expect(copy.wearCount).toBe(0);
    deleteGarment(g.id);
    expect(() => getGarment(g.id)).toThrow(/not found/);
    expect(listGarments().map((x) => x.id)).toEqual([copy.id]);
  });

  it("only changes the fields a patch sends", () => {
    const g = createGarment({ ...blazer, status: "in_wash", pattern: "herringbone", seasons: ["winter"] });
    const updated = updateGarment(g.id, { notes: "Dry clean only" });
    expect(updated).toMatchObject({ status: "in_wash", pattern: "herringbone", seasons: ["winter"], materials: ["wool"], formality: 4 });
    expect(updated.colours).toHaveLength(1);
  });

  it("searches, filters and sorts", () => {
    createGarment(blazer);
    createGarment({ name: "White oxford shirt", category: "shirts", subcategory: "oxford shirt", colours: [{ name: "white", hex: "#ffffff" }] });
    createGarment({ name: "Old jeans", category: "trousers", status: "retired" });
    expect(listGarments({ q: "tweed" }).map((g) => g.name)).toEqual(["Charcoal tweed blazer"]);
    expect(listGarments({ q: "dark academia" })).toHaveLength(1);
    expect(listGarments({ category: "shirts" })).toHaveLength(1);
    expect(listGarments({ colour: "white" })).toHaveLength(1);
    expect(listGarments()).toHaveLength(2); // retired hidden by default
    expect(listGarments({ status: "retired" })).toHaveLength(1);
    expect(listGarments({ sort: "name" }).map((g) => g.name)).toEqual(["Charcoal tweed blazer", "White oxford shirt"]);
  });

  it("persists across connections (close and reopen)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wardrobe-db-"));
    process.env.DATABASE_PATH = path.join(dir, "test.db");
    try {
      resetDbConnection();
      const g = createGarment(blazer);
      resetDbConnection();
      expect(getGarment(g.id).name).toBe("Charcoal tweed blazer");
    } finally {
      resetDbConnection();
      process.env.DATABASE_PATH = ":memory:";
    }
  });
});

describe("availability and laundry", () => {
  it("tracks statuses and resets wear counters only when washed", () => {
    const g = createGarment({ name: "White tee", category: "tops", subcategory: "t-shirt" });
    updateGarment(g.id, {});
    setGarmentStatus([g.id], "worn");
    expect(getGarment(g.id).available).toBe(false);
    const steps = [];
    for (let i = 0; i < 3; i++) steps.push(advanceLaundry([g.id]).updated[0].status);
    expect(steps).toEqual(["in_wash", "drying", "clean"]);
    expect(getGarment(g.id).wearsSinceWash).toBe(0);
  });

  it("routes items that need ironing through the ironing step", () => {
    const shirt = createGarment({ name: "Oxford", category: "shirts", subcategory: "oxford shirt" });
    setCareDefault("shirts", { washAfterWears: 2, needsIroning: true });
    setGarmentStatus([shirt.id], "drying");
    expect(advanceLaundry([shirt.id]).updated[0].status).toBe("awaiting_ironing");
    expect(advanceLaundry([shirt.id]).updated[0].status).toBe("clean");
  });

  it("per-item care overrides category defaults", () => {
    const coat = createGarment({ name: "Coat", category: "outerwear", subcategory: "overcoat" });
    expect(coat.care.washAfterWears).toBe(0);
    const updated = updateGarment(coat.id, { washAfterWears: 10 });
    expect(updated.care).toMatchObject({ washAfterWears: 10, custom: true });
  });
});

describe("duplicate detection", () => {
  it("flags likely duplicates in the same category only", () => {
    createGarment(blazer);
    expect(findDuplicates({ name: "Charcoal blazer", category: "outerwear", subcategory: "blazer", colours: [{ hex: "#37393c" }] })).toHaveLength(1);
    expect(findDuplicates({ name: "Charcoal blazer", category: "knitwear" })).toHaveLength(0);
    expect(findDuplicates({ name: "Camel overcoat", category: "outerwear", subcategory: "overcoat", colours: [{ hex: "#b98a52" }] })).toHaveLength(0);
  });
});

describe("settings and profile patches", () => {
  it("keep values that weren't sent", async () => {
    const { saveSettings, getSettings } = await import("@/server/services/settings");
    const { saveProfile } = await import("@/server/services/preferences");
    const { settingsPatchSchema, profilePatchSchema } = await import("@/lib/schemas");
    saveSettings({ location: { name: "Oxford", latitude: 51.75, longitude: -1.25, timezone: "Europe/London" } });
    saveSettings(settingsPatchSchema.parse({ units: "imperial" }));
    expect(getSettings()).toMatchObject({ units: "imperial", location: { name: "Oxford" } });
    saveProfile(profilePatchSchema.parse({ aesthetics: ["grunge"], formality: 4 }));
    expect(saveProfile(profilePatchSchema.parse({ notes: "cold office" }))).toMatchObject({ aesthetics: ["grunge"], formality: 4, notes: "cold office" });
  });
});
