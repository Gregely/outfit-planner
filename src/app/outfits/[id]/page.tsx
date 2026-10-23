import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getOutfit } from "@/server/services/outfits";
import { listWearLogs } from "@/server/services/wear";
import { today } from "@/server/services/settings";
import { NotFoundError } from "@/server/errors";
import { FEEDBACK_LABELS } from "@/lib/domain";
import { formatDate } from "@/lib/dates";
import { OutfitCard } from "@/components/outfit-card";
import { Badge, Section, Skeleton } from "@/components/ui";
import { ChevronIcon } from "@/components/icons";

export default function OutfitPage(props: PageProps<"/outfits/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <OutfitDetail params={props.params} />
    </Suspense>
  );
}

async function OutfitDetail({ params }: { params: PageProps<"/outfits/[id]">["params"] }) {
  const { id } = await params;
  await connection();
  let o;
  try {
    o = getOutfit(Number(id));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const worn = listWearLogs({ limit: 300 }).filter((l) => l.outfitId === o.id);
  const ctx = o.context ?? {};
  return (
    <>
      <Link href="/outfits" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronIcon dir="left" size={14} /> Outfits
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_1fr]">
        <OutfitCard outfit={o} today={today()} />
        <div className="space-y-6">
          <Section title="Context">
            <dl className="card divide-y divide-line px-4 text-sm">
              {ctx.date ? <div className="flex justify-between py-2"><dt className="text-muted">Made for</dt><dd>{formatDate(ctx.date, { weekday: true, year: true })}</dd></div> : null}
              {ctx.occasion ? <div className="flex justify-between py-2"><dt className="text-muted">Occasion</dt><dd>{ctx.occasion}</dd></div> : null}
              {ctx.request ? <div className="flex justify-between gap-4 py-2"><dt className="text-muted">Request</dt><dd className="text-right">{ctx.request}</dd></div> : null}
              {ctx.weather ? <div className="flex justify-between py-2"><dt className="text-muted">Weather</dt><dd>{ctx.weather}</dd></div> : null}
              {ctx.activities?.length ? <div className="flex justify-between gap-4 py-2"><dt className="text-muted">Plans</dt><dd className="text-right">{ctx.activities.join(", ")}</dd></div> : null}
              <div className="flex justify-between py-2"><dt className="text-muted">Created</dt><dd>{formatDate(o.createdAt.slice(0, 10), { year: true })}</dd></div>
              {o.basedOnOutfitId ? <div className="flex justify-between py-2"><dt className="text-muted">Based on</dt><dd><Link className="link" href={`/outfits/${o.basedOnOutfitId}`}>another outfit</Link></dd></div> : null}
            </dl>
          </Section>
          <Section title="Feedback">
            {o.feedback.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {o.feedback.map((f) => (
                  <li key={f.id}>
                    <Badge tone={f.kind === "love" ? "accent" : "neutral"}>
                      {FEEDBACK_LABELS[f.kind]} · {f.scope.replace("_", "-")}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No feedback yet. Use the buttons on the card – it shapes future suggestions.</p>
            )}
          </Section>
          <Section title="Worn">
            {worn.length ? (
              <ul className="card divide-y divide-line">
                {worn.map((w) => (
                  <li key={w.id} className="px-4 py-2 text-sm">
                    {formatDate(w.date, { weekday: true, year: true })}
                    {w.notes ? <span className="text-muted"> – {w.notes}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Not worn yet.</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
