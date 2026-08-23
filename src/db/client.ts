import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

/** Default location of the local database; `DATABASE_URL` overrides it (tests, worktrees). */
export const DB_PATH = process.env.DATABASE_URL ?? "data/app.db";

export function openDatabase(file: string = DB_PATH) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export function createDb(file: string = DB_PATH) {
  const sqlite = openDatabase(file);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

/** Process-wide handle for the app. Scripts and tests use `createDb()` instead. */
const globalForDb = globalThis as unknown as { __portalDb?: ReturnType<typeof createDb> };
const handle = (globalForDb.__portalDb ??= createDb());

export const sqlite = handle.sqlite;
export const db = handle.db;
export { schema };
