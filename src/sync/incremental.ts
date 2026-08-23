/**
 * Incremental sync: replay `sync-events` from the stored cursor.
 *
 * Paging uses `after` alone — never `after` combined with `offset`. After each
 * committed batch the next request carries the new cursor, so a failure mid-run leaves
 * the next run pointing exactly where this one stopped; an `offset` walk over a moving
 * `after` window would drift.
 *
 * Resolving an upsert (PLAN.md A1): `entity_id` is a UUID and the detail endpoints take
 * an `external_ref`, so the UUID is resolved through the local mirror and the row is
 * refetched. When a batch holds more events for one collection than re-paging that
 * collection would cost in requests — or when a UUID is not in the mirror yet — the
 * collection is re-paged once instead. 8 list requests beat 500 detail GETs.
 *
 * Deletes are applied locally only, by setting our own `deleted_at`: the ERP's
 * `archived_at` exists on 7 of the 15 mirrored collections, so it cannot carry them.
 */
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import type { SyncRunSummary } from "../contracts";
import { db as defaultDb } from "../db/client";
import { softDeleteRow, upsertRows, type MirrorDb } from "../db/upsert";
import { erp, PAGE_LIMIT, type ErpClient } from "../erp/client";
import type { ErpSyncEvent } from "../erp/types";
import { readCursor, writeCursor } from "./cursor";
import { collectionForEntityType, type MirrorCollection } from "./registry";
import { finishRun, startRun } from "./runs";

/** The ERP's own suggestion for this endpoint, and what PLAN.md specifies. */
export const EVENT_BATCH_SIZE = 500;

export interface IncrementalOptions {
  db?: MirrorDb;
  client?: ErpClient;
  batchSize?: number;
  /** Safety valve for tests; unset means "drain the stream". */
  maxBatches?: number;
  onBatch?: (info: { events: number; cursor: number }) => void;
}

const tableName = (collection: MirrorCollection) => getTableConfig(collection.table).name;

function localCount(db: MirrorDb, collection: MirrorCollection): number {
  const row = db.get<{ n: number }>(
    sql`select count(*) as n from ${sql.raw(`"${tableName(collection)}"`)}`,
  );
  return row?.n ?? 0;
}

function externalRefOf(db: MirrorDb, collection: MirrorCollection, id: string): string | undefined {
  const row = db.get<{ external_ref: string | null }>(
    sql`select external_ref from ${sql.raw(`"${tableName(collection)}"`)} where id = ${id}`,
  );
  return row?.external_ref ?? undefined;
}

/**
 * Re-paging costs about `rows / PAGE_LIMIT` requests; refetching costs one per event.
 * Above the crossover the whole collection is cheaper, and it is the only option when
 * a UUID has never been seen locally.
 */
function repageThreshold(db: MirrorDb, collection: MirrorCollection): number {
  return Math.max(1, Math.ceil(localCount(db, collection) / PAGE_LIMIT));
}

interface BatchPlan {
  upserts: Map<string, { collection: MirrorCollection; rows: Record<string, unknown>[] }>;
  deletes: { collection: MirrorCollection; id: string }[];
  skipped: number;
  applied: number;
  cursor: number;
}

/** Everything that touches the network happens here; nothing is written yet. */
async function planBatch(
  db: MirrorDb,
  client: ErpClient,
  events: ErpSyncEvent[],
): Promise<BatchPlan> {
  const plan: BatchPlan = {
    upserts: new Map(),
    deletes: [],
    skipped: 0,
    applied: 0,
    cursor: 0,
  };

  const byType = new Map<string, ErpSyncEvent[]>();
  for (const event of events) {
    plan.cursor = Math.max(plan.cursor, event.change_id);
    const collection = collectionForEntityType(event.entity_type);
    if (!collection) {
      // An entity_type outside the allow-list is data we do not mirror. Skip it and
      // keep going: a new ERP collection must not stall the cursor.
      plan.skipped++;
      continue;
    }
    const bucket = byType.get(event.entity_type);
    if (bucket) bucket.push(event);
    else byType.set(event.entity_type, [event]);
  }

  for (const [entityType, group] of byType) {
    const collection = collectionForEntityType(entityType)!;

    const deletes = group.filter((e) => e.operation === "delete");
    const upserts = group.filter((e) => e.operation !== "delete");

    for (const event of deletes) {
      if (collection.primaryKey.length !== 1 || collection.primaryKey[0] !== "id") {
        // No single-column id to match the event's UUID against; nothing we can do.
        plan.skipped++;
        continue;
      }
      plan.deletes.push({ collection, id: event.entity_id });
      plan.applied++;
    }
    if (upserts.length === 0) continue;

    const rows: Record<string, unknown>[] = [];
    const refs: string[] = [];
    let mustRepage = upserts.length > repageThreshold(db, collection);

    if (!mustRepage) {
      for (const event of upserts) {
        const ref = collection.hasDetail
          ? externalRefOf(db, collection, event.entity_id)
          : undefined;
        if (!ref) {
          // Unknown UUID, or a collection with no detail endpoint: fall back to the
          // whole collection, which resolves both cases in one pass.
          mustRepage = true;
          break;
        }
        refs.push(ref);
      }
    }

    if (mustRepage) {
      for await (const page of client.listAll(collection.resource)) {
        rows.push(...(page as unknown as Record<string, unknown>[]));
      }
    } else {
      for (const ref of refs) {
        const row = await client.getOne(collection.resource, ref);
        if (row) rows.push(row as unknown as Record<string, unknown>);
      }
    }

    plan.applied += upserts.length;
    plan.upserts.set(collection.resource, { collection, rows });
  }

  return plan;
}

/** One page of events, one SQLite transaction — cursor update included. */
function applyBatch(db: MirrorDb, plan: BatchPlan): void {
  db.transaction((tx) => {
    const handle = tx as MirrorDb;
    for (const { collection, rows } of plan.upserts.values()) {
      upsertRows(handle, collection.table, rows);
    }
    for (const { collection, id } of plan.deletes) {
      softDeleteRow(handle, collection.table, sql`id = ${id}`);
    }
    writeCursor(handle, plan.cursor);
  });
}

export async function runIncremental(options: IncrementalOptions = {}): Promise<SyncRunSummary> {
  const db = options.db ?? defaultDb;
  const batchSize = options.batchSize ?? EVENT_BATCH_SIZE;

  const cursorBefore = readCursor(db);
  const runId = startRun(db, "incremental", cursorBefore);

  let cursor = cursorBefore;
  let applied = 0;
  let batches = 0;

  try {
    // Built inside the try on purpose: a worktree without `.env.local` must see a
    // recorded run with status "failed" on the management screen, not an exception
    // thrown out of a server action.
    const client = options.client ?? erp();
    for (;;) {
      if (options.maxBatches !== undefined && batches >= options.maxBatches) break;
      // `after` only: the cursor moves, the offset never does.
      const page = await client.getPage("sync-events", { after: cursor, limit: batchSize });
      const events = page.data as ErpSyncEvent[];
      if (events.length === 0) break;

      const plan = await planBatch(db, client, events);
      applyBatch(db, plan);

      cursor = plan.cursor;
      applied += plan.applied;
      batches++;
      options.onBatch?.({ events: events.length, cursor });
    }

    return finishRun(db, {
      runId,
      kind: "incremental",
      eventsApplied: applied,
      cursorBefore,
      cursorAfter: cursor,
      status: "ok",
    });
  } catch (error) {
    // The cursor is whatever the last committed batch wrote — never further.
    return finishRun(db, {
      runId,
      kind: "incremental",
      eventsApplied: applied,
      cursorBefore,
      cursorAfter: readCursor(db),
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
