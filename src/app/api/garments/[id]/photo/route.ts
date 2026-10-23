import { eq } from "drizzle-orm";
import { route, intParam } from "@/server/api";
import { getDb } from "@/server/db";
import { garments } from "@/server/db/schema";
import { getGarmentRecord, getGarment } from "@/server/services/garments";
import { deletePhotoFile, savePhotoFile, MAX_PHOTO_BYTES } from "@/server/services/photos";
import { BadRequestError } from "@/server/errors";

type P = { id: string };

export const POST = route<P>(async (req, { id }) => {
  const gid = intParam(id);
  const existing = getGarmentRecord(gid);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_PHOTO_BYTES + 64 * 1024) throw new BadRequestError("Photos must be 5 MB or smaller.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!file || typeof file === "string") throw new BadRequestError("Choose an image to upload.");
  const name = savePhotoFile(gid, new Uint8Array(await file.arrayBuffer()));
  getDb().update(garments).set({ photoFile: name, updatedAt: new Date().toISOString() }).where(eq(garments.id, gid)).run();
  if (existing.photoFile) deletePhotoFile(existing.photoFile);
  return { garment: getGarment(gid) };
});

export const DELETE = route<P>((_req, { id }) => {
  const gid = intParam(id);
  const existing = getGarmentRecord(gid);
  if (existing.photoFile) deletePhotoFile(existing.photoFile);
  getDb().update(garments).set({ photoFile: null }).where(eq(garments.id, gid)).run();
  return { garment: getGarment(gid) };
});
