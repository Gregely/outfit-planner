import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { GarmentForm } from "@/components/garment-form";
import { PageHeader, Skeleton } from "@/components/ui";
import { getCareDefaults } from "@/server/services/settings";
import { getGarmentRecord } from "@/server/services/garments";
import { NotFoundError } from "@/server/errors";

export const metadata = { title: "Edit garment" };

export default function EditGarmentPage(props: PageProps<"/wardrobe/[id]/edit">) {
  return (
    <>
      <PageHeader eyebrow="Wardrobe" title="Edit garment" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <EditForm params={props.params} />
      </Suspense>
    </>
  );
}

async function EditForm({ params }: { params: PageProps<"/wardrobe/[id]/edit">["params"] }) {
  const { id } = await params;
  await connection();
  let g;
  try {
    g = getGarmentRecord(Number(id));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  return <GarmentForm garmentId={g.id} care={getCareDefaults()} initial={{ ...g, subcategory: g.subcategory, fit: g.fit, layeringRole: g.layeringRole }} />;
}
