"use client";

import type { OutfitItemView } from "@/server/services/outfits";
import { GarmentArt, InlineArt } from "./garment-art";
import { cx } from "./ui";

type Item = Pick<OutfitItemView, "id" | "garmentId" | "slot" | "snapshot" | "garment" | "missing">;

function Tile({ item, className, onPick, highlight }: { item: Item; className?: string; onPick?: (item: Item) => void; highlight?: boolean }) {
  const art = item.garment ? (
    <GarmentArt garment={item.garment} />
  ) : (
    <InlineArt input={{ ...item.snapshot, name: item.snapshot.name }} className="h-full w-full opacity-60" label={item.snapshot.name} />
  );
  const unavailable = item.missing || (item.garment && !item.garment.available);
  const body = (
    <div className={cx("relative h-full w-full", unavailable && "opacity-45 grayscale")}>
      {art}
      {unavailable ? <span className="absolute inset-x-0 bottom-1 mx-auto w-fit rounded-full bg-danger px-1.5 py-0.5 text-[0.6rem] font-semibold text-white">{item.missing ? "removed" : "unavailable"}</span> : null}
    </div>
  );
  return (
    <div className={cx("relative min-h-0 min-w-0 flex-1", className)}>
      {onPick && item.garment ? (
        <button
          type="button"
          title={`Swap ${item.snapshot.name}`}
          aria-label={`Swap ${item.snapshot.name}`}
          onClick={() => onPick(item)}
          className={cx("h-full w-full rounded-lg transition hover:bg-paper-deep/70 focus-visible:bg-paper-deep", highlight && "ring-2 ring-danger/60")}
        >
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
}

/**
 * A clothing board: layers on the left, the core outfit in the middle, shoes and
 * accessories on the right. Click a piece to swap it (when onPick is given).
 */
export function OutfitBoard({ items, onPick, className, flagIds = [] }: { items: Item[]; onPick?: (item: Item) => void; className?: string; flagIds?: number[] }) {
  const by = (slots: string[]) => items.filter((i) => slots.includes(i.slot));
  const layers = by(["outer", "mid", "suit"]);
  const core = [...by(["top", "onepiece"]), ...by(["bottom"])];
  const shoes = by(["footwear"]);
  const acc = by(["accessory"]);
  const flagged = (i: Item) => i.garmentId !== null && flagIds.includes(i.garmentId);
  return (
    <div className={cx("flex aspect-[4/3] gap-1.5 rounded-xl bg-gradient-to-b from-white to-paper/70 p-2", className)}>
      {layers.length ? (
        <div className="flex flex-[1.15] flex-col gap-1">
          {layers.map((i) => (
            <Tile key={i.id} item={i} onPick={onPick} highlight={flagged(i)} />
          ))}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-1">
        {core.length ? core.map((i) => <Tile key={i.id} item={i} onPick={onPick} highlight={flagged(i)} />) : <div className="flex-1" />}
      </div>
      {shoes.length || acc.length ? (
        <div className="flex flex-[0.8] flex-col gap-1">
          {acc.length ? (
            <div className="grid flex-1 grid-cols-2 gap-1">
              {acc.slice(0, 4).map((i) => (
                <Tile key={i.id} item={i} onPick={onPick} highlight={flagged(i)} />
              ))}
            </div>
          ) : null}
          {shoes.map((i) => (
            <Tile key={i.id} item={i} onPick={onPick} highlight={flagged(i)} className={acc.length ? "" : "mt-auto max-h-[45%]"} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
