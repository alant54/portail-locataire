/**
 * CROSS-LANE INTERFACE — the signature is frozen; lane A replaced the body.
 *
 * `runIncrementalSync()` is what lane C's "Relancer la synchro" button calls. It stays
 * callable with no arguments; the optional handle only exists so tests never write to
 * `data/app.db`.
 */
import { desc } from "drizzle-orm";
import type { SyncRunSummary } from "../contracts";
import { db } from "../db/client";
import { syncRuns } from "../db/schema";
import type { MirrorDb } from "../db/upsert";
import type { ErpClient } from "../erp/client";
import { runIncremental } from "./incremental";

export type { SyncRunSummary };
export { runFullImport, latestChangeId, type FullImportResult } from "./full-import";
export { runIncremental, EVENT_BATCH_SIZE } from "./incremental";
export { readCursor, writeCursor } from "./cursor";

/**
 * Both optional arguments only widen the seam: every caller may still invoke
 * `runIncrementalSync()` with no arguments. Tests pass their own handle so they never
 * write to `data/app.db`, and their own ERP client so `npm test` never leaves the
 * machine — a lane worktree has no `.env.local`, and a contract test must not depend
 * on one. `client` is typed `object` on purpose: the real type is lane A's `ErpClient`,
 * which does not exist in the other lanes, so the cast below is where lane A knows
 * better than the shared signature.
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
