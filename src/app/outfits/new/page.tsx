import { Suspense } from "react";
import { connection } from "next/server";
import { listGarments } from "@/server/services/garments";
import { OutfitBuilder } from "@/components/outfit-builder";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { OnboardingActions } from "@/components/onboarding";

export const metadata = { title: "Build an outfit" };

export default function NewOutfitPage() {
  return (
    <>
      <PageHeader eyebrow="Outfits" title="Build an outfit" description="Pick pieces from your wardrobe. The board checks the basics as you go." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Builder />
      </Suspense>
    </>
  );
}

async function Builder() {
  await connection();
  const garments = listGarments();
  if (!garments.length) return <EmptyState title="No garments yet" action={<OnboardingActions />} />;
  return <OutfitBuilder garments={garments} />;
}
