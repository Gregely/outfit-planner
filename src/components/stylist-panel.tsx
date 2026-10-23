"use client";

import { useState } from "react";
import type { OutfitView } from "@/server/services/outfits";
import { api } from "@/lib/client-api";
import { Button, Field, Notice, Spinner, cx } from "./ui";
import { OutfitCard } from "./outfit-card";
import { useMutation } from "./feedback-ui";
import { CloseIcon, SparkIcon, WandIcon } from "./icons";

const OCCASIONS = ["College", "Work", "Date", "Party", "Presentation", "Evening out", "Relaxed day", "Travel"];

type GarmentLite = { id: number; name: string; available: boolean };

function GarmentPicker({ label, all, value, onChange }: { label: string; all: GarmentLite[]; value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState("");
  const listId = `pick-${label.replace(/\W/g, "")}`;
  const add = (name: string) => {
    const g = all.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (g && !value.includes(g.id)) onChange([...value, g.id]);
    setText("");
  };
  return (
    <Field label={label}>
      <div className="rounded-lg border border-line-strong bg-white/70 px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-paper-deep px-2 py-0.5 text-xs">
              {all.find((g) => g.id === id)?.name ?? `#${id}`}
              <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((x) => x !== id))}>
                <CloseIcon size={11} />
              </button>
            </span>
          ))}
          <input
            aria-label={label}
            list={listId}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (all.some((g) => g.name === e.target.value)) add(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(text);
              }
            }}
            placeholder={value.length ? "" : "Type a garment name…"}
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
          />
          <datalist id={listId}>
            {all.map((g) => (
              <option key={g.id} value={g.name}>
                {g.available ? "" : "(unavailable)"}
              </option>
            ))}
          </datalist>
        </div>
      </div>
    </Field>
  );
}

export function StylistPanel({ garments, today, ai }: { garments: GarmentLite[]; today: string; ai: { enabled: boolean; reason: string | null } }) {
  const [prompt, setPrompt] = useState("");
  const [occasion, setOccasion] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [include, setInclude] = useState<number[]>([]);
  const [exclude, setExclude] = useState<number[]>([]);
  const [count, setCount] = useState(3);
  const [useAi, setUseAi] = useState(ai.enabled);
  const [result, setResult] = useState<{ outfits: OutfitView[]; source: string; notice: string | null } | null>(null);
  const { run, pending } = useMutation();
  const ask = () =>
    run(
      "ask",
      async () => {
        setResult(null);
        const r = await api<{ outfits: OutfitView[]; source: string; notice: string | null }>("/api/stylist/suggest", {
          body: { prompt, occasion, date, includeGarmentIds: include, excludeGarmentIds: exclude, count, useAi },
        });
        setResult(r);
        return r;
      },
      { refresh: false },
    );
  return (
    <section className="mb-10">
      <div className="card overflow-hidden">
        <div className="border-b border-line bg-gradient-to-r from-accent-soft/60 to-transparent px-5 py-4">
          <p className="eyebrow">The stylist</p>
          <h2 className="text-2xl font-medium">What are you dressing for?</h2>
        </div>
        <div className="space-y-4 p-5">
          <textarea
            aria-label="Ask the stylist"
            className="input min-h-20 font-serif text-base"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Seminar in the morning, then drinks with friends – something smart but not stiff, and use my tweed blazer."
          />
          <div className="flex flex-wrap gap-1.5">
            {OCCASIONS.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={occasion === o}
                onClick={() => setOccasion(occasion === o ? null : o)}
                className={cx("rounded-full border px-3 py-1 text-xs transition", occasion === o ? "border-ink bg-ink text-paper" : "border-line-strong hover:border-ink-soft")}
              >
                {o}
              </button>
            ))}
          </div>
          <details className="rounded-xl border border-line px-4 py-2">
            <summary className="cursor-pointer text-sm text-ink-soft">Date, pieces to use or avoid, number of ideas</summary>
            <div className="grid gap-3 py-3 sm:grid-cols-2">
              <Field label="For">
                <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="How many ideas">
                <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <GarmentPicker label="Must include" all={garments} value={include} onChange={setInclude} />
              <GarmentPicker label="Leave out" all={garments} value={exclude} onChange={setExclude} />
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className={cx("flex items-center gap-2 text-sm", !ai.enabled && "text-muted")}>
              <input type="checkbox" className="accent-accent" checked={useAi && ai.enabled} disabled={!ai.enabled} onChange={(e) => setUseAi(e.target.checked)} />
              <SparkIcon size={14} /> Ask Claude
              {!ai.enabled ? <span className="text-xs">({ai.reason} – the rule-based stylist will answer)</span> : null}
            </label>
            <Button variant="accent" busy={pending === "ask"} onClick={ask}>
              {useAi && ai.enabled ? <SparkIcon size={15} /> : <WandIcon size={15} />} Suggest outfits
            </Button>
          </div>
        </div>
      </div>
      {pending === "ask" ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted">
          <Spinner /> {useAi && ai.enabled ? "Claude is going through your wardrobe…" : "Putting outfits together…"}
        </div>
      ) : null}
      {result ? (
        <div className="mt-6 space-y-3" aria-live="polite">
          {result.notice ? <Notice tone="info">{result.notice}</Notice> : null}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {result.outfits.map((o) => (
              <OutfitCard key={o.id} outfit={o} today={today} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
