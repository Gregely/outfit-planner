import { route } from "@/server/api";
import { exportBackup } from "@/server/services/backup";

export const GET = route((req) => {
  const includePhotos = new URL(req.url).searchParams.get("photos") !== "0";
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(exportBackup({ includePhotos }), null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="wardrobe-backup-${date}.json"` },
  });
});
