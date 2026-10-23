import initSqlJs, { type Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { drizzle } from "drizzle-orm/sql-js";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { CATEGORIES, DEFAULT_CARE } from "@/lib/domain";
import journal from "../../../drizzle/meta/_journal.json";
import { readBytes, writeBytesAtomic } from "./storage";

/**
 * The Android app's database: the same SQLite schema and Drizzle queries as the web app, run
 * by sql.js (SQLite compiled to WebAssembly) inside the WebView and saved to app-private
 * storage after every change. sql.js is synchronous like better-sqlite3, so every service
 * works unchanged.
 */

/** Same query API as the web app's better-sqlite3 database (both are Drizzle's sync SQLite flavour). */
export type DB = BetterSQLite3Database<typeof schema>;

const FILE = "wardrobe.db";
const migrationSql = import.meta.glob<string>("../../../drizzle/*.sql", { query: "?raw", import: "default", eager: true });

type Holder = { db: DB; sqlite: Database; savedChanges: number };
let holder: Holder | null = null;

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function migrations() {
  const out = [];
  for (const entry of journal.entries) {
    const file = Object.entries(migrationSql).find(([path]) => path.endsWith(`/${entry.tag}.sql`));
    if (!file) throw new Error(`Missing migration ${entry.tag}`);
    const query = file[1];
    out.push({ sql: query.split("--> statement-breakpoint"), bps: entry.breakpoints, folderMillis: entry.when, hash: await sha256(query) });
  }
  return out;
}

function totalChanges(sqlite: Database): number {
  return Number(sqlite.exec("SELECT total_changes()")[0]?.values[0]?.[0] ?? 0);
}

export async function openDatabase(): Promise<{ restored: boolean }> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const bytes = await readBytes(FILE);
  const sqlite = new SQL.Database(bytes && bytes.length ? bytes : undefined);
  sqlite.exec("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema }) as unknown as DB;
  const internals = db as unknown as { dialect: { migrate(m: unknown, s: unknown, c: unknown): void }; session: unknown };
  internals.dialect.migrate(await migrations(), internals.session, {});
  for (const category of CATEGORIES) {
    db.insert(schema.categoryCare).values({ category, ...DEFAULT_CARE[category] }).onConflictDoNothing().run();
  }
  holder = { db, sqlite, savedChanges: -1 };
  await saveDatabase();
  return { restored: Boolean(bytes && bytes.length) };
}

export function getDb(): DB {
  if (!holder) throw new Error("The database isn't open yet.");
  return holder.db;
}

/** True when something was written since the last save. */
export function hasUnsavedChanges() {
  return !!holder && totalChanges(holder.sqlite) !== holder.savedChanges;
}

let saving: Promise<void> | null = null;

/** Write the database to storage if it changed. Serialised so saves never overlap. */
export async function saveDatabase(): Promise<void> {
  if (!holder) return;
  if (saving) await saving;
  if (!hasUnsavedChanges()) return;
  const h = holder;
  saving = (async () => {
    // export() reopens the connection internally, which resets pragmas and the change counter
    const bytes = h.sqlite.export();
    h.sqlite.exec("PRAGMA foreign_keys = ON");
    h.savedChanges = totalChanges(h.sqlite);
    await writeBytesAtomic(FILE, bytes);
  })();
  try {
    await saving;
  } finally {
    saving = null;
  }
}

export function databaseFile() {
  return "App storage › wardrobe.db";
}

export function resetDbConnection() {}

export { schema };
