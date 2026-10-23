import { Capacitor } from "@capacitor/core";

/** True inside the installed Android app; false when the mobile bundle runs in a desktop browser (tests, preview). */
export const isNative = Capacitor.isNativePlatform();
export const platformName = Capacitor.getPlatform();
