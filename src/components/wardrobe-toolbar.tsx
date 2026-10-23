"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, CATEGORY_LABELS, STATUSES, STATUS_LABELS } from "@/lib/domain";
import { SearchIcon } from "./icons";

const SORTS = [
  ["category", "By category"],
  ["name", "Name"],
  ["newest", "Newest"],
  ["most-worn", "Most worn"],
  ["least-worn", "Least worn"],
  ["last-worn", "Recently worn"],
] as const;

export function WardrobeToolbar({ total }: { total: number }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update("q", q.trim());
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const selectCls = "input w-auto py-1.5 pr-8 text-xs";
  return (
    <div className="card mb-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <label className="relative flex-1">
        <span className="sr-only">Search wardrobe</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={16} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search colour, fabric, style…" className="input pl-9" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Category" className={selectCls} value={params.get("category") ?? ""} onChange={(e) => update("category", e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select aria-label="Status" className={selectCls} value={params.get("status") ?? params.get("availability") ?? ""} onChange={(e) => {
          const v = e.target.value;
          const next = new URLSearchParams(params.toString());
          next.delete("status");
          next.delete("availability");
          if (v === "available" || v === "unavailable") next.set("availability", v);
          else if (v) next.set("status", v);
          router.replace(`${path}?${next.toString()}`, { scroll: false });
        }}>
          <option value="">Any status</option>
          <option value="available">Available now</option>
          <option value="unavailable">Unavailable now</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select aria-label="Season" className={selectCls} value={params.get("season") ?? ""} onChange={(e) => update("season", e.target.value)}>
          <option value="">Any season</option>
          {["spring", "summer", "autumn", "winter"].map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select aria-label="Sort" className={selectCls} value={params.get("sort") ?? "category"} onChange={(e) => update("sort", e.target.value === "category" ? "" : e.target.value)}>
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted" aria-live="polite">
          {total} item{total === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
