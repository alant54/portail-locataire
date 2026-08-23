/** `sync_runs` bookkeeping — one row per full or incremental run, for lane C's screen. */
import type { SyncRunSummary } from "../contracts";
import { syncRuns } from "../db/schema";
import type { MirrorDb } from "../db/upsert";
import { eq } from "drizzle-orm";

export function startRun(db: MirrorDb, kind: "full" | "incremental", cursorBefore: number): string {
  const id = crypto.randomUUID();
  db.insert(syncRuns)
    .values({ id, kind, startedAt: new Date().toISOString(), cursorBefore, status: "running" })
    .run();
  return id;
}

export function finishRun(db: MirrorDb, summary: SyncRunSummary): SyncRunSummary {
  db.update(syncRuns)
    .set({
      finishedAt: new Date().toISOString(),
      eventsApplied: summary.eventsApplied,
      cursorAfter: summary.cursorAfter,
      status: summary.status,
      error: summary.error ?? null,
    })
    .where(eq(syncRuns.id, summary.runId))
    .run();
  return summary;
}
