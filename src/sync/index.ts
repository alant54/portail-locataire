/**
 * CROSS-LANE INTERFACE — the signature is frozen; lane A replaced the body.
 *
 * `runIncrementalSync()` is what lane C's "Relancer la synchro" button calls. It stays
 * callable with no arguments; the optional handle only exists so tests never write to
 * `data/app.db`.
 */
import { desc } from "drizzle-orm";
import type { SyncRunSummary } from "../contracts.js";
import { db } from "../db/client.js";
import { syncRuns } from "../db/schema.js";
import type { MirrorDb } from "../db/upsert.js";
import type { ErpClient } from "../erp/client.js";
import { runIncremental } from "./incremental.js";

export type { SyncRunSummary };
export { runFullImport, latestChangeId, type FullImportResult } from "./full-import.js";
export { runIncremental, EVENT_BATCH_SIZE } from "./incremental.js";
export { readCursor, writeCursor } from "./cursor.js";

/**
 * Both optional arguments only widen the seam (see the identical signature on main):
 * the database handle keeps tests off `data/app.db`, and `client` keeps them off the
 * network. It is typed `object` rather than `ErpClient` because the other lanes have
 * no `src/erp/client.ts` to import — the cast below is where lane A knows better.
 */
export async function runIncrementalSync(
  database: MirrorDb = db,
  client?: object,
): Promise<SyncRunSummary> {
  return runIncremental({ db: database, client: client as ErpClient | undefined });
}

/** Last runs, for the management sync screen (lane C). */
export function listRecentSyncRuns(limit = 10, database: MirrorDb = db) {
  return database.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit).all();
}
