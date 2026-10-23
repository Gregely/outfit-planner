import "server-only";
import { photoStore } from "@/server/platform/photo-store";
import { BadRequestError, NotFoundError } from "@/server/errors";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_NAME_RE = /^\d+-[0-9a-f-]{36}\.(jpg|png|webp)$/;
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Human-readable location of the photo store (shown in Settings). */
export function photoDir() {
  return photoStore.location();
}

/** Detect the image type from its magic bytes; the client-supplied MIME type is not trusted. */
export function sniffImage(buf: Uint8Array): "jpg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a)
    return "png";
  if (
    buf.length >= 12 &&
    String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) === "RIFF" &&
    String.fromCharCode(buf[8], buf[9], buf[10], buf[11]) === "WEBP"
  )
    return "webp";
  return null;
}

export async function savePhotoFile(garmentId: number, buf: Uint8Array): Promise<string> {
  if (buf.length === 0) throw new BadRequestError("The file is empty.");
  if (buf.length > MAX_PHOTO_BYTES) throw new BadRequestError("Photos must be 5 MB or smaller.");
  const ext = sniffImage(buf);
  if (!ext) throw new BadRequestError("Only JPEG, PNG or WebP images are supported.");
  const name = `${garmentId}-${globalThis.crypto.randomUUID()}.${ext}`;
  await photoStore.write(name, buf);
  return name;
}

export async function readPhotoFile(name: string): Promise<{ data: Uint8Array; mime: string }> {
  if (!PHOTO_NAME_RE.test(name)) throw new NotFoundError("Photo");
  const data = await photoStore.read(name);
  if (!data) throw new NotFoundError("Photo");
  return { data, mime: MIME[name.split(".").pop()!] };
}

export function deletePhotoFile(name: string) {
  if (!PHOTO_NAME_RE.test(name)) return;
  try {
    photoStore.remove(name);
  } catch {
    // ignore missing files
  }
}
