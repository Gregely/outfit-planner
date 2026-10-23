import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";

/**
 * Builds the Android app's web bundle: the same pages, components, API route handlers and
 * services as the Next.js web app, running entirely inside the WebView. Next.js-specific
 * modules are replaced by small shims, and the Node-only platform pieces (SQLite driver,
 * files, secrets) by their on-device equivalents.
 */
const root = path.resolve(import.meta.dirname, "..");
const r = (p: string) => path.resolve(root, p);

/**
 * Marks every export of a `"use client"` module so the in-app renderer knows which components
 * to hand to React as-is and which (server components) to evaluate itself.
 */
function markClientComponents(): Plugin {
  return {
    name: "wardrobe:mark-client-components",
    enforce: "pre",
    transform(code, id) {
      if (!id.startsWith(r("src")) || !/\.(tsx|ts)$/.test(id)) return null;
      if (!/^\s*(\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(code)) return null;
      const names = new Set<string>();
      for (const m of code.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
      for (const m of code.matchAll(/export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
      for (const m of code.matchAll(/export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
      if (!names.size) return null;
      const list = [...names].join(", ");
      return {
        code: `${code}\n;for (const __c of [${list}]) { if (typeof __c === "function") __c[Symbol.for("wardrobe.client")] = true; }\n`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  base: "/",
  publicDir: r("public"),
  plugins: [markClientComponents(), tailwindcss()],
  define: {
    "process.env": "{}",
  },
  resolve: {
    alias: [
      { find: /^@\/server\/db$/, replacement: r("mobile/src/platform/db.ts") },
      { find: /^@\/server\/platform\/(.*)$/, replacement: r("mobile/src/platform/$1.ts") },
      { find: /^@\/(.*)$/, replacement: r("src/$1") },
      { find: /^server-only$/, replacement: r("mobile/src/shims/server-only.ts") },
      { find: /^next\/link$/, replacement: r("mobile/src/shims/next-link.tsx") },
      { find: /^next\/navigation$/, replacement: r("mobile/src/shims/next-navigation.ts") },
      { find: /^next\/server$/, replacement: r("mobile/src/shims/next-server.ts") },
    ],
  },
  build: {
    outDir: r("mobile/dist"),
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
    rolldownOptions: {
      onwarn(warning, warn) {
        // "use client" has no meaning in this bundle; the plugin above reads it instead
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        warn(warning);
      },
    },
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
