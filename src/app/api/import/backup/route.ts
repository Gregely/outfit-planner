import { z } from "zod";
import { route, readJson } from "@/server/api";
import { restoreBackup } from "@/server/services/backup";

export const POST = route(async (req) => {
  const body = await readJson(req, z.unknown(), { maxBytes: 200_000_000 });
  return { restored: await restoreBackup(body) };
});
