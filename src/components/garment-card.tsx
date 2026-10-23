"use client";

import Link from "next/link";
import { STATUSES, STATUS_LABELS, CATEGORY_LABELS, type GarmentStatus } from "@/lib/domain";
import type { GarmentView } from "@/server/services/garments";
import { GarmentArt } from "./garment-art";
import { StatusBadge, Swatch, cx } from "./ui";
import { useAffectedPlansToast, useMutation, type AffectedPlan } from "./feedback-ui";

export function StatusSelect({ garment, compact }: { garment: Pick<GarmentView, "id" | "name" | "status">; compact?: boolean }) {
  const { run, pending, api } = useMutation();
  const warnPlans = useAffectedPlansToast();
  return (
    <select
      aria-label={`Status of ${garment.name}`}
      value={garment.status}
      disabled={pending !== null}
      onChange={async (e) => {
        const status = e.target.value as GarmentStatus;
        const res = await run("status", () => api<{ affectedPlans: AffectedPlan[] }>("/api/garments/status", { body: { ids: [garment.id], status } }), {
          success: `${garment.name}: ${STATUS_LABELS[status].toLowerCase()}`,
        });
        if (res) warnPlans(res.affectedPlans);
      }}
      className={cx(
        "cursor-pointer rounded-full border border-line-strong bg-white/80 text-ink-soft hover:border-ink-soft focus:outline-none",
        compact ? "max-w-[8.5rem] px-2 py-1 text-[0.7rem]" : "px-3 py-1.5 text-sm",
      )}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

export function GarmentCard({ garment }: { garment: GarmentView }) {
  return (
    <article className={cx("card group relative flex flex-col overflow-hidden transition hover:-translate-y-0.5", !garment.available && "opacity-80")}>
      <Link href={`/wardrobe/${garment.id}`} className="block" aria-label={garment.name}>
        <div className="relative aspect-[5/6] bg-gradient-to-b from-white to-paper/80 p-3">
          <GarmentArt garment={garment} className={cx(!garment.available && "grayscale-[60%]")} />
          <div className="absolute top-2 left-2">
            <StatusBadge status={garment.status} />
          </div>
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 border-t border-line px-3 py-2.5">
        <Link href={`/wardrobe/${garment.id}`} className="line-clamp-2 text-sm leading-snug font-medium hover:text-accent">
          {garment.name}
        </Link>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted">{garment.subcategory ?? CATEGORY_LABELS[garment.category]}</span>
          <span className="flex gap-0.5">
            {garment.colours.slice(0, 4).map((c, i) => (
              <Swatch key={i} hex={c.hex} name={c.name} size={11} />
            ))}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <StatusSelect garment={garment} compact />
          <span className="text-[0.7rem] text-muted" title="Times worn">
            {garment.wearCount}×
          </span>
        </div>
      </div>
    </article>
  );
}
