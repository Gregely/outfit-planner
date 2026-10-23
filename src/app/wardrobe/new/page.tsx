import { Suspense } from "react";
import { connection } from "next/server";
import { GarmentForm } from "@/components/garment-form";
import { PageHeader, Skeleton } from "@/components/ui";
import { getCareDefaults } from "@/server/services/settings";

export const metadata = { title: "Add garment" };

export default function NewGarmentPage() {
  return (
    <>
      <PageHeader eyebrow="Wardrobe" title="Add a garment" description="Only the name and category are required. The drawing updates as you go." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <NewForm />
      </Suspense>
    </>
  );
}

async function NewForm() {
  await connection();
  return <GarmentForm care={getCareDefaults()} />;
}
