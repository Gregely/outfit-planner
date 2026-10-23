import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getDays } from "@/server/services/plans";
import { listGarments } from "@/server/services/garments";
import { listOutfits } from "@/server/services/outfits";
import { getSettings, today } from "@/server/services/settings";
import { aiStatus } from "@/server/ai/client";
import { addDays, dayName, formatDate } from "@/lib/dates";
import { formatTemp, weatherIcon } from "@/lib/weather";
import { LAUNDRY_STATUSES } from "@/lib/domain";
import { ButtonLink, EmptyState, Notice, Skeleton } from "@/components/ui";
import { OutfitCard } from "@/components/outfit-card";
import { ActivityList } from "@/components/activities";
import { TodayActions } from "@/components/today-actions";
import { OutfitBoard } from "@/components/outfit-board";
import { OnboardingActions } from "@/components/onboarding";
import { CalendarIcon, SparkIcon, WashIcon } from "@/components/icons";

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-72" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

async function Home() {
  await connection();
  const garments = listGarments();
  const t = today();
  const settings = getSettings();
  if (garments.length === 0) {
    return (
      <div className="mx-auto max-w-3xl py-6">
        <p className="eyebrow">Welcome</p>
        <h1 className="mt-1 text-4xl font-medium sm:text-5xl">
          Your wardrobe, <span className="text-accent italic">considered.</span>
        </h1>
        <p className="mt-4 max-w-xl text-ink-soft">
          Wardrobe Studio keeps a record of the clothes you actually own, draws each piece, and helps you decide what to wear – around the weather, your plans and what&apos;s in the wash.
        </p>
        <div className="mt-8">
          <EmptyState title="Start with a few pieces" icon={<SparkIcon size={36} />} action={<OnboardingActions />}>
            You don&apos;t need to catalogue everything at once. Describe three or four favourites and add the rest as you go.
          </EmptyState>
        </div>
        <ol className="mt-8 grid gap-4 text-sm sm:grid-cols-3">
          {[
            ["1", "Describe your clothes", "Write naturally – each garment becomes its own record for you to review."],
            ["2", "Set your location", "Forecasts shape layers, outerwear and shoes. Optional."],
            ["3", "Plan the week", "Lock favourites, regenerate a day, swap a single piece."],
          ].map(([n, title, body]) => (
            <li key={n} className="card p-4">
              <span className="font-serif text-2xl text-accent">{n}</span>
              <p className="mt-1 font-medium">{title}</p>
              <p className="mt-1 text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  const dates = Array.from({ length: 7 }, (_, i) => addDays(t, i));
  const { days, weatherStatus } = await getDays(dates);
  const todayView = days[0];
  const upcoming = days.slice(1);
  const laundry = garments.filter((g) => LAUNDRY_STATUSES.includes(g.status));
  const available = garments.filter((g) => g.available).length;
  const favourites = listOutfits({ view: "favourites" }).slice(0, 3);
  const ai = aiStatus();
  const w = todayView.weather;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <>
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{formatDate(t, { weekday: true, year: true })}</p>
          <h1 className="text-3xl font-medium sm:text-4xl">{greeting}.</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted">
          <span>
            {available} of {garments.length} pieces ready
          </span>
          {laundry.length ? (
            <Link href="/laundry" className="link">
              {laundry.length} in the laundry
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section aria-labelledby="today-outfit">
          <h2 id="today-outfit" className="mb-3 text-xl font-medium">
            Today&apos;s outfit
          </h2>
          {todayView.worn ? (
            <Notice tone="success">
              Logged as worn today{todayView.worn.outfitName ? ` – ${todayView.worn.outfitName}` : ""}. See it in <Link className="link" href="/outfits?view=history">your history</Link>.
            </Notice>
          ) : todayView.outfit ? (
            <OutfitCard outfit={todayView.outfit} dayDate={t} today={t} hidePlan />
          ) : (
            <div className="card p-6 text-center">
              <p className="font-serif text-xl">Nothing planned for today yet.</p>
              <p className="mt-1 text-sm text-muted">Get a suggestion based on the weather and your plans, or pick one yourself.</p>
              <div className="mt-4">
                <TodayActions date={t} useAi={ai.enabled} />
              </div>
            </div>
          )}
          {todayView.outfit && !todayView.worn ? (
            <div className="mt-3">
              <TodayActions date={t} useAi={ai.enabled} regenerate locked={Boolean(todayView.plan?.locked)} />
            </div>
          ) : null}
        </section>

        <div className="space-y-6">
          <section className="card p-5" aria-label="Weather">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">{weatherStatus.location ?? "Weather"}</p>
                {w.source === "none" ? (
                  <p className="mt-1 text-sm text-muted">
                    {weatherStatus.location ? "Forecast unavailable right now." : "No location set."}{" "}
                    <Link href="/settings" className="link">
                      {weatherStatus.location ? "Settings" : "Add your location"}
                    </Link>{" "}
                    or set today&apos;s weather in the planner.
                  </p>
                ) : (
                  <>
                    <p className="mt-1 font-serif text-4xl">
                      {formatTemp(w.high, settings.units)} <span className="text-xl text-muted">/ {formatTemp(w.low, settings.units)}</span>
                    </p>
                    <p className="text-sm text-ink-soft">
                      {w.summary}
                      {w.precipProbability >= 20 ? ` · ${Math.round(w.precipProbability)}% rain` : ""} · wind {Math.round(w.wind)} km/h
                    </p>
                  </>
                )}
              </div>
              {w.source !== "none" ? (
                <span className="text-4xl" aria-hidden="true">
                  {weatherIcon(w.code)}
                </span>
              ) : null}
            </div>
            {todayView.needs.known && todayView.needs.notes.length ? <p className="mt-3 text-xs leading-relaxed text-muted">{todayView.needs.notes.join(" ")}</p> : null}
            {w.source === "cached" ? <p className="mt-2 text-xs text-[#7a5d26]">Showing the last saved forecast – the weather service couldn&apos;t be reached.</p> : null}
            {w.source === "manual" ? <p className="mt-2 text-xs text-muted">Set by hand in the planner.</p> : null}
          </section>

          <section className="card p-5" aria-label="Today's plans">
            <p className="eyebrow mb-2">Today&apos;s plans</p>
            <ActivityList date={t} activities={todayView.activities} ai={{ enabled: ai.enabled }} />
          </section>

          {laundry.length ? (
            <Link href="/laundry" className="card flex items-center gap-3 p-4 hover:border-ink-soft">
              <WashIcon size={22} />
              <span className="text-sm">
                <span className="font-medium">{laundry.length} item{laundry.length === 1 ? "" : "s"}</span> waiting in the laundry
              </span>
            </Link>
          ) : null}
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-xl font-medium">Coming up</h2>
          <ButtonLink href="/planner" size="sm">
            <CalendarIcon size={14} /> Open planner
          </ButtonLink>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {upcoming.map((d) => (
            <Link key={d.date} href={`/planner?start=${d.date}`} className="card flex flex-col p-3 transition hover:border-ink-soft">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{dayName(d.date, true)}</span>
                <span className="text-xs text-muted">{d.weather.source === "none" ? "" : `${weatherIcon(d.weather.code)} ${formatTemp(d.weather.high, settings.units)}`}</span>
              </div>
              <span className="text-xs text-muted">{formatDate(d.date)}</span>
              <div className="mt-2">
                {d.outfit ? (
                  <OutfitBoard items={d.outfit.items} flagIds={d.outfit.unavailableGarmentIds} className="p-1" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-muted">Not planned</div>
                )}
              </div>
              {d.flags.length ? <span className="mt-1 text-[0.68rem] text-danger">Needs a swap</span> : null}
              {d.activities.length ? <span className="mt-1 truncate text-[0.68rem] text-muted">{d.activities.map((a) => a.title).join(" · ")}</span> : null}
            </Link>
          ))}
        </div>
      </section>

      {favourites.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-medium">Favourites</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {favourites.map((o) => (
              <OutfitCard key={o.id} outfit={o} compact today={t} />
            ))}
          </div>
        </section>
      ) : null}

      {garments.length < 8 ? (
        <section className="mt-10">
          <Notice tone="info">
            Your wardrobe has {garments.length} piece{garments.length === 1 ? "" : "s"}. Suggestions get better with more to choose from –{" "}
            <Link className="link" href="/wardrobe/import">
              add a few more
            </Link>{" "}
            when you have a minute.
          </Notice>
        </section>
      ) : null}
    </>
  );
}
