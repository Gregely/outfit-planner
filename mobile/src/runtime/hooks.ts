/** Work to run after every page render and every local API call (e.g. saving the database). */
const listeners = new Set<() => void>();
let persist: (() => Promise<void>) | null = null;

export function onAfterWork(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function afterRender() {
  for (const fn of listeners) fn();
}

/** How to write data to durable storage (registered at startup). */
export function setPersist(fn: () => Promise<void>) {
  persist = fn;
}

/** Write any changes to storage now; resolves once they're safely on disk. */
export async function persistNow() {
  await persist?.();
}
