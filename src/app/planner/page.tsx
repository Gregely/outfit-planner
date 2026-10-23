import { Suspense } from "react";
import { connection } from "next/server";
import { getWeek } from "@/server/services/plans";
import { getSettings, today } from "@/server/services/settings";
import { listOutfits } from "@/server/services/outfits";
import { listGarments } from "@/server/services/garments";
import { aiStatus, REASON_TEXT } from "@/server/ai/client";
import { isDateString, startOfWeek } from "@/lib/dates";
import { PageHeader, Skeleton, EmptyState } from "@/components/ui";
import { PlannerWeek } from "@/components/planner";
import { OnboardingActions } from "@/components/onboarding";

export const metadata = { title: "Planner" };

export default function PlannerPage(props: PageProps<"/planner">) {
  return (
    <>
      <PageHeader eyebrow="The week ahead" title="Planner" description="Plan a cohesive week around the forecast and your plans. Lock the days you love; regenerating one day leaves the rest alone." />
      <Suspense fallback={<Skeleton className="h-[40rem]" />}>
        <PlannerContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function PlannerContent({ searchParams }: { searchParams: PageProps<"/planner">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  if (listGarments().length === 0) return <EmptyState title="Add some clothes first" action={<OnboardingActions />}>The planner builds outfits only from garments you own.</EmptyState>;
  const settings = getSettings();
  const t = today();
  const requested = typeof sp.start === "string" && isDateString(sp.start) ? sp.start : t;
  const start = settings.plannerStart === "today" ? requested : startOfWeek(requested, settings.plannerStart === "sunday" ? 0 : 1);
  const { days, weatherStatus } = await getWeek(start);
  const ai = aiStatus();
  const saved = listOutfits({ view: "saved" }).map((o) => ({ id: o.id, name: o.name }));
  return (
    <PlannerWeek
      start={start}
      today={t}
      days={days}
      weatherStatus={weatherStatus}
      units={settings.units}
      savedOutfits={saved}
      ai={{ enabled: ai.enabled, reason: ai.reason ? REASON_TEXT[ai.reason] : null }}
    />
  );
}
