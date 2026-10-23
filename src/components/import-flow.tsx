"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportProposal, ImportMethod } from "@/server/services/importer";
import { CATEGORY_LABELS, type CareDefault, type Category } from "@/lib/domain";
import { api } from "@/lib/client-api";
import { Badge, Button, ColourChip, Field, Notice, cx } from "./ui";
import { DraftPreview, GarmentFields, draftFrom, inputFrom, type GarmentDraft } from "./garment-form";
import { useMutation } from "./feedback-ui";
import { SparkIcon, UploadIcon, WandIcon } from "./icons";

type Row = {
  key: string;
  include: boolean;
  draft: GarmentDraft;
  assumed: string[];
  sourceText: string;
  duplicates: ImportProposal["duplicates"];
  batchDuplicateOf: string | null;
  errors: string[];
  /** "new" or the id of an existing garment whose empty fields should be filled */
  resolution: "new" | number;
  expanded: boolean;
};

const EXAMPLE = `Black Nike polyester shorts for the gym and a grey cotton hoodie.
A green floral midi dress, white leather sneakers and a black waterproof rain jacket.
High-waisted mid-blue straight jeans and a navy wool blazer for work.`

export function ImportFlow({ initialTab, ai, care }: { initialTab: "text" | "csv"; ai: { enabled: boolean; reason: string | null }; care: Record<Category, CareDefault> }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [text, setText] = useState("");
  const [csv, setCsv] = useState("");
  const [useAi, setUseAi] = useState(ai.enabled);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [method, setMethod] = useState<ImportMethod>("rules");
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: { id: number; name: string }[]; updated: { id: number; name: string }[]; skipped: number } | null>(null);
  const { run, pending } = useMutation();

  const load = (res: { method: ImportMethod; proposals: ImportProposal[]; notice: string | null }) => {
    setMethod(res.method);
    setNotice(res.notice);
    setRows(
      res.proposals.map((p) => ({
        key: p.key,
        include: p.errors.length === 0 && !p.batchDuplicateOf && p.duplicates.length === 0,
        draft: draftFrom(p.input),
        assumed: p.assumed,
        sourceText: p.sourceText,
        duplicates: p.duplicates,
        batchDuplicateOf: p.batchDuplicateOf,
        errors: p.errors,
        resolution: "new",
        expanded: false,
      })),
    );
  };

  const extract = () =>
    run(
      "extract",
      async () => {
        const res =
          tab === "text"
            ? await api<{ method: ImportMethod; proposals: ImportProposal[]; notice: string | null }>("/api/import/text", { body: { text, useAi } })
            : await api<{ method: ImportMethod; proposals: ImportProposal[]; notice: string | null }>("/api/import/csv", { body: { csv } });
        load(res);
        return res;
      },
      { refresh: false },
    );

  const selected = rows?.filter((r) => r.include) ?? [];
  const save = async () => {
    if (!rows) return;
    const res = await run(
      "save",
      () =>
        api<{ created: { id: number; name: string }[]; updated: { id: number; name: string }[]; skipped: number }>("/api/import/commit", {
          body: {
            method,
            items: rows.map((r) =>
              !r.include
                ? { action: "skip", input: inputFrom(r.draft) }
                : r.resolution === "new"
                  ? { action: "create", input: inputFrom(r.draft) }
                  : { action: "fill", input: inputFrom(r.draft), targetId: r.resolution },
            ),
          },
        }),
      { refresh: false },
    );
    if (res) {
      setDone(res);
      router.refresh();
    }
  };

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);

  if (done) {
    return (
      <div className="card p-6">
        <h2 className="text-2xl font-medium">Saved</h2>
        <p className="mt-1 text-sm text-muted">
          {done.created.length} added{done.updated.length ? `, ${done.updated.length} existing garment${done.updated.length === 1 ? "" : "s"} filled in` : ""}
          {done.skipped ? `, ${done.skipped} skipped` : ""}.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {[...done.created, ...done.updated].map((g) => (
            <li key={g.id}>
              <Link href={`/wardrobe/${g.id}`} className="link text-sm">
                {g.name}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setDone(null);
              setRows(null);
              setText("");
              setCsv("");
            }}
          >
            Import more
          </Button>
          <Button variant="primary" onClick={() => router.push("/wardrobe")}>
            Go to wardrobe
          </Button>
        </div>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="card p-5 sm:p-6">
        <div role="tablist" className="mb-4 inline-flex rounded-full border border-line-strong p-0.5 text-sm">
          {(["text", "csv"] as const).map((t) => (
            <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("rounded-full px-4 py-1.5", tab === t ? "bg-ink text-paper" : "text-ink-soft")}>
              {t === "text" ? "Describe in words" : "CSV file"}
            </button>
          ))}
        </div>
        {tab === "text" ? (
          <div className="space-y-3">
            <Field label="Your clothes" hint="One garment or many – separate them with new lines, commas or full stops.">
              <textarea className="input min-h-44 font-serif text-base leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} maxLength={20000} />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className={cx("flex items-center gap-2 text-sm", !ai.enabled && "text-muted")}>
                <input type="checkbox" className="accent-accent" checked={useAi} disabled={!ai.enabled} onChange={(e) => setUseAi(e.target.checked)} />
                <SparkIcon size={14} /> Use Claude to read it
                {!ai.enabled ? <span className="text-xs">({ai.reason}; the offline parser will be used)</span> : null}
              </label>
              <div className="flex gap-2">
                {!text ? (
                  <Button variant="ghost" onClick={() => setText(EXAMPLE)}>
                    Try an example
                  </Button>
                ) : null}
                <Button variant="primary" busy={pending === "extract"} disabled={!text.trim()} onClick={extract}>
                  {useAi && ai.enabled ? <SparkIcon size={15} /> : <WandIcon size={15} />} Find garments
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Needs <code>name</code> and <code>category</code> columns. Optional: subcategory, colours (e.g. <code>navy (#1f2a44); cream</code>), pattern, materials, fit, warmth, formality, seasons,
              occasions, style_tags, brand, notes, status… The <Link className="link" href="/api/export/csv">CSV export</Link> uses the same format.
            </p>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-6 text-sm text-muted hover:border-ink-soft">
              <UploadIcon /> {csv ? "CSV loaded – choose another file" : "Choose a .csv file"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setCsv(await f.text());
                }}
              />
            </label>
            <Field label="…or paste CSV">
              <textarea className="input min-h-32 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Button variant="primary" busy={pending === "extract"} disabled={!csv.trim()} onClick={extract}>
                Read CSV
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={method === "ai" ? "accent" : "sky"}>{method === "ai" ? "Read by Claude" : method === "csv" ? "From CSV" : "Offline parser"}</Badge>
          <span className="text-sm text-muted">
            {rows.length} garment{rows.length === 1 ? "" : "s"} found · {selected.length} selected
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setRows((rs) => rs!.map((r) => ({ ...r, include: r.errors.length === 0 })))}>
            Select all
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRows((rs) => rs!.map((r) => ({ ...r, include: false })))}>
            Select none
          </Button>
          <Button size="sm" onClick={() => setRows(null)}>
            Start over
          </Button>
        </div>
      </div>
      {notice ? <Notice tone="warning">{notice}</Notice> : null}
      {rows.length === 0 ? <Notice tone="warning">No garments were recognised. Try naming the type of each piece (blazer, jeans, boots…).</Notice> : null}
      {rows.map((r) => (
        <ProposalCard key={r.key} row={r} care={care} onChange={(patch) => update(r.key, patch)} />
      ))}
      {rows.length ? (
        <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
          <div className="card flex items-center gap-3 px-4 py-3">
            <span className="text-sm text-muted">Nothing is saved until you confirm.</span>
            <Button variant="primary" busy={pending === "save"} disabled={selected.length === 0 || selected.some((r) => !r.draft.name.trim())} onClick={save}>
              Save {selected.length} garment{selected.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProposalCard({ row: r, onChange, care }: { row: Row; onChange: (p: Partial<Row>) => void; care: Record<Category, CareDefault> }) {
  const highlight = useMemo(() => r.assumed.map((a) => a.toLowerCase()), [r.assumed]);
  return (
    <article className={cx("card overflow-hidden transition", !r.include && "opacity-60")}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        <div className="flex items-start gap-3 sm:w-48 sm:flex-col">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="accent-accent" checked={r.include} onChange={(e) => onChange({ include: e.target.checked })} aria-label={`Include ${r.draft.name}`} />
            Include
          </label>
          <div className="aspect-[5/6] w-28 rounded-xl bg-gradient-to-b from-white to-paper sm:w-full">
            <DraftPreview draft={r.draft} className="h-full w-full p-1" />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <Field label="Name">
              <input className="input font-medium" value={r.draft.name} onChange={(e) => onChange({ draft: { ...r.draft, name: e.target.value } })} />
            </Field>
            <Field label="Category">
              <select className="input" value={r.draft.category} onChange={(e) => onChange({ draft: { ...r.draft, category: e.target.value as Category } })}>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {r.draft.subcategory ? <Badge>{r.draft.subcategory}</Badge> : null}
            {r.draft.colours.map((c, i) => (
              <ColourChip key={i} {...c} />
            ))}
            {r.draft.pattern !== "solid" ? <Badge>{r.draft.pattern}</Badge> : null}
            {r.draft.materials.map((m) => (
              <Badge key={m}>{m}</Badge>
            ))}
            {r.draft.fit ? <Badge>{r.draft.fit} fit</Badge> : null}
            {r.draft.styleTags.map((t) => (
              <Badge key={t} tone="moss">
                {t}
              </Badge>
            ))}
            <span>
              warmth {r.draft.warmth}/5 · formality {r.draft.formality}/5
            </span>
          </div>
          {r.sourceText ? <blockquote className="border-l-2 border-line-strong pl-3 font-serif text-sm text-ink-soft italic">“{r.sourceText}”</blockquote> : null}
          {r.assumed.length ? (
            <p className="text-xs text-[#7a5d26]">
              Not stated – defaulted or estimated, please check: <strong>{r.assumed.join(", ")}</strong>
            </p>
          ) : null}
          {r.errors.length ? <Notice tone="error">{r.errors.join(" ")}</Notice> : null}
          {r.batchDuplicateOf ? <Notice tone="warning">This looks like a repeat of another garment in this import, so it&apos;s unticked.</Notice> : null}
          {r.duplicates.length ? (
            <div className="rounded-xl border border-gold/40 bg-gold-soft/50 p-3 text-sm">
              <p className="mb-2 font-medium">You may already own this:</p>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2">
                  <input type="radio" className="accent-accent" name={`res-${r.key}`} checked={r.resolution === "new" && r.include} onChange={() => onChange({ resolution: "new", include: true })} />
                  Add as a new garment
                </label>
                {r.duplicates.map((d) => (
                  <label key={d.id} className="flex items-center gap-2">
                    <input type="radio" className="accent-accent" name={`res-${r.key}`} checked={r.resolution === d.id && r.include} onChange={() => onChange({ resolution: d.id, include: true })} />
                    Only fill in empty fields of{" "}
                    <Link href={`/wardrobe/${d.id}`} target="_blank" className="link">
                      {d.name}
                    </Link>
                    <span className="text-xs text-muted">({Math.round(d.score * 100)}% match)</span>
                  </label>
                ))}
                <label className="flex items-center gap-2">
                  <input type="radio" className="accent-accent" name={`res-${r.key}`} checked={!r.include} onChange={() => onChange({ include: false })} />
                  Skip it
                </label>
              </div>
            </div>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => onChange({ expanded: !r.expanded })} aria-expanded={r.expanded}>
            {r.expanded ? "Hide details" : "Edit all fields"}
          </Button>
        </div>
      </div>
      {r.expanded ? (
        <div className="border-t border-line bg-white/40 p-4 sm:p-5">
          <GarmentFields value={r.draft} onChange={(draft) => onChange({ draft })} care={care} highlight={highlight} />
        </div>
      ) : null}
    </article>
  );
}
