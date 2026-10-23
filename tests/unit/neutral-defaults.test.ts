import { describe, expect, it } from "vitest";
import { profileSchema } from "@/lib/schemas";
import { getProfile, saveProfile } from "@/server/services/preferences";
import { SAMPLE_WARDROBE } from "@/server/services/sample";
import { profileBlock } from "@/server/ai/tasks";
import { ruleGaps } from "@/server/stylist/gaps";
import { loadGarments } from "@/server/stylist/context";
import { suggestOutfits } from "@/server/stylist";
import { getDb } from "@/server/db";
import { profile } from "@/server/db/schema";
import { fakeAi, seedAppSample } from "../helpers";

const AESTHETIC_WORDS = /academia|menswear|grunge|tweed|ivy|preppy|heritage|earthy/i;

describe("neutral defaults", () => {
  it("starts with a profile that expresses no style", () => {
    const p = profileSchema.parse({});
    expect(p.styleDescription).toBe("");
    expect(p.aesthetics).toEqual([]);
    expect(p.favouriteColours).toEqual([]);
    expect(p.favouriteMaterials).toEqual([]);
    expect(p.preferredFits).toEqual([]);
    expect(p.formality).toBeNull();
    expect(p.boldness).toBe(3);
    expect(getProfile()).toEqual(p);
  });

  it("tells Claude there are no preferences rather than inventing some", () => {
    const block = profileBlock(profileSchema.parse({}));
    expect(block).toMatch(/No style preferences stated yet/);
    expect(block).toMatch(/no preference/);
    expect(block).not.toMatch(AESTHETIC_WORDS);
  });

  it("ships a sample wardrobe with no style tags and a spread of garment types", () => {
    expect(SAMPLE_WARDROBE.every((g) => !g.styleTags?.length)).toBe(true);
    const cats = new Set(SAMPLE_WARDROBE.map((g) => g.category));
    for (const c of ["tops", "trousers", "shorts", "skirts", "dresses", "outerwear", "footwear"]) expect(cats.has(c as never)).toBe(true);
    expect(SAMPLE_WARDROBE.some((g) => g.occasions?.includes("sport"))).toBe(true);
    expect(JSON.stringify(SAMPLE_WARDROBE)).not.toMatch(AESTHETIC_WORDS);
  });

  it("keeps the stylist prompt neutral about aesthetics", async () => {
    seedAppSample();
    const calls = fakeAi(() => ({ outfits: [] }));
    await suggestOutfits({ count: 1, useAi: true });
    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0].system)).toMatch(/client's own stated aesthetic/);
    expect(String(calls[0].system)).not.toMatch(AESTHETIC_WORDS);
  });

  it("only suggests tailoring gaps when the person's profile asks for it", () => {
    seedAppSample();
    const gs = loadGarments().filter((g) => !/blazer/.test(g.subcategory ?? ""));
    const neutral = ruleGaps(gs, profileSchema.parse({}));
    expect(neutral.some((g) => /blazer/i.test(g.piece))).toBe(false);
    const tailored = ruleGaps(gs, profileSchema.parse({ aesthetics: ["classic tailoring"] }));
    expect(tailored.some((g) => /blazer/i.test(g.piece))).toBe(true);
  });
});

describe("existing preferences are preserved", () => {
  it("keeps a previously saved profile exactly, including old fields", () => {
    const old = { styleDescription: "Dark academia with a grunge streak", aesthetics: ["dark academia", "grunge"], formality: 3, boldness: 2, favouriteColours: ["burgundy"] };
    getDb().insert(profile).values({ id: 1, data: old as never, updatedAt: new Date().toISOString() }).run();
    const p = getProfile();
    expect(p).toMatchObject(old);
    // saving an unrelated field doesn't reset the others to the new defaults
    const saved = saveProfile({ notes: "cold office" });
    expect(saved).toMatchObject({ ...old, notes: "cold office" });
  });

  it("lets a person clear their usual formality", () => {
    saveProfile({ formality: 4 });
    expect(saveProfile({ formality: null }).formality).toBeNull();
    expect(getProfile().formality).toBeNull();
  });
});
