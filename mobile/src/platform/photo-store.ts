import { Capacitor } from "@capacitor/core";
import { fileUri, readBytes, remove, writeBytes } from "./storage";
import { isNative } from "./device";

/** Garment photos in the app's private storage, displayed straight from disk via the WebView. */

const dir = (name: string) => `photos/${name}`;
let base: string | null = null;
const objectUrls = new Map<string, string>();

export async function initPhotoStore() {
  if (isNative) base = Capacitor.convertFileSrc(await fileUri("photos"));
}

/** A URL an <img> can load: a WebView file URL on Android, an object URL in a desktop browser. */
export function photoUrl(name: string): string | Promise<string> {
  if (base) return `${base}/${encodeURIComponent(name)}`;
  const cached = objectUrls.get(name);
  if (cached) return cached;
  return readBytes(dir(name)).then((bytes) => {
    if (!bytes) return "";
    const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
    objectUrls.set(name, url);
    return url;
  });
}

export const photoStore = {
  location: () => "App storage › photos",
  write: (name: string, data: Uint8Array) => writeBytes(dir(name), data),
  read: (name: string) => readBytes(dir(name)),
  remove(name: string) {
    objectUrls.delete(name);
    void remove(dir(name));
  },
};
