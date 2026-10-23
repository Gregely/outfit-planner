"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppSettings, SavedLocation } from "@/lib/schemas";
import { CATEGORIES, CATEGORY_LABELS, type CareDefault, type Category } from "@/lib/domain";
import { api } from "@/lib/client-api";
import { Badge, Button, Field, Notice } from "./ui";
import { useConfirm, useMutation, useToast } from "./feedback-ui";
import { DownloadIcon, MapPinIcon, RefreshIcon, SearchIcon, UploadIcon } from "./icons";

type GeoResult = { name: string; latitude: number; longitude: number; timezone: string; country: string | null };

export function LocationSettings({ location }: { location: SavedLocation | null }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState(String(location?.latitude ?? ""));
  const [lon, setLon] = useState(String(location?.longitude ?? ""));
  const [tz, setTz] = useState(location?.timezone ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"));
  const [name, setName] = useState(location?.name ?? "");
  const { run, pending } = useMutation();
  const save = (loc: SavedLocation | null) => run("save", () => api("/api/settings", { method: "PUT", body: { location: loc } }), { success: loc ? `Location set to ${loc.name}` : "Location removed" });
  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <MapPinIcon size={16} />
        {location ? (
          <>
            <span className="font-medium">{location.name}</span>
            <span className="text-muted">
              {location.latitude.toFixed(2)}, {location.longitude.toFixed(2)} · {location.timezone}
            </span>
            <Button size="sm" variant="ghost" onClick={() => save(null)}>
              Remove
            </Button>
            <Button size="sm" variant="ghost" busy={pending === "refresh"} onClick={() => run("refresh", () => api("/api/weather?refresh=1"), { success: "Forecast refreshed" })}>
              <RefreshIcon size={14} /> Refresh forecast
            </Button>
          </>
        ) : (
          <span className="text-muted">No location – outfits use typical seasonal weather unless you set a day&apos;s weather by hand.</span>
        )}
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            "search",
            async () => {
              const r = await api<{ results: GeoResult[] }>(`/api/settings/geocode?q=${encodeURIComponent(q)}`);
              setResults(r.results);
              return r;
            },
            { refresh: false },
          );
        }}
      >
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for your town or city" aria-label="Search location" />
        <Button type="submit" busy={pending === "search"} disabled={q.trim().length < 2}>
          <SearchIcon size={15} /> Search
        </Button>
      </form>
      {results ? (
        results.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-paper-deep"
                  onClick={async () => {
                    await save({ name: r.name, latitude: r.latitude, longitude: r.longitude, timezone: r.timezone, country: r.country });
                    setResults(null);
                    setQ("");
                  }}
                >
                  <span>
                    {r.name}
                    {r.country ? <span className="text-muted">, {r.country}</span> : null}
                  </span>
                  <span className="text-xs text-muted">{r.timezone}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No places found.</p>
        )
      ) : null}
      <button type="button" className="text-xs text-muted underline" onClick={() => setManual((m) => !m)}>
        {manual ? "Hide manual entry" : "Enter coordinates manually (works offline)"}
      </button>
      {manual ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Latitude">
            <input className="input" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Longitude">
            <input className="input" value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Timezone (IANA)">
            <input className="input" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Europe/London" />
          </Field>
          <div className="sm:col-span-4">
            <Button
              variant="primary"
              disabled={!name.trim() || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon)) || !lat || !lon}
              onClick={() => save({ name: name.trim(), latitude: Number(lat), longitude: Number(lon), timezone: tz.trim() || "UTC", country: null })}
            >
              Save location
            </Button>
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted">Forecasts come from Open-Meteo (free, no account) and are cached for 3 hours. Only the coordinates are sent.</p>
    </div>
  );
}

export function GeneralSettings({ settings }: { settings: AppSettings }) {
  const { run } = useMutation();
  const save = (patch: Partial<AppSettings>) => run("save", () => api("/api/settings", { method: "PUT", body: patch }), { success: "Saved" });
  return (
    <div className="card grid gap-4 p-5 sm:grid-cols-2">
      <Field label="Temperature units">
        <select className="input" value={settings.units} onChange={(e) => save({ units: e.target.value as AppSettings["units"] })}>
          <option value="metric">Celsius</option>
          <option value="imperial">Fahrenheit</option>
        </select>
      </Field>
      <Field label="Planner shows">
        <select className="input" value={settings.plannerStart} onChange={(e) => save({ plannerStart: e.target.value as AppSettings["plannerStart"] })}>
          <option value="today">The next seven days</option>
          <option value="monday">Calendar weeks (Monday start)</option>
          <option value="sunday">Calendar weeks (Sunday start)</option>
        </select>
      </Field>
    </div>
  );
}

export function AiSettings({
  enabled,
  status,
}: {
  enabled: boolean;
  status: { enabled: boolean; reason: string | null; configured: boolean; model: string; effort: string | null };
}) {
  const { run, pending } = useMutation();
  const toast = useToast();
  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {status.enabled ? <Badge tone="moss">Active</Badge> : <Badge tone="neutral">Off</Badge>}
        <span className="text-sm">
          Model <code className="rounded bg-paper-deep px-1">{status.model}</code>
          {status.effort ? (
            <>
              {" "}
              · effort <code className="rounded bg-paper-deep px-1">{status.effort}</code>
            </>
          ) : null}
        </span>
      </div>
      {!status.configured ? (
        <Notice tone="info">
          Claude isn&apos;t configured. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart the app. Everything else – wardrobe, illustrations, laundry, the rule-based stylist, planner and backups – works without it.
        </Notice>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-accent"
          checked={enabled}
          onChange={(e) => run("toggle", () => api("/api/settings", { method: "PUT", body: { aiEnabled: e.target.checked } }), { success: e.target.checked ? "Claude switched on" : "Claude switched off" })}
        />
        Use Claude for suggestions, imports and planning
      </label>
      <Button
        disabled={!status.configured}
        busy={pending === "test"}
        onClick={async () => {
          const r = await run("test", () => api<{ ok: boolean; message: string }>("/api/settings/test-ai", { method: "POST" }), { refresh: false });
          if (r) toast({ title: r.ok ? "Claude is working" : "Claude isn't reachable", body: r.message, tone: r.ok ? "success" : "error" });
        }}
      >
        Test connection
      </Button>
      <p className="text-xs text-muted">The API key stays on the server and is never sent to the browser. Every Claude suggestion is checked against your wardrobe and rules before it&apos;s shown.</p>
    </div>
  );
}

export function CareSettings({ care }: { care: Record<Category, CareDefault> }) {
  const { run } = useMutation();
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-4 py-2 font-medium">Category</th>
            <th className="px-4 py-2 font-medium">Needs washing after</th>
            <th className="px-4 py-2 font-medium">Needs ironing</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((c) => (
            <tr key={c} className="border-b border-line last:border-0">
              <td className="px-4 py-2">{CATEGORY_LABELS[c]}</td>
              <td className="px-4 py-2">
                <select
                  aria-label={`${CATEGORY_LABELS[c]} wash after`}
                  className="input w-auto py-1"
                  value={care[c].washAfterWears}
                  onChange={(e) => run("care", () => api("/api/settings/care", { method: "PUT", body: { category: c, washAfterWears: Number(e.target.value), needsIroning: care[c].needsIroning } }), { success: "Saved" })}
                >
                  <option value={0}>Never automatically</option>
                  {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {n} wear{n === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-2">
                <input
                  type="checkbox"
                  aria-label={`${CATEGORY_LABELS[c]} needs ironing`}
                  className="accent-accent"
                  checked={care[c].needsIroning}
                  onChange={(e) => run("care", () => api("/api/settings/care", { method: "PUT", body: { category: c, washAfterWears: care[c].washAfterWears, needsIroning: e.target.checked } }), { success: "Saved" })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-muted">Individual garments can override these on their edit page – a heavy wool jumper and a merino base layer don&apos;t need the same treatment.</p>
    </div>
  );
}

export function BackupSettings({ dbPath, photoPath }: { dbPath: string; photoPath: string }) {
  const file = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const router = useRouter();
  const { run, pending } = useMutation();
  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap gap-2">
        <a href="/api/export/backup" download className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft">
          <DownloadIcon size={15} /> Full backup (JSON)
        </a>
        <a href="/api/export/backup?photos=0" download className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card px-4 py-2 text-sm font-medium hover:border-ink-soft">
          Backup without photos
        </a>
        <a href="/api/export/csv" download className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card px-4 py-2 text-sm font-medium hover:border-ink-soft">
          Wardrobe CSV
        </a>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Choose backup file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            let data: unknown;
            try {
              data = JSON.parse(await f.text());
            } catch {
              await confirm({ title: "Not a backup file", body: "That file isn't valid JSON." });
              return;
            }
            const ok = await confirm({
              title: "Replace all data with this backup?",
              body: "Everything currently in Wardrobe Studio – garments, outfits, plans, history and settings – is replaced. Export a backup first if you might want it back.",
              confirmLabel: "Restore",
              danger: true,
            });
            if (!ok) return;
            const r = await run("restore", () => api<{ restored: { garments: number; outfits: number } }>("/api/import/backup", { body: data }), {
              success: (r) => `Restored ${r.restored.garments} garments and ${r.restored.outfits} outfits`,
            });
            if (r) router.push("/");
          }}
        />
        <Button busy={pending === "restore"} onClick={() => file.current?.click()}>
          <UploadIcon size={15} /> Restore from backup…
        </Button>
      </div>
      <p className="text-xs text-muted">
        Data lives in <code className="break-all">{dbPath}</code>; photos in <code className="break-all">{photoPath}</code>. Restores are validated first and applied all-or-nothing.
      </p>
    </div>
  );
}
