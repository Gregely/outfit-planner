import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { base64ToBytes, bytesToBase64 } from "@/lib/base64";

/**
 * App-private file storage. On Android this is the app's internal files directory (not
 * readable by other apps, removed on uninstall, included in Android's encrypted backup only if
 * enabled); in a desktop browser the Capacitor Filesystem plugin falls back to IndexedDB.
 */

const DIR = Directory.Data;

async function readRaw(path: string): Promise<string | Blob | null> {
  try {
    const res = await Filesystem.readFile({ path, directory: DIR });
    return res.data;
  } catch {
    return null;
  }
}

export async function readBytes(path: string): Promise<Uint8Array | null> {
  const data = await readRaw(path);
  if (data === null) return null;
  if (typeof data === "string") return data.length ? base64ToBytes(data) : new Uint8Array();
  return new Uint8Array(await data.arrayBuffer());
}

export async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await Filesystem.writeFile({ path, directory: DIR, data: bytesToBase64(bytes), recursive: true });
}

export async function readText(path: string): Promise<string | null> {
  try {
    const res = await Filesystem.readFile({ path, directory: DIR, encoding: Encoding.UTF8 });
    return typeof res.data === "string" ? res.data : await res.data.text();
  } catch {
    return null;
  }
}

export async function writeText(path: string, text: string): Promise<void> {
  await Filesystem.writeFile({ path, directory: DIR, data: text, encoding: Encoding.UTF8, recursive: true });
}

export async function remove(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory: DIR });
  } catch {
    // already gone
  }
}

/**
 * Crash-safe replace: write a temporary file, then move it over the old one, so an
 * interrupted save (app killed, battery died) never leaves a half-written database.
 */
export async function writeBytesAtomic(path: string, bytes: Uint8Array): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeBytes(tmp, bytes);
  try {
    await Filesystem.rename({ from: tmp, to: path, directory: DIR, toDirectory: DIR });
  } catch {
    // Some implementations refuse to overwrite: keep the old copy until the new one is in place.
    await Filesystem.rename({ from: path, to: `${path}.old`, directory: DIR, toDirectory: DIR }).catch(() => {});
    await Filesystem.rename({ from: tmp, to: path, directory: DIR, toDirectory: DIR });
    await remove(`${path}.old`);
  }
}

export async function fileUri(path: string): Promise<string> {
  return (await Filesystem.getUri({ path, directory: DIR })).uri;
}
