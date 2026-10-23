import { useSyncExternalStore } from "react";
import { isOnline, subscribeOnline } from "../platform/network";

/** Shown while the phone is offline: everything local keeps working, only AI and weather wait. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, isOnline, isOnline);
  if (online) return null;
  return (
    <div role="status" className="offline-banner rounded-xl border border-line-strong bg-ink px-4 py-2.5 text-sm text-paper shadow-card">
      <strong className="font-medium">You&apos;re offline.</strong> Your wardrobe, planner, laundry and the built-in stylist still work; AI suggestions and new forecasts will return when you&apos;re back online.
    </div>
  );
}
