import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { extractGarmentsFromCsv, extractGarmentsFromText, commitImport } from "@/server/services/importer";
import { createGarment, getGarment, listGarments } from "@/server/services/garments";
import { exportBackup, exportGarmentsCsv, restoreBackup } from "@/server/services/backup";
import { createOutfit, getOutfit } from "@/server/services/outfits";
import { markOutfitWorn, listWearLogs } from "@/server/services/wear";
import { saveSettings, today } from "@/server/services/settings";
import { weatherForDates, loadForecast } from "@/server/weather";
import { getDays, setWeatherOverride } from "@/server/services/plans";
import { weatherNeeds } from "@/lib/weather";
import { addDays } from "@/lib/dates";
import { getDb } from "@/server/db";
import { weatherCache } from "@/server/db/schema";
import { proxy } from "@/proxy";
import { fakeAi, seedSample } from "../helpers";

const U = "unspecified";
const AI_GARMENT = {
  name: "Charcoal tweed blazer",
  category: "outerwear",
  subcategory: "blazer",
  colours: [{ name: "dark brown, almost charcoal", hex: "#3e332a" }],
  pattern: U,
  materials: ["wool"],
  fit: "relaxed",
  silhouette: "",
  layering_role: U,
  warmth: 0,
  formality: 4,
  seasons: [],
  weather: [],
  occasions: ["college"],
  style_tags: ["dark academia", "smart-casual"],
  brand: "",
  notes: "",
  details: { sleeve: U, neckline: U, collar: U, lapel: "notch", closure: U, length: U, leg: U, height: U },
  estimated_fields: ["formality"],
  source_text: "dark brown, almost charcoal blazer, relaxed fit",
};

describe("natural-language import", () => {
  it("uses Claude's structured extraction, flags assumptions and never saves before review", async () => {
    const calls = fakeAi(() => ({ garments: [AI_GARMENT, { ...AI_GARMENT, name: "Black jeans", category: "trousers", subcategory: "jeans", formality: 2, colours: [{ name: "black", hex: "not-a-hex" }] }] }));
    const res = await extractGarmentsFromText("I have a dark brown, almost charcoal blazer… and black jeans");
    expect(calls).toHaveLength(1);
    expect(res.method).toBe("ai");
    expect(res.proposals).toHaveLength(2);
    expect(res.proposals[0].assumed).toEqual(expect.arrayContaining(["formality", "warmth"]));
    expect(res.proposals[0].input.warmth).toBe(3);
    expect(res.proposals[0].input.details).toEqual({ lapel: "notch" });
    expect(res.proposals[1].input.colours![0].hex).toMatch(/^#[0-9a-f]{6}$/); // bad hex replaced from the name
    expect(listGarments()).toHaveLength(0);
  });

  it("falls back to the offline parser when Claude fails, with a notice", async () => {
    fakeAi(() => {
      throw new Error("boom");
    });
    const failed = await extractGarmentsFromText("navy chinos");
    expect(failed.method).toBe("rules");
    expect(failed.notice).toMatch(/offline parser/);
    delete process.env.ANTHROPIC_API_KEY;
    const res = await extractGarmentsFromText("navy chinos and white sneakers");
    expect(res.method).toBe("rules");
    expect(res.proposals.map((p) => p.input.subcategory)).toEqual(["chinos", "sneakers"]);
  });

  it("detects duplicates and never silently overwrites on commit", async () => {
    const existing = createGarment({ name: "Charcoal tweed blazer", category: "outerwear", subcategory: "blazer", colours: [{ name: "charcoal", hex: "#3a3633" }], notes: "My note" });
    fakeAi(() => ({ garments: [AI_GARMENT] }));
    const res = await extractGarmentsFromText("tweed blazer");
    expect(res.proposals[0].duplicates[0].id).toBe(existing.id);
    const p = res.proposals[0];
    const out = commitImport({ method: "ai", items: [{ action: "fill", targetId: existing.id, input: { ...p.input, notes: "Overwrite attempt" } }] });
    const after = getGarment(existing.id);
    expect(out.updated).toHaveLength(1);
    expect(after.notes).toBe("My note"); // filled fields kept
    expect(after.colours[0].name).toBe("charcoal");
    expect(after.styleTags).toEqual(["dark academia", "smart-casual"]); // empty field filled
    const created = commitImport({ method: "ai", items: [{ action: "create", input: p.input }, { action: "skip", input: p.input }] });
    expect(created.created).toHaveLength(1);
    expect(created.skipped).toBe(1);
  });

  it("commits all-or-nothing", () => {
    expect(() =>
      commitImport({ method: "rules", items: [{ action: "create", input: { name: "Fine", category: "tops" } }, { action: "fill", targetId: 99999, input: { name: "x", category: "tops" } }] }),
    ).toThrow();
    expect(listGarments()).toHaveLength(0);
  });
});

describe("CSV import/export and backups", () => {
  it("round-trips the wardrobe through CSV", () => {
    seedSample();
    const csv = exportGarmentsCsv();
    const res = extractGarmentsFromCsv(csv);
    expect(res.proposals).toHaveLength(29);
    expect(res.proposals.every((p) => p.errors.length === 0)).toBe(true);
    expect(res.proposals.every((p) => p.duplicates.length > 0)).toBe(true);
    const blazer = res.proposals.find((p) => p.input.name === "Dark brown tweed blazer")!;
    expect(blazer.input.colours).toEqual([{ name: "dark brown, almost charcoal", hex: "#3e332a" }]);
  });

  it("reports bad CSV rows instead of guessing", () => {
    const res = extractGarmentsFromCsv("name,category,warmth\nGood tee,tops,2\nMystery,hats,3\n,tops,1");
    expect(res.proposals[0].errors).toEqual([]);
    expect(res.proposals[1].errors.join()).toMatch(/category/);
    expect(res.proposals[2].errors.join()).toMatch(/name/i);
    expect(() => extractGarmentsFromCsv("colour\nred")).toThrow(/name.*category/);
  });

  it("exports and restores a full backup, preserving history and ids", () => {
    const g = seedSample();
    const o = createOutfit({ name: "Look", source: "manual", saved: true, garmentIds: [g["White t-shirt"].id, g["Raw denim jeans"].id, g["Black combat boots"].id] });
    markOutfitWorn(o.id, today());
    saveSettings({ units: "imperial" });
    const backup = JSON.parse(JSON.stringify(exportBackup()));
    expect(backup.data.garments[0].illustrationSvg).toBeUndefined();
    // change things, then restore
    createGarment({ name: "Added later", category: "tops" });
    const counts = restoreBackup(backup);
    expect(counts.garments).toBe(29);
    expect(listGarments().some((x) => x.name === "Added later")).toBe(false);
    expect(getOutfit(o.id).timesWorn).toBe(1);
    expect(listWearLogs()[0].items).toHaveLength(3);
    expect(getGarment(g["White t-shirt"].id).status).toBe("worn");
  });

  it("rejects invalid or malicious backups without touching data", () => {
    seedSample();
    expect(() => restoreBackup({ app: "something-else" })).toThrow(/valid Wardrobe Studio backup/);
    const backup = JSON.parse(JSON.stringify(exportBackup()));
    backup.data.garments[0].colours = [{ name: "x", hex: '"/><script>' }];
    expect(() => restoreBackup(backup)).toThrow();
    const broken = JSON.parse(JSON.stringify(exportBackup()));
    broken.data.outfitItems = [{ id: 1, outfitId: 999, garmentId: 1, slot: "top", position: 0, snapshot: { name: "x", category: "tops", subcategory: null, colours: [], pattern: "solid" } }];
    expect(() => restoreBackup(broken)).toThrow(/couldn't be restored/);
    expect(listGarments()).toHaveLength(29);
  });
});

function forecastFixture(start: string) {
  const days = Array.from({ length: 3 }, (_, i) => addDays(start, i));
  const hours = days.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`));
  return {
    timezone: "Europe/London",
    hourly: {
      time: hours,
      temperature_2m: hours.map((_, i) => 5 + (i % 24) / 3),
      apparent_temperature: hours.map((_, i) => 2 + (i % 24) / 3),
      precipitation_probability: hours.map(() => 80),
      precipitation: hours.map(() => 0.4),
      wind_speed_10m: hours.map(() => 20),
      weather_code: hours.map(() => 61),
    },
    daily: {
      time: days,
      temperature_2m_max: days.map(() => 12),
      temperature_2m_min: days.map(() => 4),
      apparent_temperature_max: days.map(() => 10),
      apparent_temperature_min: days.map(() => 1),
      precipitation_probability_max: days.map(() => 80),
      precipitation_sum: days.map(() => 6),
      wind_speed_10m_max: days.map(() => 25),
      weather_code: days.map(() => 61),
    },
  };
}

describe("weather", () => {
  const loc = { name: "London", latitude: 51.5, longitude: -0.12, timezone: "Europe/London", country: "UK" };

  it("works with no location and no network", async () => {
    const { days, status } = await weatherForDates([today()]);
    expect(days[today()].source).toBe("none");
    expect(status.location).toBeNull();
    expect(weatherNeeds(days[today()]).known).toBe(false);
  });

  it("summarises the forecast by time of day and turns it into clothing needs", async () => {
    saveSettings({ location: loc });
    const fetchMock = vi.fn(async (url: string) => {
      void url;
      return new Response(JSON.stringify(forecastFixture(today())), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { days } = await weatherForDates([today()]);
    const w = days[today()];
    expect(w.source).toBe("forecast");
    expect(w.periods.morning!.apparent).toBeLessThan(w.periods.afternoon!.apparent);
    const needs = weatherNeeds(w, [{ startTime: "09:00", endTime: "10:00", setting: "outdoor" }]);
    expect(needs).toMatchObject({ known: true, rainy: true, needsOuter: true, cold: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain("latitude=51.5000");
    // cached: second call doesn't hit the network
    await weatherForDates([today()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a stale cached forecast when the service is down, then to none", async () => {
    saveSettings({ location: loc });
    getDb()
      .insert(weatherCache)
      .values({ latitude: 51.5, longitude: -0.12, fetchedAt: new Date(Date.now() - 24 * 3600_000).toISOString(), payload: forecastFixture(today()) })
      .run();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 503 })));
    const res = await loadForecast(51.5, -0.12);
    expect(res.source).toBe("cached");
    expect(res.error).toMatch(/503/);
    const { days, weatherStatus } = await getDays([today()]);
    expect(days[0].weather.source).toBe("cached");
    expect(weatherStatus.error).toBeTruthy();
    getDb().delete(weatherCache).run();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{not json", { status: 200 })));
    const none = await loadForecast(51.5, -0.12);
    expect(none.source).toBe("none");
  });

  it("lets a manual override win over the forecast", async () => {
    setWeatherOverride(today(), { low: 25, high: 30, precipProbability: 0, wind: 5 });
    const { days } = await getDays([today()]);
    expect(days[0].weather.source).toBe("manual");
    expect(days[0].needs.hot).toBe(true);
    expect(() => setWeatherOverride(today(), { low: 30, high: 10, precipProbability: 0, wind: 0 })).toThrow(/low/);
  });
});

describe("local-only API guard", () => {
  const req = (url: string, init: { method?: string; headers?: Record<string, string> } = {}) => new NextRequest(url, { method: init.method ?? "GET", headers: init.headers });

  it("allows same-origin requests to localhost", () => {
    const res = proxy(req("http://127.0.0.1:3000/api/garments", { method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" } }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
  it("blocks other hosts (DNS rebinding) and cross-site writes", async () => {
    const rebind = proxy(req("http://evil.example/api/garments", { headers: { host: "evil.example" } }));
    expect(rebind.status).toBe(403);
    const csrf = proxy(req("http://localhost:3000/api/garments", { method: "POST", headers: { host: "localhost:3000", origin: "https://evil.example" } }));
    expect(csrf.status).toBe(403);
    const fetchSite = proxy(req("http://localhost:3000/api/sample", { method: "POST", headers: { host: "localhost:3000", "sec-fetch-site": "cross-site" } }));
    expect(fetchSite.status).toBe(403);
  });
});
