import { Suspense } from "react";
import { connection } from "next/server";
import { listGarments } from "@/server/services/garments";
import { PageHeader, Skeleton } from "@/components/ui";
import { LaundryBoard } from "@/components/laundry-board";

export const metadata = { title: "Laundry" };

export default function LaundryPage() {
  return (
    <>
      <PageHeader eyebrow="Care" title="Laundry" description="Everything that isn't ready to wear, and what's close to needing a wash. Move pieces through the wash in bulk." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <LaundryContent />
      </Suspense>
    </>
  );
}

async function LaundryContent() {
  await connection();
  const all = listGarments({ includeRetired: false });
  return <LaundryBoard garments={all} />;
}
