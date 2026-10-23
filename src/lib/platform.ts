/**
 * Hooks into the host the UI is running in. The web app runs with no bridge (plain fetch to the
 * Next.js server); the Android app installs one at startup (mobile/src/main.tsx) that serves the
 * API in-process and provides native photo, file and download handling.
 */
export type PlatformBridge = {
  native: boolean;
  /** Serve an `/api/...` request in-process instead of over the network. */
  localFetch?: (path: string, init?: RequestInit) => Promise<Response>;
  /** Resolve an `/api/...` image URL to something an <img> can load on this platform. */
  assetUrl?: (path: string) => string | Promise<string>;
  /** Save or share a file produced by an `/api/...` download link. */
  download?: (path: string) => Promise<void>;
  /** Take a photo or pick one from the gallery with the native UI. Null when cancelled. */
  pickPhoto?: (source: "camera" | "gallery") => Promise<File | null>;
};

export function platform(): PlatformBridge | undefined {
  return (globalThis as { __wardrobePlatform?: PlatformBridge }).__wardrobePlatform;
}

export function isNativeApp() {
  return platform()?.native === true;
}
