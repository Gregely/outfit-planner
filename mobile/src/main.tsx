import "@/app/globals.css";
import "./mobile.css";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { App as CapApp } from "@capacitor/app";
import { Camera, MediaTypeSelection } from "@capacitor/camera";
import { Network } from "@capacitor/network";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import type { PlatformBridge } from "@/lib/platform";
import { bytesToBase64 } from "@/lib/base64";
import { garmentIllustration } from "@/server/services/garments";
import { openDatabase, saveDatabase, hasUnsavedChanges } from "./platform/db";
import { initPhotoStore, photoUrl } from "./platform/photo-store";
import { initSecrets } from "./platform/secrets";
import { initNetwork, setOnline } from "./platform/network";
import { isNative } from "./platform/device";
import { App } from "./runtime/app";
import { localFetch } from "./runtime/local-api";
import { onAfterWork, setPersist } from "./runtime/hooks";
import { navigate } from "./runtime/router-store";
import { OfflineBanner } from "./runtime/offline-banner";

const root = createRoot(document.getElementById("root")!);

function Splash({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="font-serif text-4xl leading-none font-medium tracking-tight">Wardrobe</span>
      <span className="font-serif text-4xl leading-none font-medium tracking-tight text-accent italic">Studio</span>
      <div className="mt-6 max-w-sm text-sm text-muted">{children ?? "Opening your wardrobe…"}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (!hasUnsavedChanges()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveDatabase().catch((err) => console.error("[app] couldn't save the database", err));
  }, 250);
}
async function flushSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  await saveDatabase();
}

/* ------------------------------------------------------------------ */
/* Bridge                                                              */
/* ------------------------------------------------------------------ */

const illustrationCache = new Map<string, string>();

function assetUrl(path: string): string | Promise<string> {
  const art = /^\/api\/garments\/(\d+)\/illustration(?:\?(.*))?$/.exec(path);
  if (art) {
    const cached = illustrationCache.get(path);
    if (cached) return cached;
    try {
      const { svg } = garmentIllustration(Number(art[1]));
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      illustrationCache.set(path, url);
      return url;
    } catch {
      return "";
    }
  }
  const photo = /^\/api\/photos\/([^?]+)/.exec(path);
  if (photo) return photoUrl(decodeURIComponent(photo[1]));
  return path;
}

function filenameFrom(res: Response, path: string) {
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename="?([^";]+)"?/.exec(cd);
  return m?.[1] ?? path.split("/").pop()!.split("?")[0];
}

async function download(path: string) {
  const res = await localFetch(path);
  if (!res.ok) throw new Error(`The export failed (${res.status}).`);
  const name = filenameFrom(res, path);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (isNative) {
    // Write to the app's cache, then let the person choose where it goes (Files, Drive, email…).
    const file = `exports/${name}`;
    await Filesystem.writeFile({ path: file, directory: Directory.Cache, data: bytesToBase64(bytes), recursive: true });
    const { uri } = await Filesystem.getUri({ path: file, directory: Directory.Cache });
    await Share.share({ title: name, files: [uri], dialogTitle: "Save or share your export" });
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: res.headers.get("content-type") ?? "application/octet-stream" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Shrink large camera/gallery photos so uploads stay under the 5 MB limit and storage stays small. */
async function downscale(blob: Blob, maxSide = 1600): Promise<File> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return new File([out ?? blob], "photo.jpg", { type: "image/jpeg" });
}

async function pickPhoto(source: "camera" | "gallery"): Promise<File | null> {
  try {
    const result =
      source === "camera"
        ? await Camera.takePhoto({ quality: 85, targetWidth: 1600, targetHeight: 1600, correctOrientation: true })
        : (await Camera.chooseFromGallery({ mediaType: MediaTypeSelection.Photo, allowMultipleSelection: false, limit: 1 })).results[0];
    if (!result?.webPath) return null;
    const blob = await (await fetch(result.webPath)).blob();
    return await downscale(blob);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(message)) return null;
    if (/permission|denied/i.test(message)) throw new Error("Wardrobe Studio doesn't have permission to use the camera or photos. You can allow it in Android Settings › Apps › Wardrobe Studio › Permissions.");
    throw err;
  }
}

const bridge: PlatformBridge = { native: isNative, localFetch, assetUrl, download, pickPhoto: isNative ? pickPhoto : undefined };

/* ------------------------------------------------------------------ */
/* Native behaviour                                                    */
/* ------------------------------------------------------------------ */

function interceptLinks() {
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const href = a.getAttribute("href")!;
      if (href.startsWith("/api/")) {
        e.preventDefault();
        download(href).catch((err) => alert(err instanceof Error ? err.message : String(err)));
      } else if (href.startsWith("/") && !a.target) {
        e.preventDefault();
        void navigate(href);
      } else if (/^https?:/i.test(href)) {
        e.preventDefault();
        window.open(href, "_blank", "noopener");
      }
    },
    true,
  );
}

async function setupNative() {
  document.documentElement.classList.add("native-app");
  await Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => {});
  CapApp.addListener("backButton", ({ canGoBack }) => {
    // Close the top-most dialog first, like the Escape key does.
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")];
    const top = dialogs.at(-1);
    if (top) {
      top.dispatchEvent(new Event("cancel", { cancelable: true }));
      return;
    }
    if (canGoBack && location.pathname !== "/") history.back();
    else void flushSave().finally(() => CapApp.exitApp());
  });
  CapApp.addListener("pause", () => void flushSave());
  await SplashScreen.hide().catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

async function start() {
  root.render(<Splash />);
  try {
    await openDatabase();
    await initPhotoStore();
    await initSecrets();
  } catch (err) {
    console.error("[app] startup failed", err);
    root.render(
      <Splash>
        <p className="font-medium text-danger">Wardrobe Studio couldn&apos;t open its data.</p>
        <p className="mt-2">{err instanceof Error ? err.message : String(err)}</p>
        <p className="mt-2">Your saved wardrobe hasn&apos;t been changed. Close the app completely and open it again; if this keeps happening, reinstalling will reset the app.</p>
      </Splash>,
    );
    if (isNative) await SplashScreen.hide().catch(() => {});
    return;
  }
  (globalThis as { __wardrobePlatform?: PlatformBridge }).__wardrobePlatform = bridge;
  onAfterWork(scheduleSave);
  setPersist(flushSave);
  addEventListener("pagehide", () => void flushSave());
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void flushSave());
  interceptLinks();
  await initNetwork();
  if (isNative) {
    const status = await Network.getStatus().catch(() => null);
    if (status) setOnline(status.connected);
    Network.addListener("networkStatusChange", (s) => setOnline(s.connected));
    await setupNative();
  }
  root.render(
    <StrictMode>
      <App splash={<Splash />} />
      <OfflineBanner />
    </StrictMode>,
  );
}

void start();
