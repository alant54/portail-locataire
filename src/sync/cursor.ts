/** The singleton `sync_cursor` row (id = 1), created by `scripts/migrate.ts`. */
import { eq, sql } from "drizzle-orm";
import { syncCursor } from "../db/schema.js";
import type { MirrorDb } from "../db/upsert.js";

export function readCursor(db: MirrorDb): number {
  return db.select().from(syncCursor).where(eq(syncCursor.id, 1)).get()?.lastChangeId ?? 0;
}

/**
 * Written inside the caller's transaction. `INSERT … ON CONFLICT` rather than a plain
 * update, so a database migrated before the seeding line existed still works.
 */
export function writeCursor(db: MirrorDb, lastChangeId: number): void {
  db.run(
    sql`INSERT INTO sync_cursor (id, last_change_id, updated_at) VALUES (1, ${lastChangeId}, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET last_change_id = excluded.last_change_id, updated_at = CURRENT_TIMESTAMP`,
  );
}
