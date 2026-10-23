/** Work to run after every page render and every local API call (e.g. saving the database). */
const listeners = new Set<() => void>();

export function onAfterWork(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function afterRender() {
  for (const fn of listeners) fn();
}
