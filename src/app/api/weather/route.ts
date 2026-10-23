import { route } from "@/server/api";
import { weatherForDates } from "@/server/weather";
import { today } from "@/server/services/settings";
import { weekDates } from "@/lib/dates";

export const GET = route(async (req) => {
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  return weatherForDates(weekDates(today()), { force });
});
