import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { CATEGORIES, DEFAULT_CARE } from "@/lib/domain";

export type DB = BetterSQLite3Database<typeof schema>;

type Holder = { db: DB; sqlite: Database.Database; file: string };

const globalForDb = globalThis as unknown as { __wardrobeDb?: Holder };

export function databaseFile(): string {
  const configured = process.env.DATABASE_PATH?.trim();
  if (configured === ":memory:") return configured;
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured || path.join("data", "wardrobe.db"));
}

export function migrationsFolder() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle");
}

function open(file: string): Holder {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  seedDefaults(db);
  return { db, sqlite, file };
}

/** Insert rows that must always exist (category care defaults). Idempotent. */
function seedDefaults(db: DB) {
  for (const category of CATEGORIES) {
    db.insert(schema.categoryCare)
      .values({ category, ...DEFAULT_CARE[category] })
      .onConflictDoNothing()
      .run();
  }
}

export function getDb(): DB {
  const file = databaseFile();
  const holder = globalForDb.__wardrobeDb;
  if (holder && holder.file === file) return holder.db;
  if (holder) holder.sqlite.close();
  globalForDb.__wardrobeDb = open(file);
  return globalForDb.__wardrobeDb.db;
}

export function getSqlite(): Database.Database {
  getDb();
  return globalForDb.__wardrobeDb!.sqlite;
}

/** Test helper: drop the cached connection so the next getDb() starts fresh. */
export function resetDbConnection() {
  const holder = globalForDb.__wardrobeDb;
  if (holder) holder.sqlite.close();
  globalForDb.__wardrobeDb = undefined;
}

export { schema };
