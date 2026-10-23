import { route } from "@/server/api";
import { exportGarmentsCsv } from "@/server/services/backup";

export const GET = route(() => {
  const date = new Date().toISOString().slice(0, 10);
  return new Response(exportGarmentsCsv(), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="wardrobe-${date}.csv"` },
  });
});
