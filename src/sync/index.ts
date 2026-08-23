/**
 * CROSS-LANE INTERFACE — lane A replaces the body, never the signature.
 *
 * Phase 0 stub: reports a well-formed run that applied nothing and left the cursor where
 * it was, so lane C's "Relancer la synchro" button can be built and rendered today.
 */
import { desc, eq } from "drizzle-orm";
import type { SyncRunSummary } from "../contracts.js";
import { db } from "../db/client.js";
import { syncCursor, syncRuns } from "../db/schema.js";
import type { MirrorDb } from "../db/upsert.js";

export type { SyncRunSummary };

function currentCursor(database: MirrorDb): number {
  const row = database.select().from(syncCursor).where(eq(syncCursor.id, 1)).get();
  return row?.lastChangeId ?? 0;
}

/**
 * Both optional arguments only widen the seam: every caller may still invoke
 * `runIncrementalSync()` with no arguments. Tests pass their own handle so they never
 * write to `data/app.db`, and their own ERP client so `npm test` never leaves the
 * machine — a lane worktree has no `.env.local`, and a contract test must not depend
 * on one. `client` is typed `object` on purpose: the real type is lane A's `ErpClient`,
 * which does not exist in the other lanes.
 */
export async function runIncrementalSync(
  database: MirrorDb = db,
  _client?: object,
): Promise<SyncRunSummary> {
  const cursor = currentCursor(database);
  const runId = crypto.randomUUID();

  database.insert(syncRuns).values({
    id: runId,
    kind: "incremental",
    finishedAt: new Date().toISOString(),
    eventsApplied: 0,
    cursorBefore: cursor,
    cursorAfter: cursor,
    status: "ok",
  }).run();

  return {
    runId,
    kind: "incremental",
    eventsApplied: 0,
    cursorBefore: cursor,
    cursorAfter: cursor,
    status: "ok",
  };
}

/** Last runs, for the management sync screen (lane C). */
export function listRecentSyncRuns(limit = 10, database: MirrorDb = db) {
  return database.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit).all();
}
