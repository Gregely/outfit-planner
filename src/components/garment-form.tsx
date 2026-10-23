"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CLOSURES,
  COLLARS,
  DEFAULT_CARE,
  FITS,
  FORMALITY_LABELS,
  LAPELS,
  LAYERING_LABELS,
  LAYERING_ROLES,
  LEG_SHAPES,
  LENGTHS,
  NECKLINES,
  PATTERNS,
  SEASONS,
  SHOE_HEIGHTS,
  SLEEVES,
  STATUSES,
  STATUS_LABELS,
  SUBCATEGORIES,
  SUGGESTED_OCCASIONS,
  SUGGESTED_STYLE_TAGS,
  TEXTURES,
  WARMTH_LABELS,
  WEATHER_TAGS,
  defaultLayeringRole,
  type CareDefault,
  type Category,
  type GarmentDetails,
} from "@/lib/domain";
import { resolveColourName, type Colour } from "@/lib/colours";
import type { GarmentInput } from "@/lib/schemas";
import { api } from "@/lib/client-api";
import { InlineArt } from "./garment-art";
import { Button, Field, cx } from "./ui";
import { CloseIcon, PlusIcon } from "./icons";
import { useMutation } from "./feedback-ui";

export type GarmentDraft = {
  name: string;
  category: Category;
  subcategory: string;
  colours: Colour[];
  pattern: (typeof PATTERNS)[number];
  materials: string[];
  fit: string;
  silhouette: string;
  layeringRole: string;
  warmth: number;
  formality: number;
  seasons: string[];
  weather: string[];
  occasions: string[];
  styleTags: string[];
  brand: string;
  notes: string;
  details: GarmentDetails;
  status: (typeof STATUSES)[number];
  washAfterWears: string;
  needsIroning: "" | "yes" | "no";
};

export function draftFrom(g?: Partial<GarmentInput> | null): GarmentDraft {
  return {
    name: g?.name ?? "",
    category: g?.category ?? "tops",
    subcategory: g?.subcategory ?? "",
    colours: g?.colours ? [...g.colours] : [],
    pattern: g?.pattern ?? "solid",
    materials: g?.materials ?? [],
    fit: g?.fit ?? "",
    silhouette: g?.silhouette ?? "",
    layeringRole: g?.layeringRole ?? "",
    warmth: g?.warmth ?? 3,
    formality: g?.formality ?? 3,
    seasons: g?.seasons ?? [],
    weather: g?.weather ?? [],
    occasions: g?.occasions ?? [],
    styleTags: g?.styleTags ?? [],
    brand: g?.brand ?? "",
    notes: g?.notes ?? "",
    details: g?.details ?? {},
    status: g?.status ?? "clean",
    washAfterWears: g?.washAfterWears === null || g?.washAfterWears === undefined ? "" : String(g.washAfterWears),
    needsIroning: g?.needsIroning === null || g?.needsIroning === undefined ? "" : g.needsIroning ? "yes" : "no",
  };
}

export function inputFrom(d: GarmentDraft): GarmentInput {
  return {
    name: d.name.trim(),
    category: d.category,
    subcategory: d.subcategory.trim() || null,
    colours: d.colours.filter((c) => c.name.trim()),
    pattern: d.pattern,
    materials: d.materials,
    fit: (d.fit || null) as GarmentInput["fit"],
    silhouette: d.silhouette.trim() || null,
    layeringRole: (d.layeringRole || null) as GarmentInput["layeringRole"],
    warmth: d.warmth,
    formality: d.formality,
    seasons: d.seasons as GarmentInput["seasons"],
    weather: d.weather as GarmentInput["weather"],
    occasions: d.occasions,
    styleTags: d.styleTags,
    brand: d.brand.trim() || null,
    notes: d.notes.trim() || null,
    details: d.details,
    status: d.status,
    washAfterWears: d.washAfterWears === "" ? null : Number(d.washAfterWears),
    needsIroning: d.needsIroning === "" ? null : d.needsIroning === "yes",
  };
}

/* ------------------------------------------------------------------ */
/* Small inputs                                                        */
/* ------------------------------------------------------------------ */

export function TagInput({ value, onChange, suggestions = [], placeholder, label }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string; label: string }) {
  const [text, setText] = useState("");
  const listId = useMemo(() => `tags-${label.replace(/\W/g, "")}`, [label]);
  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])].slice(0, 12));
    setText("");
  };
  return (
    <div className="rounded-lg border border-line-strong bg-white/70 px-2 py-1.5 focus-within:border-accent">
      <div className="flex flex-wrap items-center gap-1">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-paper-deep px-2 py-0.5 text-xs">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="text-muted hover:text-ink">
              <CloseIcon size={11} />
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          list={listId}
          value={text}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text && add(text)}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
        <datalist id={listId}>
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

export function Scale({ value, onChange, labels, label }: { value: number; onChange: (n: number) => void; labels: Record<number, string>; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex overflow-hidden rounded-lg border border-line-strong">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          title={labels[n]}
          onClick={() => onChange(n)}
          className={cx("flex-1 border-r border-line-strong py-1.5 text-xs last:border-r-0", value === n ? "bg-ink text-paper" : "bg-white/70 hover:bg-paper-deep")}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function ChipToggle({ options, value, onChange, label }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cx("rounded-full border px-2.5 py-1 text-xs capitalize transition", on ? "border-ink bg-ink text-paper" : "border-line-strong bg-white/70 hover:border-ink-soft")}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Select({ value, onChange, options, label, empty }: { value: string; onChange: (v: string) => void; options: readonly string[] | { value: string; label: string }[]; label: string; empty?: string }) {
  return (
    <select aria-label={label} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {empty !== undefined ? <option value="">{empty}</option> : null}
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

function ColoursEditor({ value, onChange }: { value: Colour[]; onChange: (v: Colour[]) => void }) {
  const set = (i: number, patch: Partial<Colour>) => onChange(value.map((c, j) => (i === j ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-1.5">
      {value.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`Colour ${i + 1} swatch`}
            value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#888888"}
            onChange={(e) => set(i, { hex: e.target.value })}
            className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-line-strong bg-white p-0.5"
          />
          <input
            aria-label={`Colour ${i + 1} name`}
            className="input"
            value={c.name}
            placeholder="e.g. dark brown, almost charcoal"
            onChange={(e) => set(i, { name: e.target.value })}
            onBlur={(e) => {
              const hex = resolveColourName(e.target.value);
              if (hex) set(i, { name: e.target.value, hex });
            }}
          />
          <button type="button" aria-label={`Remove colour ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-full p-1.5 text-muted hover:bg-paper-deep hover:text-ink">
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
      {value.length < 6 ? (
        <Button size="sm" variant="ghost" onClick={() => onChange([...value, { name: "", hex: "#8a8c8e" }])}>
          <PlusIcon size={14} /> Add colour
        </Button>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-line pt-4">
      <legend className="eyebrow pr-2">{title}</legend>
      {children}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

export function GarmentFields({
  value: d,
  onChange,
  showStatus,
  care,
  highlight = [],
}: {
  value: GarmentDraft;
  onChange: (d: GarmentDraft) => void;
  showStatus?: boolean;
  care?: Record<Category, CareDefault>;
  highlight?: string[];
}) {
  const set = <K extends keyof GarmentDraft>(k: K, v: GarmentDraft[K]) => onChange({ ...d, [k]: v });
  const setDetail = <K extends keyof GarmentDetails>(k: K, v: GarmentDetails[K] | "") => {
    const next = { ...d.details };
    if (v === "" || v === undefined) delete next[k];
    else next[k] = v as GarmentDetails[K];
    onChange({ ...d, details: next });
  };
  const hl = (f: string) => (highlight.includes(f) ? "rounded-lg ring-2 ring-gold/60 ring-offset-2 ring-offset-card" : "");
  const catCare = (care ?? DEFAULT_CARE)[d.category];
  const autoRole = defaultLayeringRole(d.category, d.subcategory);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <input className="input" required value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Black running shorts" />
        </Field>
        <Field label="Category">
          <Select label="Category" value={d.category} onChange={(v) => set("category", v as Category)} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
        </Field>
        <Field label="Type" hint="Pick a suggestion or write your own">
          <input className="input" list={`sub-${d.category}`} value={d.subcategory} onChange={(e) => set("subcategory", e.target.value)} placeholder={SUBCATEGORIES[d.category][0]} />
          <datalist id={`sub-${d.category}`}>
            {SUBCATEGORIES[d.category].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
      </div>

      <Group title="Look">
        <div className={hl("colours")}>
          <Field label="Colours">
            <ColoursEditor value={d.colours} onChange={(v) => set("colours", v)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Pattern">
            <Select label="Pattern" value={d.pattern} onChange={(v) => set("pattern", v as GarmentDraft["pattern"])} options={PATTERNS} />
          </Field>
          <Field label="Fit" className={hl("fit")}>
            <Select label="Fit" value={d.fit} onChange={(v) => set("fit", v)} options={FITS} empty="Not specified" />
          </Field>
          <Field label="Silhouette">
            <input className="input" value={d.silhouette} onChange={(e) => set("silhouette", e.target.value)} placeholder="e.g. wide-leg, cropped" />
          </Field>
        </div>
        <Field label="Materials" className={hl("materials")}>
          <TagInput label="Materials" value={d.materials} onChange={(v) => set("materials", v)} suggestions={["cotton", "polyester", "wool", "denim", "linen", "nylon", "elastane", "leather", "silk", "viscose", "fleece", "cashmere"]} placeholder="wool, cotton…" />
        </Field>
      </Group>

      <Group title="Wearing it">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Warmth · ${WARMTH_LABELS[d.warmth]}`} className={hl("warmth")}>
            <Scale label="Warmth" value={d.warmth} onChange={(v) => set("warmth", v)} labels={WARMTH_LABELS} />
          </Field>
          <Field label={`Formality · ${FORMALITY_LABELS[d.formality]}`} className={hl("formality")}>
            <Scale label="Formality" value={d.formality} onChange={(v) => set("formality", v)} labels={FORMALITY_LABELS} />
          </Field>
          <Field label="Layering role">
            <Select
              label="Layering role"
              value={d.layeringRole}
              onChange={(v) => set("layeringRole", v)}
              options={LAYERING_ROLES.map((r) => ({ value: r, label: LAYERING_LABELS[r] }))}
              empty={`Automatic (${LAYERING_LABELS[autoRole].toLowerCase()})`}
            />
          </Field>
          {showStatus ? (
            <Field label="Availability">
              <Select label="Availability" value={d.status} onChange={(v) => set("status", v as GarmentDraft["status"])} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
            </Field>
          ) : null}
        </div>
        <Field label="Seasons" hint="Leave empty for all year">
          <ChipToggle label="Seasons" options={SEASONS} value={d.seasons} onChange={(v) => set("seasons", v)} />
        </Field>
        <Field label="Weather">
          <ChipToggle label="Weather" options={WEATHER_TAGS} value={d.weather} onChange={(v) => set("weather", v)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Occasions">
            <TagInput label="Occasions" value={d.occasions} onChange={(v) => set("occasions", v)} suggestions={SUGGESTED_OCCASIONS} placeholder="college, date…" />
          </Field>
          <Field label="Style tags">
            <TagInput label="Style tags" value={d.styleTags} onChange={(v) => set("styleTags", v)} suggestions={SUGGESTED_STYLE_TAGS} placeholder="your own words…" />
          </Field>
        </div>
      </Group>

      <Group title="Care">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Wash after" hint={`Blank uses the ${CATEGORY_LABELS[d.category].toLowerCase()} default (${catCare.washAfterWears === 0 ? "never automatic" : `${catCare.washAfterWears} wear${catCare.washAfterWears === 1 ? "" : "s"}`}). 0 = never automatic.`}>
            <input className="input" type="number" min={0} max={100} value={d.washAfterWears} onChange={(e) => set("washAfterWears", e.target.value)} placeholder="Default" />
          </Field>
          <Field label="Needs ironing">
            <Select
              label="Needs ironing"
              value={d.needsIroning}
              onChange={(v) => set("needsIroning", v as GarmentDraft["needsIroning"])}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
              empty={`Default (${catCare.needsIroning ? "yes" : "no"})`}
            />
          </Field>
        </div>
      </Group>

      <Group title="Notes">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Brand">
            <input className="input" value={d.brand} onChange={(e) => set("brand", e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-20" value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Where it's from, how it fits, what it goes with…" />
        </Field>
      </Group>

      <details className="group border-t border-line pt-4">
        <summary className="eyebrow cursor-pointer list-none">
          <span className="group-open:hidden">▸</span>
          <span className="hidden group-open:inline">▾</span> Drawing details (optional)
        </summary>
        <p className="mt-2 mb-3 text-xs text-muted">Fine-tune the illustration. These are inferred from the type when left blank.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ["sleeve", SLEEVES],
              ["neckline", NECKLINES],
              ["collar", COLLARS],
              ["lapel", LAPELS],
              ["closure", CLOSURES],
              ["length", LENGTHS],
              ["leg", LEG_SHAPES],
              ["height", SHOE_HEIGHTS],
              ["texture", TEXTURES],
            ] as const
          ).map(([k, opts]) => (
            <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
              <Select label={k} value={(d.details[k] as string) ?? ""} onChange={(v) => setDetail(k, v as never)} options={opts} empty="Auto" />
            </Field>
          ))}
          {(["pockets", "hood", "cuffs"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm capitalize">
              <input type="checkbox" checked={Boolean(d.details[k])} onChange={(e) => setDetail(k, e.target.checked ? true : "")} className="accent-accent" />
              {k === "cuffs" ? "Turn-ups / cuffs" : k}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

export function DraftPreview({ draft, className }: { draft: GarmentDraft; className?: string }) {
  const input = useMemo(
    () => ({
      name: draft.name,
      category: draft.category,
      subcategory: draft.subcategory,
      colours: draft.colours.filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex)),
      pattern: draft.pattern,
      materials: draft.materials,
      fit: (draft.fit || null) as GarmentInput["fit"],
      details: draft.details,
    }),
    [draft],
  );
  return <InlineArt input={input} className={className} label={`Preview of ${draft.name || "garment"}`} />;
}

/* ------------------------------------------------------------------ */
/* Full form                                                           */
/* ------------------------------------------------------------------ */

export function GarmentForm({ initial, garmentId, care }: { initial?: Partial<GarmentInput>; garmentId?: number; care: Record<Category, CareDefault> }) {
  const router = useRouter();
  const [draft, setDraft] = useState<GarmentDraft>(() => draftFrom(initial));
  const { run, pending } = useMutation();
  const editing = garmentId !== undefined;
  const save = async () => {
    const body = inputFrom(draft);
    const res = await run(
      "save",
      () =>
        editing
          ? api<{ garment: { id: number } }>(`/api/garments/${garmentId}`, { method: "PATCH", body })
          : api<{ garment: { id: number } }>("/api/garments", { body }),
      { success: editing ? "Saved" : "Added to your wardrobe", refresh: false },
    );
    if (res) {
      router.push(`/wardrobe/${res.garment.id}`);
      router.refresh();
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-6 lg:grid-cols-[1fr_280px]"
    >
      <div className="card p-5 sm:p-6">
        <GarmentFields value={draft} onChange={setDraft} showStatus={editing} care={care} />
      </div>
      <aside className="order-first lg:order-none">
        <div className="card sticky top-6 p-4">
          <p className="eyebrow mb-2">Live illustration</p>
          <div className="aspect-[5/6] rounded-xl bg-gradient-to-b from-white to-paper">
            <DraftPreview draft={draft} className="h-full w-full p-2" />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button type="submit" variant="primary" busy={pending === "save"} disabled={!draft.name.trim()}>
              {editing ? "Save changes" : "Add garment"}
            </Button>
            <Button variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </div>
      </aside>
    </form>
  );
}
