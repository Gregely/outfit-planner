import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getGarment, wearHistory } from "@/server/services/garments";
import { outfitsWithGarment } from "@/server/services/outfits";
import { today } from "@/server/services/settings";
import { NotFoundError } from "@/server/errors";
import { CATEGORY_LABELS, FORMALITY_LABELS, LAYERING_LABELS, STATUS_LABELS, WARMTH_LABELS, defaultLayeringRole } from "@/lib/domain";
import { formatDate } from "@/lib/dates";
import { GarmentArt, GarmentPhoto } from "@/components/garment-art";
import { StatusSelect } from "@/components/garment-card";
import { GarmentActions } from "@/components/garment-actions";
import { OutfitCard } from "@/components/outfit-card";
import { Badge, ColourChip, Section, Skeleton } from "@/components/ui";
import { ChevronIcon } from "@/components/icons";

export default function GarmentPage(props: PageProps<"/wardrobe/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem]" />}>
      <GarmentDetail params={props.params} />
    </Suspense>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 border-b border-line py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

async function GarmentDetail({ params }: { params: PageProps<"/wardrobe/[id]">["params"] }) {
  const { id } = await params;
  await connection();
  let g;
  try {
    g = getGarment(Number(id));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const history = wearHistory(g.id);
  const outfits = outfitsWithGarment(g.id, 6);
  const t = today();
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : <span className="text-muted">—</span>);
  return (
    <>
      <Link href="/wardrobe" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronIcon dir="left" size={14} /> Wardrobe
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          <div className="card aspect-[5/6] bg-gradient-to-b from-white to-paper p-6">
            <GarmentArt garment={g} />
          </div>
          {g.photoFile ? (
            <div className="card aspect-square overflow-hidden">
              <GarmentPhoto file={g.photoFile} alt={`Photo of ${g.name}`} />
            </div>
          ) : null}
        </div>
        <div>
          <p className="eyebrow">{CATEGORY_LABELS[g.category]}{g.subcategory ? ` · ${g.subcategory}` : ""}</p>
          <h1 className="mt-1 text-3xl font-medium sm:text-4xl">{g.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusSelect garment={g} />
            <Badge>{g.wearCount} wear{g.wearCount === 1 ? "" : "s"}</Badge>
            {g.lastWornOn ? <Badge>Last worn {formatDate(g.lastWornOn, { weekday: true })}</Badge> : <Badge>Not worn yet</Badge>}
            {g.care.washAfterWears > 0 ? <Badge tone="sky">Washed after {g.care.washAfterWears} wear{g.care.washAfterWears === 1 ? "" : "s"} · {g.wearsSinceWash} so far</Badge> : <Badge tone="sky">Washed when you decide</Badge>}
          </div>
          <GarmentActions garment={g} />
          <dl className="card mt-5 px-4 py-1">
            <Row label="Colours">
              <span className="flex flex-wrap gap-1">{g.colours.length ? g.colours.map((c, i) => <ColourChip key={i} {...c} />) : <span className="text-muted">—</span>}</span>
            </Row>
            <Row label="Pattern">{g.pattern}</Row>
            <Row label="Materials">{list(g.materials)}</Row>
            <Row label="Fit">{[g.fit, g.silhouette].filter(Boolean).join(" · ") || <span className="text-muted">—</span>}</Row>
            <Row label="Layering">{LAYERING_LABELS[g.layeringRole ?? defaultLayeringRole(g.category, g.subcategory)]}</Row>
            <Row label="Warmth">{WARMTH_LABELS[g.warmth]} ({g.warmth}/5)</Row>
            <Row label="Formality">{FORMALITY_LABELS[g.formality]} ({g.formality}/5)</Row>
            <Row label="Seasons">{list(g.seasons)}</Row>
            <Row label="Weather">{list(g.weather)}</Row>
            <Row label="Occasions">{list(g.occasions)}</Row>
            <Row label="Style">{list(g.styleTags)}</Row>
            <Row label="Brand">{g.brand ?? <span className="text-muted">—</span>}</Row>
            <Row label="Status">{STATUS_LABELS[g.status]}</Row>
            {g.notes ? <Row label="Notes">{g.notes}</Row> : null}
          </dl>
        </div>
      </div>

      <Section title="Wear history" className="mt-10">
        {history.length ? (
          <ul className="card divide-y divide-line">
            {history.slice(0, 20).map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{formatDate(h.date, { weekday: true, year: true })}</span>
                {h.outfitId ? (
                  <Link className="link text-muted" href={`/outfits/${h.outfitId}`}>
                    {h.outfitName || "Outfit"}
                  </Link>
                ) : (
                  <span className="text-muted">{h.outfitName || "—"}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No wears logged yet.</p>
        )}
      </Section>

      <Section title="Saved outfits with this piece">
        {outfits.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {outfits.map((o) => (
              <OutfitCard key={o.id} outfit={o} compact today={t} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">None saved yet – try “Style this piece”.</p>
        )}
      </Section>
    </>
  );
}
