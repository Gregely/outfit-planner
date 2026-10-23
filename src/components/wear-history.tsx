"use client";

import Link from "next/link";
import type { WearLogView } from "@/server/services/wear";
import { formatDate } from "@/lib/dates";
import { api } from "@/lib/client-api";
import { InlineArt } from "./garment-art";
import { Button } from "./ui";
import { useConfirm, useMutation } from "./feedback-ui";

export function WearHistory({ logs }: { logs: WearLogView[] }) {
  const confirm = useConfirm();
  const { run } = useMutation();
  return (
    <ol className="space-y-3">
      {logs.map((l) => (
        <li key={l.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="sm:w-44">
            <p className="font-serif text-lg">{formatDate(l.date, { weekday: true })}</p>
            <p className="text-xs text-muted">
              {l.outfitId ? (
                <Link href={`/outfits/${l.outfitId}`} className="link">
                  {l.outfitName || "Outfit"}
                </Link>
              ) : (
                l.outfitName || "Logged outfit"
              )}
            </p>
            {l.notes ? <p className="mt-1 text-xs text-ink-soft italic">“{l.notes}”</p> : null}
          </div>
          <div className="flex flex-1 flex-wrap gap-2">
            {l.items.map((i, idx) => (
              <div key={idx} className="w-16 text-center" title={i.snapshot.name}>
                <div className="aspect-[5/6] rounded-md bg-white/70">
                  <InlineArt input={i.snapshot} className="h-full w-full" label={i.snapshot.name} />
                </div>
                <p className="mt-0.5 truncate text-[0.62rem] text-muted">{i.snapshot.name}</p>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (!(await confirm({ title: "Remove this wear?", body: "Wear counts go back down. Laundry statuses aren't changed – adjust them yourself if needed.", confirmLabel: "Remove", danger: true }))) return;
              await run("del", () => api(`/api/wear/${l.id}`, { method: "DELETE" }), { success: "Removed from history" });
            }}
          >
            Undo
          </Button>
        </li>
      ))}
    </ol>
  );
}
