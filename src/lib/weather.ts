/** Weather summaries and the clothing needs derived from them. Pure and shared with the UI. */

export type Period = "morning" | "afternoon" | "evening";

export type PeriodWeather = {
  temp: number;
  apparent: number;
  precipProbability: number;
  precipitation: number;
  wind: number;
  code: number | null;
};

export type WeatherSource = "forecast" | "cached" | "manual" | "none";

export type DayWeather = {
  date: string;
  source: WeatherSource;
  /** ISO timestamp of the forecast fetch when source is forecast/cached */
  fetchedAt?: string | null;
  low: number | null;
  high: number | null;
  feelsLow: number | null;
  feelsHigh: number | null;
  precipProbability: number;
  precipitation: number;
  wind: number;
  code: number | null;
  summary: string;
  periods: Partial<Record<Period, PeriodWeather>>;
};

export const PERIOD_HOURS: Record<Period, [number, number]> = {
  morning: [7, 11],
  afternoon: [12, 17],
  evening: [18, 22],
};

const CODES: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

export function describeCode(code: number | null | undefined) {
  if (code === null || code === undefined) return "";
  return CODES[code] ?? "Mixed";
}

export function weatherIcon(code: number | null | undefined): string {
  if (code === null || code === undefined) return "·";
  if (code === 0 || code === 1) return "☀";
  if (code === 2) return "⛅";
  if (code === 3 || code === 45 || code === 48) return "☁";
  if (code >= 71 && code <= 86 && code !== 80 && code !== 81 && code !== 82) return "❄";
  if (code >= 95) return "⛈";
  return "☂";
}

export function emptyWeather(date: string): DayWeather {
  return {
    date,
    source: "none",
    low: null,
    high: null,
    feelsLow: null,
    feelsHigh: null,
    precipProbability: 0,
    precipitation: 0,
    wind: 0,
    code: null,
    summary: "No forecast",
    periods: {},
  };
}

export function manualWeather(date: string, m: { low: number; high: number; precipProbability: number; wind: number; summary?: string | null }): DayWeather {
  const rainy = m.precipProbability >= 50;
  const period = (t: number): PeriodWeather => ({
    temp: t,
    apparent: t - (m.wind > 25 ? 2 : 0),
    precipProbability: m.precipProbability,
    precipitation: rainy ? 1.5 : 0,
    wind: m.wind,
    code: rainy ? 61 : 2,
  });
  return {
    date,
    source: "manual",
    low: m.low,
    high: m.high,
    feelsLow: m.low - (m.wind > 25 ? 2 : 0),
    feelsHigh: m.high,
    precipProbability: m.precipProbability,
    precipitation: rainy ? 3 : 0,
    wind: m.wind,
    code: rainy ? 61 : 2,
    summary: m.summary || (rainy ? "Rain likely" : "Set manually"),
    periods: { morning: period(m.low + (m.high - m.low) * 0.3), afternoon: period(m.high), evening: period(m.low + (m.high - m.low) * 0.4) },
  };
}

export type ActivityTiming = { startTime?: string | null; endTime?: string | null; setting?: string | null };

function periodsFor(activities: ActivityTiming[]): Period[] {
  const out = new Set<Period>();
  for (const a of activities) {
    const startH = a.startTime ? Number(a.startTime.slice(0, 2)) : null;
    const endH = a.endTime ? Number(a.endTime.slice(0, 2)) : startH !== null ? startH + 2 : null;
    if (startH === null || endH === null) continue;
    for (const [p, [from, to]] of Object.entries(PERIOD_HOURS) as [Period, [number, number]][]) {
      if (startH <= to && endH >= from) out.add(p);
    }
  }
  return out.size ? [...out] : ["morning", "afternoon", "evening"];
}

export type WeatherNeeds = {
  known: boolean;
  feelsMin: number;
  feelsMax: number;
  /** target summed warmth of the outfit (see outfitWarmth) */
  targetWarmth: number;
  needsOuter: boolean;
  rainy: boolean;
  windy: boolean;
  snowy: boolean;
  hot: boolean;
  cold: boolean;
  /** large temperature swing – a removable layer helps */
  swing: boolean;
  mostlyOutdoors: boolean;
  notes: string[];
};

export function targetWarmthFor(feels: number) {
  if (feels >= 25) return 2.5;
  if (feels >= 21) return 3.5;
  if (feels >= 17) return 5;
  if (feels >= 13) return 6.5;
  if (feels >= 9) return 8.5;
  if (feels >= 4) return 10.5;
  return 12.5;
}

/** Turn a day's forecast plus its activities into concrete clothing needs. */
export function weatherNeeds(w: DayWeather, activities: ActivityTiming[] = []): WeatherNeeds {
  const outdoors = activities.filter((a) => a.setting === "outdoor" || a.setting === "mixed").length;
  const mostlyOutdoors = activities.length > 0 ? outdoors / activities.length >= 0.5 : false;
  if (w.source === "none" || w.low === null || w.high === null) {
    return {
      known: false,
      feelsMin: 14,
      feelsMax: 18,
      targetWarmth: 6,
      needsOuter: false,
      rainy: false,
      windy: false,
      snowy: false,
      hot: false,
      cold: false,
      swing: false,
      mostlyOutdoors,
      notes: ["No forecast available – assuming mild weather. Set the weather manually for better suggestions."],
    };
  }
  const periods = periodsFor(activities)
    .map((p) => w.periods[p])
    .filter((p): p is PeriodWeather => Boolean(p));
  const feels = periods.length ? periods.map((p) => p.apparent) : [w.feelsLow ?? w.low, w.feelsHigh ?? w.high];
  const feelsMin = Math.min(...feels);
  const feelsMax = Math.max(...feels);
  const precipProb = periods.length ? Math.max(...periods.map((p) => p.precipProbability)) : w.precipProbability;
  const precip = periods.length ? periods.reduce((s, p) => s + p.precipitation, 0) : w.precipitation;
  const wind = periods.length ? Math.max(...periods.map((p) => p.wind)) : w.wind;
  const codes = periods.map((p) => p.code ?? 0).concat(w.code ?? 0);
  const snowy = codes.some((c) => (c >= 71 && c <= 77) || c === 85 || c === 86);
  const rainy = precipProb >= 50 || precip >= 1;
  const windy = wind >= 30;
  const hot = feelsMax >= 24;
  const cold = feelsMin <= 6;
  const swing = feelsMax - feelsMin >= 7;
  // Indoors most of the day: dress for the commute but not for a full day outside.
  const effective = mostlyOutdoors ? feelsMin : feelsMin + Math.min(3, (feelsMax - feelsMin) / 2);
  const targetWarmth = targetWarmthFor(effective) + (windy ? 0.5 : 0);
  const needsOuter = effective < 13 || (rainy && precipProb >= 60) || snowy || (windy && effective < 17);
  const notes: string[] = [];
  if (cold) notes.push(`Cold – feels like ${Math.round(feelsMin)}°.`);
  else if (hot) notes.push(`Warm – up to ${Math.round(feelsMax)}°, keep layers light and breathable.`);
  if (swing) notes.push(`Swings from ${Math.round(feelsMin)}° to ${Math.round(feelsMax)}° – wear a layer you can take off.`);
  if (rainy) notes.push(`${Math.round(precipProb)}% chance of rain – water-resistant outerwear and shoes help; skip suede.`);
  if (snowy) notes.push("Snow expected – insulated outerwear and boots.");
  if (windy) notes.push(`Windy (${Math.round(wind)} km/h) – a wind-resistant outer layer.`);
  return { known: true, feelsMin, feelsMax, targetWarmth, needsOuter, rainy, windy, snowy, hot, cold, swing, mostlyOutdoors, notes };
}

/** Typical conditions by season, used only when there is no forecast or manual weather. */
export function seasonalNeeds(season: "spring" | "summer" | "autumn" | "winter", mostlyOutdoors = false): WeatherNeeds {
  const ranges = { winter: [2, 7], autumn: [8, 14], spring: [9, 16], summer: [17, 25] } as const;
  const [lo, hi] = ranges[season];
  const effective = lo + Math.min(3, (hi - lo) / 2);
  return {
    known: false,
    feelsMin: lo,
    feelsMax: hi,
    targetWarmth: targetWarmthFor(effective),
    needsOuter: effective < 13,
    rainy: false,
    windy: false,
    snowy: false,
    hot: false,
    cold: lo <= 4,
    swing: false,
    mostlyOutdoors,
    notes: [`No forecast – planning for typical ${season} weather (${lo}–${hi}°). Add a location or set the weather manually for better picks.`],
  };
}

export function formatTemp(c: number | null | undefined, units: "metric" | "imperial" = "metric") {
  if (c === null || c === undefined) return "–";
  return units === "imperial" ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°`;
}
