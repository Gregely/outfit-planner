/** Connectivity as the app sees it (Capacitor Network plugin on Android, navigator.onLine elsewhere). */
let online = typeof navigator === "undefined" ? true : navigator.onLine;
const listeners = new Set<() => void>();

export function isOnline() {
  return online;
}

export function setOnline(value: boolean) {
  if (value === online) return;
  online = value;
  for (const fn of listeners) fn();
}

export function subscribeOnline(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function initNetwork() {
  addEventListener("online", () => setOnline(true));
  addEventListener("offline", () => setOnline(false));
  (globalThis as { __wardrobeIsOnline?: () => boolean }).__wardrobeIsOnline = isOnline;
}
