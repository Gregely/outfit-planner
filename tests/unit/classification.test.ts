import { describe, expect, it } from "vitest";
import { parseWardrobeText } from "@/server/import/heuristic";
import { extractGarmentsFromText, fromAiGarment } from "@/server/services/importer";
import { detectBrand, estimateTraits, isAthletic } from "@/lib/garment-traits";
import { templateFor } from "@/lib/illustration/render";
import { fakeAi, promptOf } from "../helpers";

const U = "unspecified";
const NIKE_SHORTS = {
  name: "Black Nike polyester shorts",
  category: "shorts",
  subcategory: "athletic shorts",
  colours: [{ name: "black", hex: "#111111" }],
  pattern: "solid",
  materials: ["polyester"],
  fit: U,
  silhouette: "",
  layering_role: U,
  warmth: 0,
  formality: 0,
  seasons: [],
  weather: [],
  occasions: [],
  style_tags: [],
  brand: "Nike",
  notes: "",
  details: { sleeve: U, neckline: U, collar: U, lapel: U, closure: U, length: U, leg: U, height: U },
  estimated_fields: [],
  source_text: "black Nike polyester shorts",
};

const parse = (text: string) => {
  const [r] = parseWardrobeText(text);
  return r;
};

describe("offline parser classifies what the text says", () => {
  it("reads 'black Nike polyester shorts' as athletic shorts, not chino shorts", () => {
    const r = parse("black Nike polyester shorts");
    expect(r.input.category).toBe("shorts");
    expect(r.input.subcategory).toBe("athletic shorts");
    expect(r.input.subcategory).not.toMatch(/chino/);
    expect(r.input.brand).toBe("Nike");
    expect(r.input.materials).toEqual(["polyester"]);
    expect(r.input.colours![0].name).toBe("black");
    expect(r.input.formality).toBe(1);
    expect(r.input.name).toBe("Black Nike Polyester Shorts");
    expect(r.input.styleTags).toEqual([]);
    expect(r.assumed).toEqual(expect.arrayContaining(["warmth", "formality"]));
  });

  it.each([
    ["grey shorts", "shorts"],
    ["beige chino shorts", "chino shorts"],
    ["light-wash denim shorts", "denim shorts"],
    ["navy running shorts", "running shorts"],
    ["black cycling shorts", "bike shorts"],
    ["black trousers", "trousers"],
    ["navy chinos", "chinos"],
    ["grey Adidas track pants", "track pants"],
    ["black leggings", "leggings"],
    ["a white shirt", "shirt"],
    ["a black jacket", "jacket"],
    ["a waterproof jacket", "rain jacket"],
    ["a red silk slip dress", "slip dress"],
    ["black heels", "heels"],
    ["white Adidas running shoes", "running shoes"],
    ["a sports bra", "sports bra"],
  ])("%s → %s", (text, subcategory) => {
    expect(parse(text).input.subcategory).toBe(subcategory);
  });

  it("never upgrades a generic noun into a specific style", () => {
    for (const text of ["shorts", "trousers", "a jacket", "a coat", "boots", "shoes", "a shirt"]) {
      const r = parse(text);
      expect(r.input.subcategory).not.toMatch(/chino|tweed|oxford|chelsea|blazer|overcoat|brogue/);
      expect(r.input.styleTags).toEqual([]);
    }
  });

  it("keeps brands out of materials and recognises sportswear cues", () => {
    expect(detectBrand("my levis 501s")).toBe("Levi's");
    expect(detectBrand("a gap hoodie")).toBeNull(); // ambiguous everyday words aren't brands
    expect(isAthletic("nike shorts")).toBe(true);
    expect(isAthletic("linen shorts")).toBe(false);
    expect(parse("grey Nike hoodie").input.materials).toEqual([]);
  });

  it("only adds style tags the person actually used", () => {
    expect(parse("a minimalist black t-shirt").input.styleTags).toEqual(["minimalist"]);
    expect(parse("a black t-shirt").input.styleTags).toEqual([]);
  });

  it("estimates formality from the garment type, not from a dress code", () => {
    expect(estimateTraits({ category: "shorts", subcategory: "athletic shorts" }).formality).toBe(1);
    expect(estimateTraits({ category: "outerwear", subcategory: "blazer" }).formality).toBe(4);
    expect(estimateTraits({ category: "trousers", subcategory: "leggings" }).formality).toBe(1);
  });

  it("draws sportswear and generic shoes with fitting templates", () => {
    expect(templateFor({ category: "footwear", subcategory: "shoes" })).toBe("sneaker");
    expect(templateFor({ category: "footwear", subcategory: "heels" })).toBe("loafer");
    expect(templateFor({ category: "footwear", subcategory: "oxford shoes" })).toBe("oxford");
    expect(templateFor({ category: "outerwear", subcategory: "rain jacket" })).toBe("parka");
  });
});

describe("Claude import path", () => {
  it("accepts Black Nike polyester shorts and keeps Claude's factual attributes", async () => {
    const calls = fakeAi(() => ({ garments: [NIKE_SHORTS] }));
    const res = await extractGarmentsFromText("black Nike polyester shorts");
    expect(res.method).toBe("ai");
    expect(res.notice).toBeNull();
    const p = res.proposals[0];
    expect(p.errors).toEqual([]);
    expect(p.input).toMatchObject({ category: "shorts", subcategory: "athletic shorts", brand: "Nike", materials: ["polyester"], formality: 1, warmth: 1, styleTags: [] });
    expect(p.assumed).toEqual(expect.arrayContaining(["warmth", "formality"]));
    // the prompt is factual and names no aesthetic
    const system = String(calls[0].system);
    expect(system).toMatch(/not "chino shorts" unless the text says chino/);
    expect(system).not.toMatch(/dark academia|menswear|tweed/i);
    expect(promptOf(calls[0])).toContain("black Nike polyester shorts");
  });

  it("translates unknown sentinels into empty fields, never invented values", () => {
    const { input } = fromAiGarment({ ...NIKE_SHORTS, colours: [], materials: [], brand: "", pattern: U } as never);
    expect(input.colours).toEqual([]);
    expect(input.materials).toEqual([]);
    expect(input.brand).toBeNull();
    expect(input.pattern).toBe("solid");
    expect(input.fit).toBeNull();
    expect(input.details).toEqual({});
  });
});
