import { Suspense } from "react";
import { connection } from "next/server";
import { listGarments, type GarmentFilters } from "@/server/services/garments";
import { CATEGORY_LABELS, CATEGORIES, type Category } from "@/lib/domain";
import { GarmentCard } from "@/components/garment-card";
import { WardrobeToolbar } from "@/components/wardrobe-toolbar";
import { ButtonLink, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { DownloadIcon, PlusIcon, UploadIcon } from "@/components/icons";
import { OnboardingActions } from "@/components/onboarding";

export const metadata = { title: "Wardrobe" };

export default function WardrobePage(props: PageProps<"/wardrobe">) {
  return (
    <>
      <PageHeader eyebrow="Inventory" title="Wardrobe" description="Every piece you own, drawn from its details. Change availability right from the card.">
        <ButtonLink href="/wardrobe/import" variant="secondary">
          <UploadIcon size={16} /> Import
        </ButtonLink>
        <a href="/api/export/csv" className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card px-4 py-2 text-sm font-medium hover:border-ink-soft" download>
          <DownloadIcon size={16} /> CSV
        </a>
        <ButtonLink href="/wardrobe/new" variant="primary">
          <PlusIcon size={16} /> Add garment
        </ButtonLink>
      </PageHeader>
      <Suspense fallback={<GridSkeleton />}>
        <WardrobeContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} className="aspect-[5/7]" />
      ))}
    </div>
  );
}

async function WardrobeContent({ searchParams }: { searchParams: PageProps<"/wardrobe">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filters: GarmentFilters = {
    q: str("q"),
    category: str("category"),
    status: str("status"),
    availability: str("availability") as GarmentFilters["availability"],
    season: str("season"),
    sort: str("sort") as GarmentFilters["sort"],
  };
  const garments = listGarments(filters);
  const filtered = Object.values(filters).some(Boolean) && filters.sort === undefined ? true : Object.entries(filters).some(([k, v]) => k !== "sort" && v);
  if (garments.length === 0 && !filtered) {
    return (
      <EmptyState title="Your wardrobe is empty" action={<OnboardingActions />}>
        Start with a few favourite pieces – describe them in your own words, add them one by one, or load a sample wardrobe to explore.
      </EmptyState>
    );
  }
  const grouped = (filters.sort ?? "category") === "category";
  return (
    <>
      <WardrobeToolbar total={garments.length} />
      {garments.length === 0 ? (
        <EmptyState title="Nothing matches">Try a different search or clear a filter.</EmptyState>
      ) : grouped ? (
        CATEGORIES.filter((c) => garments.some((g) => g.category === c)).map((c: Category) => (
          <section key={c} className="mb-8">
            <h2 className="mb-3 flex items-baseline gap-2 text-xl font-medium">
              {CATEGORY_LABELS[c]} <span className="font-sans text-xs text-muted">{garments.filter((g) => g.category === c).length}</span>
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {garments
                .filter((g) => g.category === c)
                .map((g) => (
                  <GarmentCard key={g.id} garment={g} />
                ))}
            </div>
          </section>
        ))
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {garments.map((g) => (
            <GarmentCard key={g.id} garment={g} />
          ))}
        </div>
      )}
    </>
  );
}
