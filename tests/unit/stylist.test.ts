import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { suggestOutfits, applyReplacement, replacementSuggestions, adjust, styleGarment } from "@/server/stylist";
import { setGarmentStatus, getGarmentsByIds } from "@/server/services/garments";
import { createRule, recordFeedback } from "@/server/services/preferences";
import { setWeatherOverride } from "@/server/services/plans";
import { outfitGarmentIds, createOutfit, getOutfit } from "@/server/services/outfits";
import { saveSettings, today } from "@/server/services/settings";
import { validateOutfit } from "@/lib/outfit-rules";
import { ruleMap } from "@/server/stylist/engine";
import { loadGarments } from "@/server/stylist/context";
import { slotFor } from "@/lib/domain";
import { fakeAi, promptOf, seedSample } from "../helpers";

function assertValid(ids: number[]) {
  const v = validateOutfit(ids, ruleMap(loadGarments()));
  expect(v.errors).toEqual([]);
}

describe("rule-based stylist (no API key)", () => {
  it("produces valid, distinct outfits from available garments only, clearly labelled", async () => {
    seedSample();
    const res = await suggestOutfits({ prompt: "college", count: 3 });
    expect(res.source).toBe("rules");
    expect(res.outfits).toHaveLength(3);
    for (const o of res.outfits) {
      expect(o.source).toBe("rules");
      expect(o.explanation.length).toBeGreaterThan(20);
      assertValid(outfitGarmentIds(o.id));
    }
    const keys = res.outfits.map((o) => outfitGarmentIds(o.id).sort().join(","));
    expect(new Set(keys).size).toBe(3);
  });

  it("never recommends unavailable garments", async () => {
    const g = seedSample();
    const dirty = ["White oxford shirt", "Light blue oxford shirt", "Brown suede chelsea boots", "Stone chinos", "Dark brown tweed blazer"].map((n) => g[n].id);
    setGarmentStatus(dirty, "worn");
    setGarmentStatus([g["Raw denim jeans"].id], "in_wash");
    for (let i = 0; i < 3; i++) {
      const res = await suggestOutfits({ count: 3, prompt: i === 1 ? "smart presentation" : "" });
      for (const o of res.outfits) {
        const ids = outfitGarmentIds(o.id);
        expect(ids.some((id) => [...dirty, g["Raw denim jeans"].id].includes(id))).toBe(false);
        expect(getGarmentsByIds(ids).every((x) => x.status === "clean")).toBe(true);
      }
    }
  });

  it("honours required and excluded garments and 'never combine' rules", async () => {
    const g = seedSample();
    const res = await suggestOutfits({ includeGarmentIds: [g["Rust corduroys"].id], excludeGarmentIds: [g["Cream cable-knit jumper"].id], count: 2 });
    for (const o of res.outfits) {
      const ids = outfitGarmentIds(o.id);
      expect(ids).toContain(g["Rust corduroys"].id);
      expect(ids).not.toContain(g["Cream cable-knit jumper"].id);
    }
    createRule({ kind: "never_combine", garmentIds: [g["Grey wide-leg wool trousers"].id, g["Oxblood penny loafers"].id] });
    for (let i = 0; i < 2; i++) {
      const r = await suggestOutfits({ includeGarmentIds: [g["Grey wide-leg wool trousers"].id], count: 3 });
      for (const o of r.outfits) expect(outfitGarmentIds(o.id)).not.toContain(g["Oxblood penny loafers"].id);
    }
  });

  it("dresses for the weather: coat when cold, no suede in the rain, no coat when hot", async () => {
    const g = seedSample();
    const d = today();
    setWeatherOverride(d, { low: 1, high: 5, precipProbability: 80, wind: 20 });
    const cold = await suggestOutfits({ date: d, count: 3 });
    for (const o of cold.outfits) {
      const gs = getGarmentsByIds(outfitGarmentIds(o.id));
      expect(gs.some((x) => slotFor(x) === "outer")).toBe(true);
      expect(outfitGarmentIds(o.id)).not.toContain(g["Brown suede chelsea boots"].id);
    }
    setWeatherOverride(d, { low: 24, high: 31, precipProbability: 0, wind: 5 });
    const hot = await suggestOutfits({ date: d, count: 2 });
    for (const o of hot.outfits) {
      const gs = getGarmentsByIds(outfitGarmentIds(o.id));
      expect(gs.some((x) => slotFor(x) === "outer")).toBe(false);
      expect(gs.some((x) => x.warmth >= 4 && slotFor(x) !== "footwear")).toBe(false);
    }
  });

  it("explains what's missing when no complete outfit is possible", async () => {
    const g = seedSample();
    const shoes = Object.values(g).filter((x) => x.category === "footwear").map((x) => x.id);
    setGarmentStatus(shoes, "awaiting_repair");
    await expect(suggestOutfits({})).rejects.toThrow(/shoes/);
  });

  it("styles a specific piece several ways", async () => {
    const g = seedSample();
    const res = await styleGarment(g["Dark brown tweed blazer"].id);
    expect(res.outfits.length).toBeGreaterThanOrEqual(2);
    for (const o of res.outfits) expect(outfitGarmentIds(o.id)).toContain(g["Dark brown tweed blazer"].id);
  });
});

describe("Claude stylist with hard-constraint validation", () => {
  it("accepts valid AI outfits and sends the wardrobe server-side only", async () => {
    const g = seedSample();
    const ids = [g["White oxford shirt"].id, g["Stone chinos"].id, g["Oxblood penny loafers"].id, g["Dark brown tweed blazer"].id];
    const calls = fakeAi(() => ({ outfits: [{ name: "Seminar tweed", garment_ids: ids, explanation: "Tweed over crisp white." }] }));
    const res = await suggestOutfits({ prompt: "seminar", count: 1 });
    expect(res.source).toBe("ai");
    expect(res.outfits[0].name).toBe("Seminar tweed");
    expect(outfitGarmentIds(res.outfits[0].id).sort()).toEqual([...ids].sort());
    expect(promptOf(calls[0])).toContain(`#${g["White oxford shirt"].id} White oxford shirt`);
    expect(calls[0].model).toBe("claude-opus-5-5");
  });

  it("rejects invented ids, unavailable items and broken outfits, retries once, then falls back to rules", async () => {
    const g = seedSample();
    setGarmentStatus([g["White oxford shirt"].id], "in_wash");
    let n = 0;
    const calls = fakeAi(() => {
      n++;
      return {
        outfits: [
          { name: "Ghost", garment_ids: [9999, g["Stone chinos"].id, g["Oxblood penny loafers"].id, g["Black t-shirt"].id], explanation: "x" },
          { name: "Dirty", garment_ids: [g["White oxford shirt"].id, g["Stone chinos"].id, g["Oxblood penny loafers"].id], explanation: "x" },
          { name: "No shoes", garment_ids: [g["Black t-shirt"].id, g["Raw denim jeans"].id], explanation: "x" },
        ],
      };
    });
    const res = await suggestOutfits({ count: 2 });
    expect(n).toBe(2); // one repair attempt
    expect(promptOf(calls[1])).toContain("does not exist");
    expect(res.rejected).toBe(6);
    expect(res.outfits).toHaveLength(2);
    for (const o of res.outfits) {
      expect(o.source).toBe("rules");
      assertValid(outfitGarmentIds(o.id));
    }
  });

  it.each([
    ["rate limit", () => new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers()), /rate-limited/],
    ["network", () => new Anthropic.APIConnectionError({ message: "offline" }), /couldn't be reached/],
    ["unexpected SDK", () => new Anthropic.AnthropicError("socket hang up"), /returned an error: socket hang up/],
    ["bad request", () => new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "Schema is too complex for compilation" } }, "400", new Headers({ "request-id": "req_123" })), /rejected the request.*Schema is too complex.*req_123/],
    ["auth", () => new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers()), /rejected/],
  ])("falls back without crashing on %s errors", async (_label, makeErr, notice) => {
    seedSample();
    fakeAi(() => {
      throw makeErr();
    });
    const res = await suggestOutfits({ count: 2 });
    expect(res.source).toBe("rules");
    expect(res.notice).toMatch(notice);
    expect(res.outfits).toHaveLength(2);
  });

  it("treats refusals and truncated output as unavailable", async () => {
    seedSample();
    fakeAi(() => null, "refusal");
    const res = await suggestOutfits({ count: 1 });
    expect(res.notice).toMatch(/declined/);
    expect(res.outfits[0].source).toBe("rules");
  });

  it("skips Claude when switched off in settings", async () => {
    seedSample();
    const calls = fakeAi(() => ({ outfits: [] }));
    saveSettings({ aiEnabled: false });
    const res = await suggestOutfits({ count: 1 });
    expect(calls).toHaveLength(0);
    expect(res.source).toBe("rules");
  });

  it("includes feedback and rules in the prompt", async () => {
    const g = seedSample();
    createRule({ kind: "avoid_colour", colours: ["mustard"] });
    const o = createOutfit({ name: "x", source: "manual", garmentIds: [g["Black t-shirt"].id, g["Raw denim jeans"].id, g["Black combat boots"].id] });
    recordFeedback({ outfitId: o.id, kind: "too_casual", scope: "temporary", context: "work" });
    const calls = fakeAi(() => ({ outfits: [] }));
    await suggestOutfits({ count: 1 });
    const prompt = promptOf(calls[0]);
    expect(prompt).toContain("Avoid colours: mustard");
    expect(prompt).toContain("too casual");
  });
});

describe("replacing one item", () => {
  it("offers same-role alternatives and keeps everything else", async () => {
    const g = seedSample();
    const ids = [g["White oxford shirt"].id, g["Stone chinos"].id, g["Oxblood penny loafers"].id, g["Burgundy lambswool crewneck"].id];
    const o = createOutfit({ name: "Base", source: "manual", garmentIds: ids });
    const { options } = await replacementSuggestions(o.id, g["Stone chinos"].id);
    expect(options.length).toBeGreaterThan(0);
    for (const opt of options) {
      const alt = getGarmentsByIds([opt.garmentId])[0];
      expect(["bottom", "onepiece", "suit"]).toContain(slotFor(alt));
      expect(alt.status).toBe("clean");
    }
    const updated = applyReplacement(o.id, g["Stone chinos"].id, options[0].garmentId);
    const after = outfitGarmentIds(updated.id);
    expect(after).toHaveLength(4);
    for (const keep of ids.filter((id) => id !== g["Stone chinos"].id)) expect(after).toContain(keep);
    expect(after).toContain(options[0].garmentId);
  });

  it("refuses an unavailable or incompatible replacement", async () => {
    const g = seedSample();
    const o = createOutfit({ name: "Base", source: "manual", garmentIds: [g["White oxford shirt"].id, g["Stone chinos"].id, g["Oxblood penny loafers"].id] });
    setGarmentStatus([g["Rust corduroys"].id], "in_wash");
    expect(() => applyReplacement(o.id, g["Stone chinos"].id, g["Rust corduroys"].id)).toThrow(/available/);
    expect(() => applyReplacement(o.id, g["Stone chinos"].id, g["Black combat boots"].id)).toThrow(/shoes|trousers/);
  });

  it("adjusts an outfit into a new variation, leaving the original intact", async () => {
    const g = seedSample();
    const ids = [g["Black t-shirt"].id, g["Raw denim jeans"].id, g["White canvas sneakers"].id];
    const o = createOutfit({ name: "Weekend", source: "manual", garmentIds: ids });
    const { outfit } = await adjust(o.id, "smarter");
    expect(outfit.id).not.toBe(o.id);
    expect(outfit.basedOnOutfitId).toBe(o.id);
    const before = getGarmentsByIds(ids);
    const after = getGarmentsByIds(outfitGarmentIds(outfit.id));
    const avg = (xs: { formality: number }[]) => xs.reduce((s, x) => s + x.formality, 0) / xs.length;
    expect(avg(after)).toBeGreaterThan(avg(before));
    expect(outfitGarmentIds(o.id).sort()).toEqual([...ids].sort());
    const warmer = await adjust(o.id, "warmer");
    expect(getOutfit(warmer.outfit.id).items.length).toBeGreaterThanOrEqual(3);
  });
});
