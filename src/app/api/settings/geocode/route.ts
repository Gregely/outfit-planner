import { route } from "@/server/api";
import { geocode, WeatherUnavailableError } from "@/server/weather/open-meteo";
import { AppError } from "@/server/errors";

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return { results: await geocode(q) };
  } catch (err) {
    if (err instanceof WeatherUnavailableError) throw new AppError(502, "Location search is unavailable right now. You can still enter coordinates manually.");
    throw err;
  }
});
