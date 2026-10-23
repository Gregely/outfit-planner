# Wardrobe Studio for Android

An installable Android app built from the same code as the web app. Your wardrobe, planner, laundry, illustrations, history, backups and the built-in stylist all work **on the phone, without a server and without an internet connection**.

- Package: `app.wardrobestudio` · name: **Wardrobe Studio** · version 1.0.0 (code 1)
- Android 7.0+ (minSdk 24), targets Android 16 (API 36)
- Debug APK: `release/wardrobe-studio-1.0.0-debug.apk` (built by `npm run android:apk`)

## How it works

A WebView can't run the web app's Node.js server, so the Android app doesn't try to. It runs **the same pages, API route handlers and services inside the app**, with the server-only pieces swapped for on-device equivalents:

| Web app (Node.js) | Android app |
| --- | --- |
| Next.js renders server components | `mobile/src/runtime/rsc.ts` evaluates the same async server components in the WebView (client components – tagged from their `"use client"` directive at build time – are left to React) |
| Next.js routing, `next/link`, `next/navigation` | `mobile/src/runtime/router-store.ts` + small shims in `mobile/src/shims/` (history API, back button) |
| `fetch("/api/…")` → route handlers | `mobile/src/runtime/local-api.ts` calls the **same** `src/app/api/**/route.ts` handlers in-process with a standard `Request` |
| SQLite via better-sqlite3 | SQLite compiled to WebAssembly (sql.js) running the **same** Drizzle queries and migrations; the database file is saved to the app's private storage |
| Photos in `data/uploads` | App-private `files/photos/`, shown straight from disk |
| Keys in `data/secrets.json` / env | Android Keystore (see *Security*) |
| Node's `fetch` for AI providers | Capacitor's native HTTP stack (no CORS limits; local-network servers work) |

The swaps are done with build-time aliases (`mobile/vite.config.mts`); the services, stylist, validation and AI layer are not forked. `capacitor.config.ts` wraps the built bundle (`mobile/dist`) in the native shell (`android/`).

### Storage and reliability

- **Write-through saving.** Any request that changes data (adding a garment, marking an outfit worn, restoring a backup…) is written to storage **before** the screen reports success, so closing or killing the app straight afterwards never loses it. Reads that refresh caches (weather) are saved shortly after, and everything is flushed when the app is backgrounded.
- **Crash-safe writes.** The database is written to a temporary file and then moved over the old one, so an interrupted save leaves the previous copy intact.
- **Startup checks.** Migrations run on every start; if the data can't be opened the app says so instead of starting empty, and nothing is overwritten.
- Data lives in the app's private storage (not readable by other apps) and is removed when the app is uninstalled. **Back up from Settings › Backup & data** – the export opens Android's share sheet so you can save it to Files, Drive or email.

### Works offline

| Feature | Offline? |
| --- | --- |
| Wardrobe, garment editing, illustrations, photos | ✅ |
| Laundry, wear logging, history, saved outfits | ✅ |
| Planner and the built-in (rule-based) stylist | ✅ |
| Text import with the offline parser, CSV import/export | ✅ |
| Backups (export/restore) | ✅ |
| Weather | Uses the last cached forecast, then typical seasonal weather or a day's manual weather; new forecasts need a connection |
| Town search for your location | Needs a connection (entering coordinates works offline) |
| AI suggestions, AI import, AI planning, connection tests, model lists | Need a connection to your provider (a server on your own Wi-Fi works without internet). Offline, the app shows “You're offline” and the built-in stylist answers instead |

### Native touches

- Four bottom tabs (Home, Wardrobe, Outfits, Planner) and a **More** sheet; 44 px touch targets on touch screens.
- Android back button closes the open dialog first, then goes back, then leaves the app (saving first).
- Edge-to-edge layout with proper status/navigation bar insets (Capacitor SystemBars), light system bar icons on the paper theme, keyboard resizes the page so fields stay visible.
- **Take photo** (system camera) and **From gallery** (Android Photo Picker) on the garment page – no camera or storage permission is requested. Large photos are scaled to 1600 px before saving.
- Exports (backup, CSV) go through the share sheet.
- Splash screen and adaptive launcher icon (artwork in `assets/`, rendered by `scripts/android-assets.mjs`).
- A thin progress bar for page loads; an offline banner; errors show the app's error screen instead of a blank page.

## Security

- **No shared secrets in the APK.** The app talks to AI providers directly with *your* key. There is no Wardrobe Studio server and no embedded key; the bundle is checked into the APK as static files only.
- **Keys at rest:** `@aparajita/capacitor-secure-storage` encrypts each key with AES-256-GCM using a key held in the **Android Keystore** (hardware-backed where the device supports it). The ciphertext lives in a private SharedPreferences file that is **excluded from Android cloud backup and device transfer** (`res/xml/data_extraction_rules.xml`, `backup_rules.xml`) – a Keystore-bound key can't be decrypted on another device anyway.
- **Keys in use:** a key is read from the Keystore only when a request to that provider is made, kept in memory for that request, and never written to the database, backups, exports or logs. Error messages are scrubbed of anything key-shaped.
- **Network:** HTTPS with the system's certificate authorities only. Plain `http://` is permitted so a self-hosted model server on your own network can be used (Android can't limit cleartext to private addresses); Settings warns if an `http://` address isn't on a local network.
- **Trade-offs of direct calls** (vs. a backend proxy) are discussed in [AI-PROVIDERS.md › Security and privacy](AI-PROVIDERS.md#security-and-privacy). In short: a direct call keeps your data between your phone and the provider you chose, at the cost of the key living on the device (protected by the Keystore, but readable by anything that fully compromises the app on an unlocked device). Use a provider key with a spending limit.

## Building

### Prerequisites

- Node.js 20.19+ and npm
- JDK 21
- Android SDK with `platforms;android-36` and `build-tools;36.0.0` (Android Studio installs these; or the command-line tools: `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"`)
- `ANDROID_HOME` pointing at the SDK (or `android/local.properties` with `sdk.dir=…`)

### Debug APK

```bash
npm install
npm run android:apk
# → android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`android:apk` = `vite build` of the mobile bundle → `cap sync android` → `./gradlew assembleDebug`. To work in Android Studio instead: `npm run android:sync && npx cap open android`.

The UI can also be developed in a desktop browser without a device: `npm run mobile:dev` (storage falls back to IndexedDB, keys to browser storage – a banner in Settings says it isn't secure).

### Release builds

1. Create an upload/signing key once, and keep it (and its passwords) safe and **out of the repository**:

   ```bash
   keytool -genkeypair -v -keystore ~/keys/wardrobe-studio.jks -alias wardrobe-studio -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Provide the signing details through the environment (or `~/.gradle/gradle.properties`, never the project):

   ```bash
   export WARDROBE_KEYSTORE=~/keys/wardrobe-studio.jks
   export WARDROBE_KEYSTORE_PASSWORD=…
   export WARDROBE_KEY_ALIAS=wardrobe-studio
   export WARDROBE_KEY_PASSWORD=…
   ```

3. Bump `versionCode` / `versionName` in `android/app/build.gradle`, then:

   ```bash
   npm run android:release
   # → android/app/build/outputs/apk/release/app-release.apk  (signed)
   # → android/app/build/outputs/bundle/release/app-release.aab (for Google Play)
   ```

   Without the variables, Gradle still builds an *unsigned* release APK, which Android won't install.

### Regenerating icons and splash

Edit `assets/icon.svg`, `assets/icon-round.svg` or `assets/icon-foreground.svg`, then `node scripts/android-assets.mjs` (uses Playwright's Chromium). The Android 12+ splash uses the vector in `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`.

### Troubleshooting

- **Gradle can't download dependencies** – it needs `google()` and Maven Central. Behind a restrictive proxy, a Gradle init script can point Maven Central at a mirror (this repository was built that way; nothing in the project depends on it).
- **Blank screen after installing an old build** – uninstall and reinstall; or in Chrome `chrome://inspect` (debug builds) look at the console.
- **AI request says the server couldn't be reached** – for a server on your network, use its LAN address (e.g. `http://192.168.1.20:11434/v1`), not `localhost`, which on the phone means the phone itself.

## What was tested

- **Unit/integration (Vitest):** the same services, AI layer and route handlers the APK runs; the `next/server` shim used by the app is also what the unit tests run route handlers with.
- **End-to-end (Playwright, `android-bundle` project):** the exact `mobile/dist` bundle that goes into the APK, in a Pixel 7–sized Chromium with touch – onboarding, garment creation, **data surviving a full reload**, offline use (planner, rule-based stylist, dialogs), backup download, back navigation, adding an OpenAI-compatible endpoint, live model list, a real connection test, AI suggestions attributed to the model, persistence of the choice, and AI being skipped with a clear reason when offline.
- **Build:** the debug APK was built with Gradle and inspected (`aapt2 dump badging`, `apksigner verify`): package, label, permissions, target SDK, signature, bundled assets.
- **Not tested here:** running the APK on a phone or emulator (the build machine has no KVM). The native-only paths – Android Keystore storage, native HTTP, the camera and Photo Picker, the share sheet, the back button, splash and system bars – rely on the official Capacitor plugins as documented but were not exercised on a device. Please smoke-test those on a device before distributing a release.
