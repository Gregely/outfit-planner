import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BadRequestError, NotFoundError } from "@/server/errors";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const NAME_RE = /^\d+-[0-9a-f-]{36}\.(jpg|png|webp)$/;
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function photoDir() {
  const configured = process.env.UPLOADS_DIR?.trim();
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured || path.join("data", "uploads"));
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

export function savePhotoFile(garmentId: number, buf: Uint8Array): string {
  if (buf.length === 0) throw new BadRequestError("The file is empty.");
  if (buf.length > MAX_PHOTO_BYTES) throw new BadRequestError("Photos must be 5 MB or smaller.");
  const ext = sniffImage(buf);
  if (!ext) throw new BadRequestError("Only JPEG, PNG or WebP images are supported.");
  const dir = photoDir();
  fs.mkdirSync(dir, { recursive: true });
  const name = `${garmentId}-${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ dir, name), buf, { flag: "wx" });
  return name;
}

function resolveSafe(name: string) {
  if (!NAME_RE.test(name)) throw new NotFoundError("Photo");
  const dir = photoDir();
  const full = path.resolve(/*turbopackIgnore: true*/ dir, name);
  if (path.dirname(full) !== dir) throw new NotFoundError("Photo");
  return full;
}

export function readPhotoFile(name: string): { data: Buffer; mime: string } {
  const full = resolveSafe(name);
  if (!fs.existsSync(full)) throw new NotFoundError("Photo");
  return { data: fs.readFileSync(full), mime: MIME[name.split(".").pop()!] };
}

export function deletePhotoFile(name: string) {
  try {
    const full = resolveSafe(name);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    // ignore invalid or missing names
  }
}
