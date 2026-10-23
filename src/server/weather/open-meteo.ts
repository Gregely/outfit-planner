import "server-only";
import { z } from "zod";

/**
 * Open-Meteo client. Free, no API key. Docs: https://open-meteo.com/en/docs and
 * https://open-meteo.com/en/docs/geocoding-api
 */

const FORECAST_URL = process.env.OPEN_METEO_FORECAST_URL || "https://api.open-meteo.com/v1/forecast";
const GEOCODE_URL = process.env.OPEN_METEO_GEOCODING_URL || "https://geocoding-api.open-meteo.com/v1/search";
const TIMEOUT_MS = 8000;

export class WeatherUnavailableError extends Error {}

const num = z.number().nullable();
export const forecastSchema = z.object({
  timezone: z.string(),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(num),
    apparent_temperature: z.array(num),
    precipitation_probability: z.array(num),
    precipitation: z.array(num),
    wind_speed_10m: z.array(num),
    weather_code: z.array(num),
  }),
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(num),
    temperature_2m_min: z.array(num),
    apparent_temperature_max: z.array(num),
    apparent_temperature_min: z.array(num),
    precipitation_probability_max: z.array(num),
    precipitation_sum: z.array(num),
    wind_speed_10m_max: z.array(num),
    weather_code: z.array(num),
  }),
});
export type Forecast = z.infer<typeof forecastSchema>;

async function getJson(url: string) {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" }, cache: "no-store" });
  } catch (err) {
    throw new WeatherUnavailableError(`Weather service unreachable: ${(err as Error).message}`);
  }
  if (!res.ok) throw new WeatherUnavailableError(`Weather service responded ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new WeatherUnavailableError("Weather service returned invalid JSON");
  }
}

export async function fetchForecast(latitude: number, longitude: number): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,precipitation,wind_speed_10m,weather_code",
    daily:
      "temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,weather_code",
    timezone: "auto",
    forecast_days: "16",
    past_days: "1",
    wind_speed_unit: "kmh",
  });
  const json = await getJson(`${FORECAST_URL}?${params}`);
  const parsed = forecastSchema.safeParse(json);
  if (!parsed.success) throw new WeatherUnavailableError("Weather service returned an unexpected format");
  return parsed.data;
}

const geocodeSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string().optional(),
        country: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});

export type GeocodeResult = { name: string; latitude: number; longitude: number; timezone: string; country: string | null };

export async function geocode(query: string): Promise<GeocodeResult[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const params = new URLSearchParams({ name: q, count: "6", language: "en", format: "json" });
  const json = await getJson(`${GEOCODE_URL}?${params}`);
  const parsed = geocodeSchema.safeParse(json);
  if (!parsed.success) throw new WeatherUnavailableError("Geocoding returned an unexpected format");
  return (parsed.data.results ?? []).map((r) => ({
    name: [r.name, r.admin1].filter(Boolean).join(", "),
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone ?? "UTC",
    country: r.country ?? null,
  }));
}
