"use client";

import Link from "next/link";
import { useState } from "react";
import type { GarmentView } from "@/server/services/garments";
import { LAUNDRY_ACTION_LABEL, STATUS_LABELS, type GarmentStatus } from "@/lib/domain";
import { api } from "@/lib/client-api";
import { GarmentArt } from "./garment-art";
import { Badge, Button, EmptyState, cx } from "./ui";
import { useAffectedPlansToast, useMutation, type AffectedPlan } from "./feedback-ui";
import { WashIcon } from "./icons";

const COLUMNS: { status: GarmentStatus; blurb: string }[] = [
  { status: "worn", blurb: "Worn enough to need washing" },
  { status: "in_wash", blurb: "In the machine" },
  { status: "drying", blurb: "On the rack" },
  { status: "awaiting_ironing", blurb: "Dry, needs a press" },
  { status: "awaiting_repair", blurb: "Buttons, hems, resoles" },
];

export function LaundryBoard({ garments }: { garments: GarmentView[] }) {
  const [selected, setSelected] = useState<number[]>([]);
  const { run, pending } = useMutation();
  const warn = useAffectedPlansToast();
  const away = garments.filter((g) => g.status === "packed" || g.status === "unavailable");
  const nearly = garments.filter((g) => g.status === "clean" && g.care.washAfterWears > 0 && g.wearsSinceWash > 0 && g.wearsSinceWash >= g.care.washAfterWears - 1);
  const inFlow = garments.filter((g) => COLUMNS.some((c) => c.status === g.status));
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const advance = async (ids: number[]) => {
    const r = await run("advance", () => api<{ affectedPlans: AffectedPlan[] }>("/api/laundry/advance", { body: { ids } }), { success: `Moved ${ids.length} item${ids.length === 1 ? "" : "s"} along` });
    if (r) setSelected([]);
  };
  const setStatus = async (ids: number[], status: GarmentStatus) => {
    const r = await run("status", () => api<{ affectedPlans: AffectedPlan[] }>("/api/garments/status", { body: { ids, status } }), { success: `${ids.length} item${ids.length === 1 ? "" : "s"}: ${STATUS_LABELS[status].toLowerCase()}` });
    if (r) {
      setSelected([]);
      warn(r.affectedPlans);
    }
  };
  if (!inFlow.length && !away.length && !nearly.length) {
    return (
      <EmptyState title="All clean" icon={<WashIcon size={36} />}>
        Nothing is waiting to be washed, dried, ironed or repaired. Items appear here when you log outfits as worn or change a garment&apos;s status.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-8">
      {selected.length ? (
        <div className="card sticky top-2 z-20 flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="text-sm">{selected.length} selected</span>
          <Button size="sm" variant="primary" busy={pending === "advance"} onClick={() => advance(selected)}>
            Next step
          </Button>
          <Button size="sm" onClick={() => setStatus(selected, "in_wash")}>
            Into the wash
          </Button>
          <Button size="sm" onClick={() => setStatus(selected, "clean")}>
            Clean & ready
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-5">
        {COLUMNS.map((c) => {
          const items = inFlow.filter((g) => g.status === c.status);
          return (
            <section key={c.status} className="rounded-2xl bg-paper-deep/50 p-3" aria-label={STATUS_LABELS[c.status]}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-base font-medium">{STATUS_LABELS[c.status]}</h2>
                <span className="text-xs text-muted">{items.length}</span>
              </div>
              <p className="mb-3 text-xs text-muted">{c.blurb}</p>
              {items.length > 1 ? (
                <Button size="sm" variant="ghost" className="mb-2 w-full" onClick={() => advance(items.map((g) => g.id))}>
                  {LAUNDRY_ACTION_LABEL[c.status]} · all
                </Button>
              ) : null}
              <ul className="space-y-2">
                {items.map((g) => (
                  <li key={g.id} className={cx("card flex items-center gap-2 p-2", selected.includes(g.id) && "ring-2 ring-accent/50")}>
                    <input type="checkbox" className="accent-accent" checked={selected.includes(g.id)} onChange={() => toggle(g.id)} aria-label={`Select ${g.name}`} />
                    <Link href={`/wardrobe/${g.id}`} className="h-12 w-10 shrink-0">
                      <GarmentArt garment={g} />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{g.name}</p>
                      <button type="button" className="text-[0.7rem] text-accent hover:underline" onClick={() => advance([g.id])}>
                        {LAUNDRY_ACTION_LABEL[g.status]} →
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {nearly.length ? (
        <section>
          <h2 className="mb-1 text-xl font-medium">Due a wash soon</h2>
          <p className="mb-3 text-sm text-muted">Clean, but one more wear reaches their washing rule.</p>
          <div className="flex flex-wrap gap-2">
            {nearly.map((g) => (
              <Link key={g.id} href={`/wardrobe/${g.id}`} className="card flex items-center gap-2 px-3 py-2 text-sm hover:border-ink-soft">
                <span className="h-8 w-7">
                  <GarmentArt garment={g} />
                </span>
                {g.name}
                <Badge>
                  {g.wearsSinceWash}/{g.care.washAfterWears}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {away.length ? (
        <section>
          <h2 className="mb-3 text-xl font-medium">Packed or away</h2>
          <ul className="flex flex-wrap gap-2">
            {away.map((g) => (
              <li key={g.id} className="card flex items-center gap-2 px-3 py-2 text-sm">
                <span className="h-8 w-7">
                  <GarmentArt garment={g} />
                </span>
                {g.name} <Badge>{STATUS_LABELS[g.status]}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setStatus([g.id], "clean")}>
                  Back in rotation
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
