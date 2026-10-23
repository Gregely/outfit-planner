import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { listOutfits, type OutfitFilters } from "@/server/services/outfits";
import { listGarments } from "@/server/services/garments";
import { listWearLogs } from "@/server/services/wear";
import { today } from "@/server/services/settings";
import { aiUi } from "@/server/ai/client";
import { ButtonLink, EmptyState, PageHeader, Skeleton, cx } from "@/components/ui";
import { OutfitCard } from "@/components/outfit-card";
import { StylistPanel } from "@/components/stylist-panel";
import { WearHistory } from "@/components/wear-history";
import { OnboardingActions } from "@/components/onboarding";
import { PlusIcon, SparkIcon } from "@/components/icons";

export const metadata = { title: "Outfits" };

const VIEWS = [
  ["saved", "Saved"],
  ["favourites", "Favourites"],
  ["suggestions", "Recent suggestions"],
  ["history", "Worn history"],
  ["archived", "Archived"],
] as const;

export default function OutfitsPage(props: PageProps<"/outfits">) {
  return (
    <>
      <PageHeader eyebrow="Your looks" title="Outfits" description="Ask for ideas, keep the ones you love, and see what you've actually worn.">
        <ButtonLink href="/outfits/new">
          <PlusIcon size={16} /> Build one yourself
        </ButtonLink>
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <OutfitsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function OutfitsContent({ searchParams }: { searchParams: PageProps<"/outfits">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const view = (typeof sp.view === "string" ? sp.view : "saved") as (typeof VIEWS)[number][0];
  const garments = listGarments();
  if (garments.length === 0) {
    return (
      <EmptyState title="Add some clothes first" icon={<SparkIcon size={36} />} action={<OnboardingActions />}>
        The stylist only ever uses garments you own. Add a few pieces to get started.
      </EmptyState>
    );
  }
  const t = today();
  const ai = aiUi("daily");
  const outfits = view === "history" ? [] : listOutfits({ view: view as OutfitFilters["view"] });
  const logs = view === "history" ? listWearLogs({ limit: 90 }) : [];
  return (
    <>
      <StylistPanel garments={garments.map((g) => ({ id: g.id, name: g.name, available: g.available }))} today={t} ai={ai} />
      <nav aria-label="Outfit collections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {VIEWS.map(([v, label]) => (
          <Link
            key={v}
            href={`/outfits${v === "saved" ? "" : `?view=${v}`}`}
            scroll={false}
            aria-current={view === v ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap", view === v ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink")}
          >
            {label}
          </Link>
        ))}
      </nav>
      {view === "history" ? (
        logs.length ? <WearHistory logs={logs} /> : <EmptyState title="Nothing logged yet">Use “Wore it” on any outfit to start your history.</EmptyState>
      ) : outfits.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {outfits.map((o) => (
            <OutfitCard key={o.id} outfit={o} today={t} />
          ))}
        </div>
      ) : (
        <EmptyState title={view === "saved" ? "No saved outfits yet" : "Nothing here yet"}>
          {view === "saved" ? "Ask the stylist above, then press Save on the looks you like." : "Outfits will appear here as you use the app."}
        </EmptyState>
      )}
    </>
  );
}
