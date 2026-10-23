"use client";

import { api } from "@/lib/client-api";
import { Button, ButtonLink } from "./ui";
import { useMutation } from "./feedback-ui";
import { RefreshIcon, SparkIcon } from "./icons";

export function TodayActions({ date, useAi, regenerate, locked }: { date: string; useAi: boolean; regenerate?: boolean; locked?: boolean }) {
  const { run, pending } = useMutation();
  const go = () =>
    run("today", () => api<{ notice: string | null }>(`/api/planner/day/${date}/regenerate`, { body: { useAi } }), {
      success: (r) => r.notice ?? "Here's an idea for today",
    });
  if (regenerate) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" busy={pending === "today"} disabled={locked} title={locked ? "Unlock the day in the planner to regenerate" : undefined} onClick={go}>
          <RefreshIcon size={14} /> Something different
        </Button>
        <ButtonLink size="sm" href="/outfits" variant="ghost">
          Ask the stylist
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button variant="accent" busy={pending === "today"} onClick={go}>
        <SparkIcon size={15} /> Suggest today&apos;s outfit
      </Button>
      <ButtonLink href="/outfits/new">Pick it myself</ButtonLink>
    </div>
  );
}
