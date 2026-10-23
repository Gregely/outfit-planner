import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import { dayPlans, weatherCache } from "@/server/db/schema";
import { getSettings } from "@/server/services/settings";
import { describeCode, emptyWeather, manualWeather, PERIOD_HOURS, type DayWeather, type Period, type PeriodWeather } from "@/lib/weather";
import { fetchForecast, forecastSchema, WeatherUnavailableError, type Forecast } from "./open-meteo";

const FRESH_MS = 3 * 60 * 60 * 1000;

const round = (n: number) => Math.round(n * 100) / 100;

type Cached = { forecast: Forecast; fetchedAt: string; stale: boolean } | null;

function readCache(lat: number, lon: number): Cached {
  const row = getDb()
    .select()
    .from(weatherCache)
    .where(and(eq(weatherCache.latitude, round(lat)), eq(weatherCache.longitude, round(lon))))
    .get();
  if (!row) return null;
  const parsed = forecastSchema.safeParse(row.payload);
  if (!parsed.success) return null;
  return { forecast: parsed.data, fetchedAt: row.fetchedAt, stale: Date.now() - Date.parse(row.fetchedAt) > FRESH_MS };
}

function writeCache(lat: number, lon: number, forecast: Forecast) {
  const fetchedAt = new Date().toISOString();
  getDb()
    .insert(weatherCache)
    .values({ latitude: round(lat), longitude: round(lon), fetchedAt, payload: forecast })
    .onConflictDoUpdate({ target: [weatherCache.latitude, weatherCache.longitude], set: { fetchedAt, payload: forecast } })
    .run();
  return fetchedAt;
}

export type ForecastResult = { forecast: Forecast | null; fetchedAt: string | null; source: "forecast" | "cached" | "none"; error?: string };

/** Fresh cache → network → stale cache → nothing. Never throws. */
export async function loadForecast(lat: number, lon: number, opts: { force?: boolean } = {}): Promise<ForecastResult> {
  const cached = readCache(lat, lon);
  if (cached && !cached.stale && !opts.force) return { forecast: cached.forecast, fetchedAt: cached.fetchedAt, source: "forecast" };
  try {
    const forecast = await fetchForecast(lat, lon);
    const fetchedAt = writeCache(lat, lon, forecast);
    return { forecast, fetchedAt, source: "forecast" };
  } catch (err) {
    const message = err instanceof WeatherUnavailableError ? err.message : "Weather lookup failed";
    if (cached) return { forecast: cached.forecast, fetchedAt: cached.fetchedAt, source: "cached", error: message };
    return { forecast: null, fetchedAt: null, source: "none", error: message };
  }
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function summariseDay(forecast: Forecast, date: string): Omit<DayWeather, "source" | "fetchedAt"> | null {
  const di = forecast.daily.time.indexOf(date);
  if (di < 0) return null;
  const d = forecast.daily;
  const periods: Partial<Record<Period, PeriodWeather>> = {};
  for (const [p, [from, to]] of Object.entries(PERIOD_HOURS) as [Period, [number, number]][]) {
    const idx: number[] = [];
    forecast.hourly.time.forEach((t, i) => {
      if (!t.startsWith(date)) return;
      const h = Number(t.slice(11, 13));
      if (h >= from && h <= to) idx.push(i);
    });
    const pick = (arr: (number | null)[]) => idx.map((i) => arr[i]).filter((v): v is number => v !== null);
    const temps = pick(forecast.hourly.temperature_2m);
    if (temps.length === 0) continue;
    const apparent = pick(forecast.hourly.apparent_temperature);
    const codes = pick(forecast.hourly.weather_code);
    periods[p] = {
      temp: avg(temps),
      apparent: apparent.length ? Math.min(...apparent) : avg(temps),
      precipProbability: Math.max(0, ...pick(forecast.hourly.precipitation_probability)),
      precipitation: pick(forecast.hourly.precipitation).reduce((s, v) => s + v, 0),
      wind: Math.max(0, ...pick(forecast.hourly.wind_speed_10m)),
      code: codes.length ? Math.max(...codes) : null,
    };
  }
  const low = d.temperature_2m_min[di];
  const high = d.temperature_2m_max[di];
  if (low === null || high === null) return null;
  const code = d.weather_code[di];
  return {
    date,
    low,
    high,
    feelsLow: d.apparent_temperature_min[di] ?? low,
    feelsHigh: d.apparent_temperature_max[di] ?? high,
    precipProbability: d.precipitation_probability_max[di] ?? 0,
    precipitation: d.precipitation_sum[di] ?? 0,
    wind: d.wind_speed_10m_max[di] ?? 0,
    code,
    summary: describeCode(code),
    periods,
  };
}

export type WeatherStatus = { source: "forecast" | "cached" | "none"; fetchedAt: string | null; error?: string; location: string | null };

/** Weather for each date: manual override → forecast (or stale cache) → none. */
export async function weatherForDates(dates: string[], opts: { force?: boolean } = {}): Promise<{ days: Record<string, DayWeather>; status: WeatherStatus }> {
  const settings = getSettings();
  const overrides = new Map(
    dates.length
      ? getDb()
          .select({ date: dayPlans.date, w: dayPlans.weatherOverride })
          .from(dayPlans)
          .where(inArray(dayPlans.date, dates))
          .all()
          .filter((r) => r.w)
          .map((r) => [r.date, r.w!])
      : [],
  );
  let result: ForecastResult = { forecast: null, fetchedAt: null, source: "none" };
  if (settings.location && dates.some((d) => !overrides.has(d))) {
    result = await loadForecast(settings.location.latitude, settings.location.longitude, opts);
  }
  const days: Record<string, DayWeather> = {};
  for (const date of dates) {
    const o = overrides.get(date);
    if (o) {
      days[date] = manualWeather(date, o);
      continue;
    }
    const s = result.forecast ? summariseDay(result.forecast, date) : null;
    days[date] = s ? { ...s, source: result.source === "cached" ? "cached" : "forecast", fetchedAt: result.fetchedAt } : emptyWeather(date);
  }
  return {
    days,
    status: { source: result.source, fetchedAt: result.fetchedAt, error: settings.location ? result.error : undefined, location: settings.location?.name ?? null },
  };
}
