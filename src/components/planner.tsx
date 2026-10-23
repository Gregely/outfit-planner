"use client";

import type { AiUi } from "@/lib/ai-providers";
import Link from "next/link";
import { useState } from "react";
import type { DayView } from "@/server/services/plans";
import type { WeatherStatus } from "@/server/weather";
import { addDays, dayName, formatDate } from "@/lib/dates";
import { api } from "@/lib/client-api";
import { Badge, Button, ButtonLink, Field, Notice, Spinner, cx } from "./ui";
import { Modal, useMutation } from "./feedback-ui";
import { OutfitCard } from "./outfit-card";
import { ActivityList } from "./activities";
import { WeatherChip } from "./weather-chip";
import { InlineArt } from "./garment-art";
import { ChevronIcon, LockIcon, RefreshIcon, SparkIcon, ThermIcon, WandIcon } from "./icons";

type Props = {
  start: string;
  today: string;
  days: DayView[];
  weatherStatus: WeatherStatus;
  units: "metric" | "imperial";
  savedOutfits: { id: number; name: string }[];
  ai: AiUi;
};

export function PlannerWeek({ start, today, days, weatherStatus, units, savedOutfits, ai }: Props) {
  const { run, pending } = useMutation();
  const [request, setRequest] = useState("");
  const [useAi, setUseAi] = useState(ai.enabled);
  const [result, setResult] = useState<{ notice: string | null; skipped: { date: string; reason: string }[]; planned: string[] } | null>(null);
  const end = addDays(start, 6);
  const flagged = days.filter((d) => d.flags.length);
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ButtonLink size="sm" href={`/planner?start=${addDays(start, -7)}`} variant="ghost">
            <ChevronIcon dir="left" size={14} /> <span className="sr-only">Previous week</span>
          </ButtonLink>
          <h2 className="font-serif text-xl">
            {formatDate(start)} – {formatDate(end, { year: true })}
          </h2>
          <ButtonLink size="sm" href={`/planner?start=${addDays(start, 7)}`} variant="ghost">
            <ChevronIcon size={14} /> <span className="sr-only">Next week</span>
          </ButtonLink>
          {today < start || today > end ? (
            <ButtonLink size="sm" href="/planner">
              This week
            </ButtonLink>
          ) : null}
        </div>
      </div>

      <div className="card mb-5 flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <Field label="Anything to keep in mind for the week? (optional)" className="flex-1">
          <input className="input" value={request} onChange={(e) => setRequest(e.target.value)} placeholder="e.g. Keep it relaxed, I'll be on campus most days; Thursday is a presentation." />
        </Field>
        <label className={cx("flex items-center gap-2 text-sm", !ai.enabled && "text-muted")} title={ai.reason ?? undefined}>
          <input type="checkbox" className="accent-accent" checked={useAi && ai.enabled} disabled={!ai.enabled} onChange={(e) => setUseAi(e.target.checked)} />
          <SparkIcon size={14} /> {ai.label ?? "AI"}
        </label>
        <Button
          variant="accent"
          busy={pending === "week"}
          onClick={async () => {
            const r = await run("week", () => api<{ notice: string | null; skipped: { date: string; reason: string }[]; planned: string[]; source: string }>("/api/planner/week", { body: { start, useAi, request: request || undefined } }), {
              success: (r) => (r.planned.length ? `Planned ${r.planned.length} day${r.planned.length === 1 ? "" : "s"}` : null),
            });
            if (r) setResult(r);
          }}
        >
          {useAi && ai.enabled ? <SparkIcon size={15} /> : <WandIcon size={15} />} Generate the week
        </Button>
      </div>
      {pending === "week" ? (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted">
          <Spinner /> Planning around your locked days, laundry and the forecast…
        </p>
      ) : null}
      <div className="mb-5 space-y-2">
        {!ai.enabled && ai.reason ? <Notice tone="info">{ai.reason.charAt(0).toUpperCase() + ai.reason.slice(1)} – the rule-based stylist plans the week. Suggestions are marked “Rule-based”.</Notice> : null}
        {!weatherStatus.location ? (
          <Notice tone="info">
            No location set, so outfits use typical seasonal weather. <Link href="/settings" className="link">Add your location</Link> or set a day&apos;s weather by hand.
          </Notice>
        ) : weatherStatus.error ? (
          <Notice tone="warning">
            Forecast unavailable ({weatherStatus.error}). {weatherStatus.source === "cached" ? "Using the last forecast we saved." : "Set a day's weather by hand if it matters."}
          </Notice>
        ) : null}
        {result?.notice ? <Notice tone="info">{result.notice}</Notice> : null}
        {result?.skipped.length ? (
          <p className="text-xs text-muted">
            Left as they were: {result.skipped.map((s) => `${dayName(s.date, true)} (${s.reason})`).join(", ")}.
          </p>
        ) : null}
        {flagged.length ? (
          <Notice tone="warning">
            {flagged.length === 1 ? "One planned outfit needs" : `${flagged.length} planned outfits need`} attention because a garment became unavailable. Tap the flagged piece to swap just that item.
          </Notice>
        ) : null}
      </div>

      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {days.map((d) => (
          <DayCard key={d.date} day={d} today={today} units={units} savedOutfits={savedOutfits} ai={ai} useAi={useAi} />
        ))}
      </div>
    </div>
  );
}

function DayCard({ day, today, units, savedOutfits, ai, useAi }: { day: DayView; today: string; units: "metric" | "imperial"; savedOutfits: { id: number; name: string }[]; ai: { enabled: boolean }; useAi: boolean }) {
  const { run, pending } = useMutation();
  const [weatherOpen, setWeatherOpen] = useState(false);
  const locked = Boolean(day.plan?.locked);
  const past = day.date < today;
  const isToday = day.date === today;
  return (
    <article className={cx("card flex flex-col", isToday && "ring-2 ring-accent/40", past && !day.worn && "opacity-75")} aria-label={formatDate(day.date, { weekday: true })} data-testid={`day-${day.date}`}>
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="eyebrow">{isToday ? "Today" : dayName(day.date)}</p>
          <p className="font-serif text-lg leading-tight">{formatDate(day.date)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button type="button" onClick={() => setWeatherOpen(true)} className="rounded-md px-1 hover:bg-paper-deep" title="Set the weather by hand">
            <WeatherChip w={day.weather} units={units} />
          </button>
          <div className="flex items-center gap-1">
            {day.worn ? <Badge tone="moss">Worn</Badge> : null}
            <button
              type="button"
              aria-pressed={locked}
              aria-label={locked ? "Unlock day" : "Lock day"}
              disabled={pending !== null}
              onClick={() => run("lock", () => api(`/api/planner/day/${day.date}`, { method: "PATCH", body: { locked: !locked } }), { success: locked ? "Unlocked" : "Locked – it won't be regenerated" })}
              className={cx("rounded-full p-1.5 transition", locked ? "bg-ink text-paper" : "text-muted hover:bg-paper-deep")}
            >
              <LockIcon open={!locked} size={15} />
            </button>
          </div>
        </div>
      </header>
      <div className="space-y-3 px-4 py-3">
        {day.needs.known && day.needs.notes.length ? <p className="text-xs leading-relaxed text-muted">{day.needs.notes.join(" ")}</p> : null}
        <ActivityList date={day.date} activities={day.activities} ai={ai} />
      </div>
      <div className="mt-auto space-y-2 px-3 pb-3">
        {day.worn ? (
          <div className="rounded-xl bg-moss-soft/50 p-3">
            <p className="mb-2 text-xs font-medium text-moss">What you wore{day.worn.outfitName ? ` · ${day.worn.outfitName}` : ""}</p>
            <div className="flex flex-wrap gap-1.5">
              {day.worn.items.map((i, idx) => (
                <div key={idx} className="h-14 w-12" title={i.snapshot.name}>
                  <InlineArt input={i.snapshot} className="h-full w-full" label={i.snapshot.name} />
                </div>
              ))}
            </div>
            {day.outfit && day.worn.outfitId !== day.outfit.id ? <p className="mt-2 text-xs text-muted">Planned: {day.outfit.name}</p> : null}
          </div>
        ) : day.outfit ? (
          <OutfitCard outfit={day.outfit} dayDate={day.date} today={today} compact hidePlan />
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">Nothing planned yet.</div>
        )}
        {!day.worn ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              disabled={locked || past}
              title={locked ? "Unlock the day to regenerate" : past ? "This day has passed" : undefined}
              busy={pending === "regen"}
              onClick={() =>
                run("regen", () => api<{ notice: string | null }>(`/api/planner/day/${day.date}/regenerate`, { body: { useAi } }), {
                  success: (r) => r.notice ?? (day.outfit ? "New outfit for this day – other days unchanged" : "Planned"),
                })
              }
            >
              <RefreshIcon size={14} /> {day.outfit ? "Regenerate" : "Suggest"}
            </Button>
            {savedOutfits.length ? (
              <select
                aria-label="Use a saved outfit"
                className="input w-auto max-w-[11rem] py-1 text-xs"
                value=""
                disabled={pending !== null}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) run("assign", () => api(`/api/planner/day/${day.date}`, { method: "PATCH", body: { outfitId: id } }), { success: "Outfit placed on this day" });
                }}
              >
                <option value="">Use a saved outfit…</option>
                {savedOutfits.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : null}
            {day.outfit && !locked ? (
              <Button size="sm" variant="ghost" onClick={() => run("clear", () => api(`/api/planner/day/${day.date}`, { method: "PATCH", body: { outfitId: null } }), { success: "Cleared" })}>
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <WeatherDialog open={weatherOpen} onClose={() => setWeatherOpen(false)} day={day} />
    </article>
  );
}

function WeatherDialog({ open, onClose, day }: { open: boolean; onClose: () => void; day: DayView }) {
  const o = day.plan?.weatherOverride;
  const [low, setLow] = useState(String(o?.low ?? Math.round(day.weather.low ?? 10)));
  const [high, setHigh] = useState(String(o?.high ?? Math.round(day.weather.high ?? 16)));
  const [rain, setRain] = useState(String(o?.precipProbability ?? Math.round(day.weather.precipProbability)));
  const [wind, setWind] = useState(String(o?.wind ?? Math.round(day.weather.wind || 10)));
  const { run, pending } = useMutation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Weather for ${formatDate(day.date, { weekday: true })}`}
      footer={
        <>
          {o ? (
            <Button variant="ghost" onClick={async () => (await run("clearw", () => api(`/api/planner/day/${day.date}`, { method: "PATCH", body: { weatherOverride: null } }), { success: "Back to the forecast" })) && onClose()}>
              Use forecast
            </Button>
          ) : null}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={pending === "w"}
            onClick={async () => {
              const r = await run(
                "w",
                () => api(`/api/planner/day/${day.date}`, { method: "PATCH", body: { weatherOverride: { low: Number(low), high: Number(high), precipProbability: Number(rain), wind: Number(wind) } } }),
                { success: "Weather set – regenerate the day to dress for it" },
              );
              if (r) onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="mb-3 flex items-center gap-2 text-sm text-muted">
        <ThermIcon size={16} /> Overrides the forecast for this day only (°C, %, km/h).
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Low °C">
          <input type="number" className="input" value={low} onChange={(e) => setLow(e.target.value)} />
        </Field>
        <Field label="High °C">
          <input type="number" className="input" value={high} onChange={(e) => setHigh(e.target.value)} />
        </Field>
        <Field label="Chance of rain %">
          <input type="number" min={0} max={100} className="input" value={rain} onChange={(e) => setRain(e.target.value)} />
        </Field>
        <Field label="Wind km/h">
          <input type="number" min={0} className="input" value={wind} onChange={(e) => setWind(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
