"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GarmentView } from "@/server/services/garments";
import { slotFor, type Slot } from "@/lib/domain";
import { compositionErrors } from "@/lib/outfit-rules";
import { api } from "@/lib/client-api";
import { GarmentArt } from "./garment-art";
import { OutfitBoard } from "./outfit-board";
import { Button, Field, Notice, StatusBadge, cx } from "./ui";
import { useMutation } from "./feedback-ui";

const GROUPS: { title: string; slots: Slot[] }[] = [
  { title: "Coats", slots: ["outer"] },
  { title: "Layers & tailoring", slots: ["mid", "suit"] },
  { title: "Tops & dresses", slots: ["top", "onepiece"] },
  { title: "Bottoms", slots: ["bottom"] },
  { title: "Shoes", slots: ["footwear"] },
  { title: "Accessories", slots: ["accessory"] },
];

export function OutfitBuilder({ garments }: { garments: GarmentView[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>([]);
  const [name, setName] = useState("");
  const { run, pending } = useMutation();
  const chosen = garments.filter((g) => picked.includes(g.id));
  const errors = useMemo(() => (chosen.length ? compositionErrors(chosen) : []), [chosen]);
  const unavailable = chosen.filter((g) => !g.available);
  const items = chosen.map((g) => ({
    id: g.id,
    garmentId: g.id,
    slot: slotFor(g),
    snapshot: { name: g.name, category: g.category, subcategory: g.subcategory, colours: g.colours, pattern: g.pattern },
    garment: g,
    missing: false,
  }));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {GROUPS.map(({ title, slots }) => {
          const list = garments.filter((g) => slots.includes(slotFor(g)));
          if (!list.length) return null;
          return (
            <section key={title}>
              <h2 className="mb-2 text-lg font-medium">{title}</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {list.map((g) => {
                  const on = picked.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== g.id) : [...p, g.id]))}
                      className={cx("card w-28 shrink-0 p-2 text-left transition", on ? "border-accent ring-2 ring-accent/40" : "hover:border-ink-soft", !g.available && "opacity-60")}
                    >
                      <div className="aspect-[5/6]">
                        <GarmentArt garment={g} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-snug">{g.name}</p>
                      {!g.available ? <StatusBadge status={g.status} /> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <aside>
        <div className="card sticky top-6 space-y-3 p-4">
          <p className="eyebrow">Your outfit</p>
          {items.length ? <OutfitBoard items={items} /> : <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-paper text-sm text-muted">Pick pieces on the left</div>}
          {errors.length ? <Notice tone="warning">{errors.join(" ")}</Notice> : null}
          {unavailable.length ? <Notice tone="info">{unavailable.map((g) => g.name).join(", ")} {unavailable.length === 1 ? "is" : "are"} unavailable right now – you can still save it for later.</Notice> : null}
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Library Tuesday" />
          </Field>
          <Button
            variant="primary"
            className="w-full"
            disabled={picked.length === 0}
            busy={pending === "save"}
            onClick={async () => {
              const res = await run("save", () => api<{ outfit: { id: number } }>("/api/outfits", { body: { name: name.trim() || "My outfit", garmentIds: picked, saved: true } }), {
                success: "Outfit saved",
                refresh: false,
              });
              if (res) router.push(`/outfits/${res.outfit.id}`);
            }}
          >
            Save outfit
          </Button>
        </div>
      </aside>
    </div>
  );
}
