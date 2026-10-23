import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android app: a native shell around the same UI, API route handlers and services as the
 * web app, built into mobile/dist by `npm run mobile:build` (see mobile/vite.config.mts and
 * docs/ANDROID.md).
 */
const config: CapacitorConfig = {
  appId: "app.wardrobestudio",
  appName: "Wardrobe Studio",
  webDir: "mobile/dist",
  backgroundColor: "#f4efe6",
  android: {
    allowMixedContent: false,
    // Left unset: Chrome DevTools debugging is on for debug builds only.
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#f4efe6",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
    // Edge-to-edge on Android 15+: the WebView gets --safe-area-inset-* CSS variables, and the
    // light theme gets dark status / navigation bar icons.
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      style: "LIGHT",
    },
    // CapacitorHttp is used explicitly for AI provider requests; the global fetch stays the WebView's own.
    CapacitorHttp: { enabled: false },
  },
};

export default config;
