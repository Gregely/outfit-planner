import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader, Skeleton } from "@/components/ui";
import { ImportFlow } from "@/components/import-flow";
import { aiUi } from "@/server/ai/client";
import { getCareDefaults } from "@/server/services/settings";

export const metadata = { title: "Import garments" };

export default function ImportPage(props: PageProps<"/wardrobe/import">) {
  return (
    <>
      <PageHeader
        eyebrow="Wardrobe"
        title="Import garments"
        description="Describe your clothes the way you'd tell a friend. Each garment becomes its own record – you review everything before it's saved."
      />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <ImportContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function ImportContent({ searchParams }: { searchParams: PageProps<"/wardrobe/import">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const ai = aiUi("import");
  return (
    <ImportFlow
      initialTab={sp.tab === "csv" ? "csv" : "text"}
      ai={ai}
      care={getCareDefaults()}
    />
  );
}
