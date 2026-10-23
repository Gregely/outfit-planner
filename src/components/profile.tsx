"use client";

import Link from "next/link";
import { useState } from "react";
import type { Profile } from "@/lib/schemas";
import type { AiUi } from "@/lib/ai-providers";
import type { Feedback, StyleRule } from "@/server/db/schema";
import { FEEDBACK_LABELS, FITS, RULE_KINDS, RULE_KIND_LABELS, SUGGESTED_STYLE_TAGS, type RuleKind } from "@/lib/domain";
import { formatDate } from "@/lib/dates";
import { api } from "@/lib/client-api";
import { Badge, Button, EmptyState, Field, Notice, cx } from "./ui";
import { Modal, useConfirm, useMutation } from "./feedback-ui";
import { Scale, TagInput } from "./garment-form";
import { SparkIcon, TrashIcon, WandIcon } from "./icons";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [p, setP] = useState(profile);
  const { run, pending } = useMutation();
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP({ ...p, [k]: v });
  return (
    <form
      className="card space-y-5 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        run("save", () => api("/api/profile", { method: "PUT", body: p }), { success: "Profile saved" });
      }}
    >
      <Field label="Your style, in your own words" hint="The AI stylist reads this when suggesting outfits.">
        <textarea
          className="input min-h-28 font-serif text-base leading-relaxed"
          value={p.styleDescription}
          onChange={(e) => set("styleDescription", e.target.value)}
          placeholder="However you'd describe it – the looks you like, colours you reach for, what you need clothes to do. Leave it blank if you'd rather the stylist just work from your wardrobe."
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Aesthetics">
          <TagInput label="Aesthetics" value={p.aesthetics} onChange={(v) => set("aesthetics", v)} suggestions={SUGGESTED_STYLE_TAGS} placeholder="any style words you use…" />
        </Field>
        <Field label="Preferred fits">
          <TagInput label="Preferred fits" value={p.preferredFits} onChange={(v) => set("preferredFits", v)} suggestions={[...FITS]} placeholder="relaxed, tailored…" />
        </Field>
        <Field label="Favourite colours">
          <TagInput label="Favourite colours" value={p.favouriteColours} onChange={(v) => set("favouriteColours", v)} placeholder="any colours…" />
        </Field>
        <Field label="Colours you'd rather avoid" hint="A preference. For a hard rule, add an “avoid colour” rule below.">
          <TagInput label="Avoided colours" value={p.avoidedColours} onChange={(v) => set("avoidedColours", v)} placeholder="any colours…" />
        </Field>
        <Field label="Silhouettes you like">
          <TagInput label="Silhouettes" value={p.preferredSilhouettes} onChange={(v) => set("preferredSilhouettes", v)} placeholder="any shapes or cuts…" />
        </Field>
        <Field label="Favourite materials">
          <TagInput label="Favourite materials" value={p.favouriteMaterials} onChange={(v) => set("favouriteMaterials", v)} placeholder="any materials…" />
        </Field>
        <Field label="Materials to avoid">
          <TagInput label="Materials to avoid" value={p.avoidedMaterials} onChange={(v) => set("avoidedMaterials", v)} placeholder="any materials…" />
        </Field>
        <Field label="Layering">
          <select className="input" value={p.layering} onChange={(e) => set("layering", e.target.value as Profile["layering"])}>
            <option value="minimal">Keep it minimal</option>
            <option value="moderate">Some layering</option>
            <option value="love-layers">Love layers</option>
          </select>
        </Field>
        <Field label={`Usual formality · ${p.formality === null ? "no preference" : `${p.formality}/5`}`} hint="Leave unset to let each day's plans decide.">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Scale label="Usual formality" value={p.formality ?? 0} onChange={(v) => set("formality", v)} labels={{ 1: "Lounge / active", 2: "Casual", 3: "Smart casual", 4: "Business", 5: "Formal" }} />
            </div>
            <button type="button" className="text-xs text-muted underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50" disabled={p.formality === null} onClick={() => set("formality", null)}>
              No preference
            </button>
          </div>
        </Field>
        <Field label={`Comfort priority · ${p.comfortPriority}/5`}>
          <Scale label="Comfort priority" value={p.comfortPriority} onChange={(v) => set("comfortPriority", v)} labels={{ 1: "Look first", 2: "", 3: "Balanced", 4: "", 5: "Comfort first" }} />
        </Field>
        <Field label={`Boldness · ${p.boldness}/5`}>
          <Scale label="Boldness" value={p.boldness} onChange={(v) => set("boldness", v)} labels={{ 1: "Quiet", 2: "", 3: "Some colour", 4: "", 5: "Loud" }} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeat an outfit after" hint="days">
            <input type="number" min={0} max={60} className="input" value={p.repetitionDays} onChange={(e) => set("repetitionDays", Number(e.target.value))} />
          </Field>
          <Field label="Rest a piece for" hint="days (not shoes or coats)">
            <input type="number" min={0} max={14} className="input" value={p.garmentRestDays} onChange={(e) => set("garmentRestDays", Number(e.target.value))} />
          </Field>
        </div>
      </div>
      <Field label="Anything else">
        <textarea className="input min-h-16" value={p.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. I cycle most days; my workplace is cold; I need to move freely." />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" busy={pending === "save"}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

export function RulesManager({ rules, garments, today }: { rules: StyleRule[]; garments: { id: number; name: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const { run } = useMutation();
  const confirm = useConfirm();
  const name = (id: number) => garments.find((g) => g.id === id)?.name ?? `deleted #${id}`;
  const describe = (r: StyleRule) => {
    switch (r.kind) {
      case "never_combine":
        return r.garmentIds.map(name).join(" + ");
      case "avoid_garment":
      case "prefer_garment":
        return r.garmentIds.map(name).join(", ");
      case "avoid_colour":
        return r.colours.join(", ");
      default:
        return r.text;
    }
  };
  return (
    <div className="space-y-3">
      {rules.length ? (
        <ul className="card divide-y divide-line">
          {rules.map((r) => {
            const expired = Boolean(r.expiresAt && r.expiresAt < today);
            return (
              <li key={r.id} className={cx("flex flex-wrap items-center gap-3 px-4 py-3", (!r.active || expired) && "opacity-55")}>
                <Badge tone={r.kind === "prefer_garment" ? "moss" : r.kind === "note" ? "sky" : "accent"}>{RULE_KIND_LABELS[r.kind]}</Badge>
                <span className="min-w-0 flex-1 text-sm">{describe(r)}</span>
                <span className="text-xs text-muted">{r.permanent ? "Permanent" : expired ? `Expired ${formatDate(r.expiresAt!)}` : `Until ${formatDate(r.expiresAt!)}`}</span>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" className="accent-accent" checked={r.active} onChange={(e) => run("toggle", () => api(`/api/rules/${r.id}`, { method: "PATCH", body: { active: e.target.checked } }))} />
                  Active
                </label>
                <button
                  type="button"
                  aria-label="Delete rule"
                  className="text-muted hover:text-danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete this rule?", confirmLabel: "Delete", danger: true })) run("del", () => api(`/api/rules/${r.id}`, { method: "DELETE" }), { success: "Rule deleted" });
                  }}
                >
                  <TrashIcon size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No rules yet. “Don&apos;t combine these again” on an outfit adds one automatically.</p>
      )}
      <Button onClick={() => setOpen(true)}>Add a rule</Button>
      <RuleDialog open={open} onClose={() => setOpen(false)} garments={garments} />
    </div>
  );
}

function RuleDialog({ open, onClose, garments }: { open: boolean; onClose: () => void; garments: { id: number; name: string }[] }) {
  const [kind, setKind] = useState<RuleKind>("never_combine");
  const [ids, setIds] = useState<number[]>([]);
  const [colours, setColours] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [permanent, setPermanent] = useState(true);
  const { run, pending } = useMutation();
  const needsGarments = kind === "never_combine" || kind === "avoid_garment" || kind === "prefer_garment";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a rule"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={pending === "rule"}
            onClick={async () => {
              const r = await run("rule", () => api("/api/rules", { body: { kind, garmentIds: needsGarments ? ids : [], colours, text, permanent } }), { success: "Rule added" });
              if (r) {
                setIds([]);
                setColours([]);
                setText("");
                onClose();
              }
            }}
          >
            Add rule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Kind of rule">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
            {RULE_KINDS.map((k) => (
              <option key={k} value={k}>
                {RULE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        {needsGarments ? (
          <Field label={kind === "never_combine" ? "Garments that shouldn't be worn together" : "Garment"}>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {garments.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-accent" checked={ids.includes(g.id)} onChange={(e) => setIds((s) => (e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id)))} />
                  {g.name}
                </label>
              ))}
            </div>
          </Field>
        ) : null}
        {kind === "avoid_colour" ? (
          <Field label="Colours">
            <TagInput label="Colours" value={colours} onChange={setColours} placeholder="orange, lime…" />
          </Field>
        ) : null}
        {kind === "note" ? (
          <Field label="Rule" hint="Passed to the AI stylist as a standing instruction (the rule-based stylist can't read free text).">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Always wear the waterproof jacket when cycling." />
          </Field>
        ) : null}
        {kind === "prefer_garment" ? <Notice tone="info">A nudge rather than a hard rule: these pieces are favoured when they suit the day.</Notice> : null}
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="perm" className="accent-accent" checked={permanent} onChange={() => setPermanent(true)} /> Permanent
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="perm" className="accent-accent" checked={!permanent} onChange={() => setPermanent(false)} /> For 30 days
          </label>
        </div>
      </div>
    </Modal>
  );
}

export function FeedbackLog({ feedback, names, today }: { feedback: Feedback[]; names: Record<number, string>; today: string }) {
  const { run } = useMutation();
  if (!feedback.length) return <p className="text-sm text-muted">No feedback yet. Use the buttons under any outfit.</p>;
  return (
    <ul className="card divide-y divide-line">
      {feedback.map((f) => {
        const expired = Boolean(f.expiresAt && f.expiresAt < today);
        return (
          <li key={f.id} className={cx("flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm", expired && "opacity-50")}>
            <Badge tone={f.kind === "love" ? "accent" : "neutral"}>{FEEDBACK_LABELS[f.kind]}</Badge>
            <span className="min-w-0 flex-1 truncate text-ink-soft">
              {f.garmentIds.map((id) => names[id] ?? "a removed garment").join(" + ")}
              {f.outfitId ? (
                <>
                  {" "}
                  ·{" "}
                  <Link className="link" href={`/outfits/${f.outfitId}`}>
                    outfit
                  </Link>
                </>
              ) : null}
            </span>
            <span className="text-xs text-muted">
              {f.scope === "permanent" ? "permanent" : f.scope === "temporary" ? "30 days" : "one-off"} · {formatDate(f.createdAt.slice(0, 10))}
            </span>
            <button type="button" aria-label="Forget this feedback" className="text-muted hover:text-danger" onClick={() => run("del", () => api(`/api/feedback/${f.id}`, { method: "DELETE" }), { success: "Forgotten" })}>
              <TrashIcon size={14} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type Gap = { piece: string; why: string; pairsWith: { id: number; name: string }[]; priority: "high" | "medium" | "low"; source: "ai" | "rules" };

type GapResult = { gaps: Gap[]; notice: string | null; generatedBy: string | null };

export function GapAnalysis({ ai }: { ai: AiUi }) {
  const [res, setRes] = useState<GapResult | null>(null);
  const { run, pending } = useMutation();
  const analyse = (useAi: boolean) =>
    run(
      "gaps",
      async () => {
        const r = await api<GapResult>(`/api/gaps${useAi ? "?ai=1" : ""}`);
        setRes(r);
        return r;
      },
      { refresh: false },
    );
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted">Looks at what you actually own and suggests a few versatile pieces that would unlock more outfits – with the garments each would pair with. No brands or shopping links.</p>
      <div className="flex flex-wrap gap-2">
        <Button busy={pending === "gaps"} onClick={() => analyse(false)}>
          <WandIcon size={15} /> Quick check
        </Button>
        {ai.enabled ? (
          <Button variant="accent" busy={pending === "gaps"} onClick={() => analyse(true)}>
            <SparkIcon size={15} /> Ask {ai.label ?? "AI"}
          </Button>
        ) : null}
      </div>
      {res?.notice ? <Notice tone="info">{res.notice}</Notice> : null}
      {res?.generatedBy ? <p className="text-xs text-muted">Suggested by {res.generatedBy} – checked against your wardrobe.</p> : null}
      {res ? (
        res.gaps.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {res.gaps.map((g, i) => (
              <div key={i} className="card p-4">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone={g.priority === "high" ? "accent" : g.priority === "medium" ? "gold" : "neutral"}>{g.priority}</Badge>
                  <h3 className="font-serif text-lg">{g.piece}</h3>
                </div>
                <p className="text-sm text-ink-soft">{g.why}</p>
                {g.pairsWith.length ? (
                  <p className="mt-2 text-xs text-muted">
                    Pairs with:{" "}
                    {g.pairsWith.map((p, j) => (
                      <span key={p.id}>
                        {j ? ", " : ""}
                        <Link href={`/wardrobe/${p.id}`} className="link">
                          {p.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No obvious gaps">Your wardrobe covers the basics well (or it&apos;s still too small to judge – add at least six pieces).</EmptyState>
        )
      ) : null}
    </div>
  );
}
