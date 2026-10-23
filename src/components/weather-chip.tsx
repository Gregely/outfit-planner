import type { DayWeather } from "@/lib/weather";
import { formatTemp, weatherIcon } from "@/lib/weather";
import { cx } from "./ui";

export function WeatherChip({ w, units, className }: { w: DayWeather; units: "metric" | "imperial"; className?: string }) {
  if (w.source === "none") return <span className={cx("text-xs text-muted", className)}>No forecast</span>;
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs text-ink-soft", className)} title={w.summary}>
      <span aria-hidden="true" className="text-base leading-none">
        {weatherIcon(w.code)}
      </span>
      <span>
        {formatTemp(w.low, units)}–{formatTemp(w.high, units)}
      </span>
      {w.precipProbability >= 20 ? <span className="text-sky">☂ {Math.round(w.precipProbability)}%</span> : null}
      {w.source !== "forecast" ? <span className="rounded bg-paper-deep px-1 text-[0.6rem] uppercase">{w.source}</span> : null}
    </span>
  );
}
