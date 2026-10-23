"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OutfitView, OutfitItemView } from "@/server/services/outfits";
import type { GarmentView } from "@/server/services/garments";
import { FEEDBACK_LABELS, slotFor, type FeedbackKind, type FeedbackScope } from "@/lib/domain";
import { ADJUSTMENTS, ADJUSTMENT_LABELS, type Adjustment } from "@/lib/schemas";
import { addDays, formatDate } from "@/lib/dates";
import { api } from "@/lib/client-api";
import { OutfitBoard } from "./outfit-board";
import { GarmentArt } from "./garment-art";
import { Badge, Button, Field, Notice, SourceBadge, Spinner, StatusBadge, cx } from "./ui";
import { Modal, useConfirm, useMutation, useToast, useAffectedPlansToast, type AffectedPlan } from "./feedback-ui";
import { ArchiveIcon, CalendarIcon, CheckIcon, CopyIcon, EditIcon, HeartIcon, MenuDotsIcon, SwapIcon, TrashIcon, WandIcon } from "./icons";

type Props = {
  outfit: OutfitView;
  /** when shown on a planner day, actions default to that date */
  dayDate?: string;
  today?: string;
  compact?: boolean;
  /** called with a new outfit created from this one (adjustments) */
  onReplaceWith?: (o: OutfitView) => void;
  hidePlan?: boolean;
};

export function OutfitCard({ outfit, dayDate, today, compact, onReplaceWith, hidePlan }: Props) {
  const [o, setO] = useState(outfit);
  // adopt fresh server data when the parent re-renders with a new outfit object
  const [prevOutfit, setPrevOutfit] = useState(outfit);
  if (outfit !== prevOutfit) {
    setPrevOutfit(outfit);
    setO(outfit);
  }
  const { run, pending } = useMutation();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [swapItem, setSwapItem] = useState<OutfitItemView | null>(null);
  const [dialog, setDialog] = useState<null | "wear" | "plan" | "edit" | "adjust" | "combine" | "dislike">(null);
  const [menu, setMenu] = useState(false);

  const reload = async () => {
    const res = await api<{ outfit: OutfitView }>(`/api/outfits/${o.id}`);
    setO(res.outfit);
  };
  const patch = (body: Record<string, unknown>, success?: string) =>
    run("patch", async () => {
      const res = await api<{ outfit: OutfitView }>(`/api/outfits/${o.id}`, { method: "PATCH", body });
      setO(res.outfit);
      return res;
    }, { success });

  const feedback = (kind: FeedbackKind, scope: FeedbackScope = "one_off", garmentIds: number[] = []) =>
    run(
      `fb-${kind}`,
      async () => {
        await api("/api/feedback", { body: { outfitId: o.id, kind, scope, garmentIds, context: o.context?.occasion ?? o.context?.weather ?? null } });
        await reload();
      },
      { success: kind === "love" ? "Saved to favourites" : "Thanks – noted for future suggestions" },
    );

  const given = new Set(o.feedback.map((f) => f.kind));
  const itemsWithGarments = o.items.filter((i) => i.garment);

  return (
    <article className={cx("card flex flex-col overflow-hidden", o.archived && "opacity-70")} data-testid="outfit-card">
      <div className="relative p-3 pb-0">
        <OutfitBoard items={o.items} onPick={(i) => setSwapItem(i as OutfitItemView)} flagIds={o.unavailableGarmentIds} />
        <button
          type="button"
          aria-label={o.favourite ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={o.favourite}
          onClick={() => (o.favourite ? patch({ favourite: false }) : feedback("love", "permanent"))}
          className={cx("absolute top-5 right-5 rounded-full bg-white/85 p-1.5 shadow-sm transition hover:scale-105", o.favourite ? "text-accent" : "text-muted")}
        >
          <HeartIcon filled={o.favourite} size={18} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceBadge source={o.source} />
          {o.saved ? <Badge tone="moss">Saved</Badge> : null}
          {o.timesWorn ? <Badge>Worn {o.timesWorn}×</Badge> : null}
          {o.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
        <h3 className="text-lg leading-snug font-medium">
          {o.saved ? (
            <Link href={`/outfits/${o.id}`} className="hover:text-accent">
              {o.name}
            </Link>
          ) : (
            o.name
          )}
        </h3>
        {o.issues.length ? (
          <Notice tone="warning">
            <span className="font-medium">Needs attention:</span> {o.issues.join(" ")} Tap the flagged piece to swap it.
          </Notice>
        ) : null}
        {!compact && o.explanation ? <p className="text-sm leading-relaxed text-ink-soft">{o.explanation}</p> : null}
        {!compact && o.warnings.length ? <p className="text-xs text-[#7a5d26]">⚠ {o.warnings.join(" ")}</p> : null}
        {!compact ? (
          <ul className="mt-1 flex flex-wrap gap-x-1 gap-y-0.5 text-xs text-muted" aria-label="Garments">
            {o.items.map((i, idx) => (
              <li key={i.id} className="inline-flex items-center gap-1">
                {i.garment ? (
                  <Link href={`/wardrobe/${i.garment.id}`} className="hover:text-ink hover:underline">
                    {i.garment.name}
                  </Link>
                ) : (
                  <span className="line-through">{i.snapshot.name}</span>
                )}
                {i.garment && !i.garment.available ? <StatusBadge status={i.garment.status} /> : null}
                {idx < o.items.length - 1 ? <span aria-hidden="true">·</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          {!o.saved ? (
            <Button size="sm" variant="primary" busy={pending === "patch"} onClick={() => patch({ saved: true }, "Saved to your outfits")}>
              Save
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setDialog("wear")} disabled={itemsWithGarments.length === 0}>
            <CheckIcon size={14} /> Wore it
          </Button>
          {!hidePlan ? (
            <Button size="sm" onClick={() => setDialog("plan")}>
              <CalendarIcon size={14} /> Plan
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setDialog("adjust")}>
            <WandIcon size={14} /> Adjust
          </Button>
          <div className="relative ml-auto">
            <Button size="sm" variant="ghost" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <MenuDotsIcon size={16} />
            </Button>
            {menu ? (
              <div className="card absolute right-0 bottom-9 z-20 w-56 p-1 text-sm" onMouseLeave={() => setMenu(false)}>
                {[
                  { label: "Rename / tag", icon: EditIcon, act: () => setDialog("edit") },
                  {
                    label: "Duplicate",
                    icon: CopyIcon,
                    act: () => run("dup", () => api(`/api/outfits/${o.id}/duplicate`, { method: "POST" }), { success: "Copied to your outfits" }),
                  },
                  { label: o.archived ? "Unarchive" : "Archive", icon: ArchiveIcon, act: () => patch({ archived: !o.archived }, o.archived ? "Restored" : "Archived") },
                  {
                    label: "Delete",
                    icon: TrashIcon,
                    act: async () => {
                      if (!(await confirm({ title: "Delete this outfit?", body: "Wear history keeps its own record of what you wore.", confirmLabel: "Delete", danger: true }))) return;
                      await run("del", () => api(`/api/outfits/${o.id}`, { method: "DELETE" }), { success: "Outfit deleted" });
                    },
                  },
                ].map(({ label, icon: Icon, act }) => (
                  <button
                    key={label}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-paper-deep"
                    onClick={() => {
                      setMenu(false);
                      act();
                    }}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 border-t border-line pt-2" aria-label="Feedback">
          {(["not_my_style", "too_warm", "too_cold", "too_formal", "too_casual", "uncomfortable"] as FeedbackKind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={given.has(k)}
              disabled={pending !== null}
              onClick={() => (k === "not_my_style" ? setDialog("dislike") : feedback(k))}
              className={cx("rounded-full px-2 py-0.5 text-[0.68rem] transition", given.has(k) ? "bg-ink text-paper" : "text-muted hover:bg-paper-deep hover:text-ink")}
            >
              {FEEDBACK_LABELS[k]}
            </button>
          ))}
          <button type="button" onClick={() => setDialog("combine")} className="rounded-full px-2 py-0.5 text-[0.68rem] text-muted hover:bg-paper-deep hover:text-ink">
            {FEEDBACK_LABELS.dont_combine}
          </button>
        </div>
      </div>

      {swapItem ? <SwapDialog key={swapItem.id} outfit={o} item={swapItem} onClose={() => setSwapItem(null)} onSwapped={(n) => setO(n)} /> : null}
      {dialog === "wear" ? <WearDialog open onClose={() => setDialog(null)} outfit={o} defaultDate={dayDate ?? today} onDone={reload} /> : null}
      {dialog === "plan" ? <PlanDialog open onClose={() => setDialog(null)} outfit={o} defaultDate={dayDate ?? (today ? addDays(today, 1) : undefined)} /> : null}
      {dialog === "edit" ? <EditDialog open onClose={() => setDialog(null)} outfit={o} onSaved={setO} /> : null}
      {dialog === "adjust" ? (
      <AdjustDialog
        open
        onClose={() => setDialog(null)}
        outfit={o}
        dayDate={dayDate}
        onUse={(n) => {
          setDialog(null);
          if (onReplaceWith) onReplaceWith(n);
          else router.refresh();
        }}
      />
      ) : null}
      {dialog === "combine" ? <CombineDialog open onClose={() => setDialog(null)} outfit={o} onDone={reload} /> : null}
      <DislikeDialog
        open={dialog === "dislike"}
        onClose={() => setDialog(null)}
        onChoose={async (scope) => {
          setDialog(null);
          await feedback("not_my_style", scope);
          toast({ title: scope === "permanent" ? "This combination won't be suggested again" : "Noted – it'll be suggested less", tone: "info" });
        }}
      />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

type Option = { garmentId: number; reason: string; source: "ai" | "rules" | "manual"; garment: GarmentView };

function SwapDialog({ outfit, item, onClose, onSwapped }: { outfit: OutfitView; item: OutfitItemView | null; onClose: () => void; onSwapped: (o: OutfitView) => void }) {
  const [options, setOptions] = useState<Option[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [all, setAll] = useState<GarmentView[]>([]);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useMutation();
  useEffect(() => {
    if (!item?.garment) return;
    let cancelled = false;
    api<{ options: Option[]; notice: string | null }>(`/api/outfits/${outfit.id}/replace`, { body: { garmentId: item.garment.id } })
      .then((r) => {
        if (cancelled) return;
        setOptions(r.options);
        setNotice(r.notice);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    api<{ garments: GarmentView[] }>("/api/garments?availability=available")
      .then((r) => !cancelled && setAll(r.garments))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item, outfit.id]);
  if (!item?.garment) return null;
  const target = item.garment;
  const group = (g: Pick<GarmentView, "category" | "subcategory" | "layeringRole">) => {
    const s = slotFor(g);
    return s === "bottom" || s === "onepiece" || s === "suit" ? "lower" : s;
  };
  const inOutfit = new Set(outfit.items.map((i) => i.garmentId));
  const manualChoices = all.filter((g) => group(g) === group(target) && !inOutfit.has(g.id));
  const apply = async (newGarmentId: number) => {
    const res = await run("swap", () => api<{ outfit: OutfitView }>(`/api/outfits/${outfit.id}/replace`, { body: { garmentId: target.id, newGarmentId } }), {
      success: "Swapped – everything else stayed the same",
    });
    if (res) {
      onSwapped(res.outfit);
      onClose();
    }
  };
  return (
    <Modal open={Boolean(item)} onClose={onClose} title={`Swap ${target.name}`} wide>
      <p className="mb-3 text-sm text-muted">Only this piece changes. Pick a suggestion or choose any available alternative.</p>
      {notice ? (
        <div className="mb-3">
          <Notice tone="info">{notice}</Notice>
        </div>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!options && !error ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted">
          <Spinner /> Finding alternatives…
        </div>
      ) : null}
      {options && options.length === 0 ? <Notice tone="warning">No suitable available alternative was found for this piece.</Notice> : null}
      {options?.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {options.map((opt) => (
            <button
              key={opt.garmentId}
              type="button"
              disabled={pending !== null}
              onClick={() => apply(opt.garmentId)}
              className="card flex flex-col items-stretch p-3 text-left transition hover:border-ink-soft"
            >
              <div className="mb-2 aspect-[5/6] rounded-lg bg-paper/60 p-2">
                <GarmentArt garment={opt.garment} />
              </div>
              <span className="text-sm font-medium">{opt.garment.name}</span>
              <span className="mt-1 text-xs text-muted">{opt.reason}</span>
              <span className="mt-2">
                <SourceBadge source={opt.source} />
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {manualChoices.length ? (
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-end">
          <Field label="Or choose it yourself" className="flex-1">
            <select className="input" value={manual} onChange={(e) => setManual(e.target.value)}>
              <option value="">Select a garment…</option>
              {manualChoices.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Button variant="primary" disabled={!manual} busy={pending === "swap"} onClick={() => apply(Number(manual))}>
            <SwapIcon size={14} /> Use this
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}

function WearDialog({ open, onClose, outfit, defaultDate, onDone }: { open: boolean; onClose: () => void; outfit: OutfitView; defaultDate?: string; onDone: () => void }) {
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const { run, pending } = useMutation();
  const toast = useToast();
  const warn = useAffectedPlansToast();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as worn"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={pending === "wear"}
            onClick={async () => {
              const res = await run("wear", () =>
                api<{ markedForWash: { name: string }[]; affectedPlans: AffectedPlan[] }>(`/api/outfits/${outfit.id}/wear`, { body: { date, notes: notes || null } }),
              );
              if (res) {
                toast({
                  tone: "success",
                  title: `Logged for ${formatDate(date, { weekday: true })}`,
                  body: res.markedForWash.length ? `Ready for the wash: ${res.markedForWash.map((g) => g.name).join(", ")}.` : "Nothing needs washing yet.",
                });
                warn(res.affectedPlans);
                onDone();
                onClose();
              }
            }}
          >
            Log it
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">This records the outfit in your history, updates wear counts and applies each garment&apos;s washing rules.</p>
        <Field label="Date worn">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Notes (optional)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />
        </Field>
      </div>
    </Modal>
  );
}

function PlanDialog({ open, onClose, outfit, defaultDate }: { open: boolean; onClose: () => void; outfit: OutfitView; defaultDate?: string }) {
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const { run, pending } = useMutation();
  const router = useRouter();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Plan this outfit"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={pending === "plan"}
            onClick={async () => {
              const res = await run("plan", () => api(`/api/planner/day/${date}`, { method: "PATCH", body: { outfitId: outfit.id } }), {
                success: `Planned for ${formatDate(date, { weekday: true })}`,
              });
              if (res) {
                onClose();
                router.push(`/planner?start=${date}`);
              }
            }}
          >
            Put on the calendar
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">Replaces whatever is planned for that day. Saved outfits are copied, so tweaks on the day don&apos;t change your saved version.</p>
      <Field label="Day">
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
    </Modal>
  );
}

function EditDialog({ open, onClose, outfit, onSaved }: { open: boolean; onClose: () => void; outfit: OutfitView; onSaved: (o: OutfitView) => void }) {
  const [name, setName] = useState(outfit.name);
  const [tags, setTags] = useState(outfit.tags.join(", "));
  const { run, pending } = useMutation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rename and tag"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={pending === "edit"}
            disabled={!name.trim()}
            onClick={async () => {
              const res = await run("edit", () =>
                api<{ outfit: OutfitView }>(`/api/outfits/${outfit.id}`, {
                  method: "PATCH",
                  body: { name: name.trim(), tags: tags.split(",").map((t) => t.trim()).filter(Boolean) },
                }),
              );
              if (res) {
                onSaved(res.outfit);
                onClose();
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Tags" hint="Comma separated, e.g. seminar, rainy day">
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function AdjustDialog({ open, onClose, outfit, dayDate, onUse }: { open: boolean; onClose: () => void; outfit: OutfitView; dayDate?: string; onUse: (o: OutfitView) => void }) {
  const [result, setResult] = useState<{ outfit: OutfitView; notice: string | null } | null>(null);
  const [instruction, setInstruction] = useState("");
  const { run, pending } = useMutation();
  const go = (adjustment: Adjustment | null) =>
    run(
      "adjust",
      async () => {
        const r = await api<{ outfit: OutfitView; notice: string | null }>(`/api/outfits/${outfit.id}/adjust`, { body: { adjustment, instruction: instruction || undefined } });
        setResult(r);
        return r;
      },
      { refresh: false },
    );
  return (
    <Modal open={open} onClose={onClose} title="Adjust this outfit" wide>
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Creates a variation that changes as few pieces as possible. The original stays as it is.</p>
          <div className="flex flex-wrap gap-2">
            {ADJUSTMENTS.map((a) => (
              <Button key={a} size="sm" busy={pending === "adjust"} onClick={() => go(a)}>
                {ADJUSTMENT_LABELS[a]}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Or describe it (uses Claude when available)" className="flex-1">
              <input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. swap in something burgundy, keep the boots" />
            </Field>
            <Button variant="primary" disabled={!instruction.trim()} busy={pending === "adjust"} onClick={() => go(null)}>
              Adjust
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {result.notice ? <Notice tone="info">{result.notice}</Notice> : null}
          <OutfitCard outfit={result.outfit} compact hidePlan />
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setResult(null)}>Try another</Button>
            {dayDate ? (
              <Button
                variant="primary"
                busy={pending === "use"}
                onClick={async () => {
                  const r = await run("use", () => api(`/api/planner/day/${dayDate}`, { method: "PATCH", body: { outfitId: result.outfit.id } }), {
                    success: `Using it for ${formatDate(dayDate, { weekday: true })}`,
                  });
                  if (r) onUse(result.outfit);
                }}
              >
                Use for {formatDate(dayDate, { weekday: true })}
              </Button>
            ) : (
              <Button
                variant="primary"
                busy={pending === "use"}
                onClick={async () => {
                  const r = await run("use", () => api(`/api/outfits/${result.outfit.id}`, { method: "PATCH", body: { saved: true } }), { success: "Saved to your outfits" });
                  if (r) onUse(result.outfit);
                }}
              >
                Save variation
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CombineDialog({ open, onClose, outfit, onDone }: { open: boolean; onClose: () => void; outfit: OutfitView; onDone: () => void }) {
  const items = outfit.items.filter((i) => i.garment && i.slot !== "accessory");
  const [picked, setPicked] = useState<number[]>([]);
  const [scope, setScope] = useState<FeedbackScope>("permanent");
  const { run, pending } = useMutation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Don't combine these again"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={picked.length < 2}
            busy={pending === "combine"}
            onClick={async () => {
              const r = await run("combine", () => api("/api/feedback", { body: { outfitId: outfit.id, kind: "dont_combine", scope, garmentIds: picked } }), {
                success: scope === "permanent" ? "Rule added – they won't be paired again" : "Noted for the next 30 days",
              });
              if (r) {
                onDone();
                onClose();
              }
            }}
          >
            Add rule
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">Pick the pieces that clash. They can still be worn – just not together.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="accent-accent"
              checked={picked.includes(i.garmentId!)}
              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.garmentId!] : p.filter((x) => x !== i.garmentId)))}
            />
            {i.garment!.name}
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="scope" className="accent-accent" checked={scope === "permanent"} onChange={() => setScope("permanent")} /> Permanent rule
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="scope" className="accent-accent" checked={scope === "temporary"} onChange={() => setScope("temporary")} /> Just for 30 days
        </label>
      </div>
    </Modal>
  );
}

function DislikeDialog({ open, onClose, onChoose }: { open: boolean; onClose: () => void; onChoose: (s: FeedbackScope) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Not your style?">
      <p className="mb-4 text-sm text-muted">How strongly should this shape future suggestions?</p>
      <div className="grid gap-2">
        {(
          [
            ["one_off", "Just not today", "Barely affects future picks; expires in a week."],
            ["temporary", "Not for a while", "Suggested less for the next 30 days."],
            ["permanent", "Never this combination", "This exact combination won't be suggested again."],
          ] as const
        ).map(([scope, title, desc]) => (
          <button key={scope} type="button" onClick={() => onChoose(scope)} className="rounded-xl border border-line px-4 py-3 text-left transition hover:border-ink-soft hover:bg-white">
            <span className="block text-sm font-medium">{title}</span>
            <span className="block text-xs text-muted">{desc}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
