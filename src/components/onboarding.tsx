"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { Button, ButtonLink } from "./ui";
import { useMutation } from "./feedback-ui";
import { PlusIcon, SparkIcon, UploadIcon } from "./icons";

export function OnboardingActions() {
  const router = useRouter();
  const { run, pending } = useMutation();
  return (
    <>
      <ButtonLink href="/wardrobe/import" variant="primary">
        <SparkIcon size={16} /> Describe my clothes
      </ButtonLink>
      <ButtonLink href="/wardrobe/new">
        <PlusIcon size={16} /> Add one garment
      </ButtonLink>
      <ButtonLink href="/wardrobe/import?tab=csv">
        <UploadIcon size={16} /> Import CSV
      </ButtonLink>
      <Button
        variant="ghost"
        busy={pending === "sample"}
        onClick={async () => {
          const res = await run("sample", () => api<{ created: number }>("/api/sample", { method: "POST" }), {
            success: (r) => `Added ${r.created} sample garments – edit or delete them any time`,
          });
          if (res) router.push("/wardrobe");
        }}
      >
        Load a sample wardrobe
      </Button>
    </>
  );
}
