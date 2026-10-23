// Renders the Android launcher icons and splash images from assets/*.svg with Playwright's
// Chromium, so the artwork stays in one editable place. Run: node scripts/android-assets.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const res = path.join(root, "android/app/src/main/res");
const svg = (name) => fs.readFileSync(path.join(root, "assets", name), "utf8");

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SPLASH_PORT = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(markup, width, height, file, background = "transparent") {
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0;background:${background}">${markup}</body></html>`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: background === "transparent" });
}

const fill = (s) => s.replace("<svg ", '<svg style="display:block;width:100%;height:100%" ');

for (const [d, scale] of Object.entries(DENSITIES)) {
  const legacy = Math.round(48 * scale);
  const fg = Math.round(108 * scale);
  await render(`<div style="width:${legacy}px;height:${legacy}px">${fill(svg("icon.svg"))}</div>`, legacy, legacy, `${res}/mipmap-${d}/ic_launcher.png`);
  await render(`<div style="width:${legacy}px;height:${legacy}px">${fill(svg("icon-round.svg"))}</div>`, legacy, legacy, `${res}/mipmap-${d}/ic_launcher_round.png`);
  await render(`<div style="width:${fg}px;height:${fg}px">${fill(svg("icon-foreground.svg"))}</div>`, fg, fg, `${res}/mipmap-${d}/ic_launcher_foreground.png`);
  // Pre-Android-12 splash: the mark and wordmark centred on paper.
  for (const [orient, [w, h]] of [["port", SPLASH_PORT[d]], ["land", [...SPLASH_PORT[d]].reverse()]]) {
    const size = Math.round(Math.min(w, h) * 0.32);
    const markup = `<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Georgia,serif;color:#26211d">
      <div style="width:${size}px;height:${size}px">${fill(svg("icon-foreground.svg"))}</div>
      <div style="font-size:${Math.round(size * 0.2)}px;letter-spacing:-0.01em;margin-top:${Math.round(size * 0.02)}px">Wardrobe <i style="color:#7a2e2a">Studio</i></div>
    </div>`;
    await render(markup, w, h, `${res}/drawable-${orient}-${d}/splash.png`, "#f4efe6");
  }
}
await render(`<div style="width:480px;height:320px;display:flex;align-items:center;justify-content:center"><div style="width:120px;height:120px">${fill(svg("icon-foreground.svg"))}</div></div>`, 480, 320, `${res}/drawable/splash.png`, "#f4efe6");
// Web app icon (the Next.js app picks up src/app/icon.svg)
fs.copyFileSync(path.join(root, "assets/icon.svg"), path.join(root, "src/app/icon.svg"));
await browser.close();
console.log("Android icons and splash images written to", path.relative(root, res));
