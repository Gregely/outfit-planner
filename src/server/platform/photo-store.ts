import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Where garment photos live. This is the Node (web app) implementation: plain files in
 * UPLOADS_DIR. The Android build swaps this module for one backed by the app's private
 * storage (see mobile/src/platform/photo-store.ts). Names are validated by the caller.
 */

function dir() {
  const configured = process.env.UPLOADS_DIR?.trim();
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured || path.join("data", "uploads"));
}

export const photoStore = {
  location(): string {
    return dir();
  },
  async write(name: string, data: Uint8Array): Promise<void> {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(/*turbopackIgnore: true*/ dir(), name), data);
  },
  async read(name: string): Promise<Uint8Array | null> {
    const file = path.join(/*turbopackIgnore: true*/ dir(), name);
    return fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null;
  },
  /** Synchronous on Node; best-effort everywhere. */
  remove(name: string): void {
    const file = path.join(/*turbopackIgnore: true*/ dir(), name);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  },
};
