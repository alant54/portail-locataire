/**
 * Full import: every mirrored collection, in FK order, through `upsertRows`.
 *
 * Two things make a re-run a no-op rather than a duplication: the upsert conflicts on
 * the ERP's own primary key, and a row carrying an older `source_revision` is skipped.
 * The import never issues a non-GET request — the client cannot.
 *
 * It also seeds `sync_cursor`. The `max(change_id)` is read BEFORE the first collection
 * is fetched, so anything the ERP records while we are importing is replayed by the next
 * incremental run rather than skipped. Without this step the cursor stays at 0 and the
 * first `npm run sync` replays the whole stream as a multi-minute no-op.
 */
import fs from "node:fs";
import { sql } from "drizzle-orm";
import type { SyncRunSummary } from "../contracts";
import { db as defaultDb } from "../db/client";
import { upsertRows, type MirrorDb } from "../db/upsert";
import { envInt } from "../erp/env";
import { erp, PAGE_LIMIT, type ErpClient } from "../erp/client";
import type { ErpResource, ErpSyncEvent } from "../erp/types";
import { readCursor, writeCursor } from "./cursor";
import { IMPORT_ORDER, type MirrorCollection } from "./registry";
import { finishRun, startRun } from "./runs";

/**
 * Collections the demo never reads row by row, so `SYNC_MAX_ROWS_PER_COLLECTION` may
 * truncate them. `tenant-account-entries` is bigger (161 k) and deliberately absent:
 * a balance is the sum of every entry, so a capped import would show a wrong number.
 */
const CAPPABLE: ReadonlySet<ErpResource> = new Set<ErpResource>(["meter-readings"]);

/**
 * Collections that MUST NOT be read by offset paging.
 *
 * Measured 2026-08-23: one full offset walk over `tenant-account-entries` fetches
 * 161 603 rows but only 133 455 distinct ids, and two walks return different sets —
 * the ERP's ordering has ties, so its windows overlap and skip. Balances computed from
 * such an import are wrong (BAIL-000170 came out at 3750 CHF against an oracle of
 * 2540). `rent-terms` shows the same defect in miniature: 4 725 fetched, 4 724 distinct.
 *
 * Filtering by lease is stable and complete: one request per lease, ≤35 rows, repeatable,
 * and the four fixture tenants' balances then match `tenant-portal-snapshots` exactly.
 */
const PARTITIONED_BY_LEASE: ReadonlySet<ErpResource> = new Set<ErpResource>([
  "tenant-account-entries",
  "rent-terms",
]);

/**
 * How many leases to partition over. `demo` is every lease the portal can actually show
 * — a handful of requests. `all` is the 6 525 leases of the dataset, ~26 minutes: the
 * ERP serialises, so concurrency makes it slower rather than faster.
 */
export type EntriesScope = "demo" | "all";

export interface FullImportOptions {
  db?: MirrorDb;
  client?: ErpClient;
  /** `--only rental-units,leases`; defaults to every mirrored collection. */
  only?: ErpResource[];
  /** Overrides `SYNC_MAX_ROWS_PER_COLLECTION` (tests). */
  maxRowsPerCollection?: number;
  /** `--entries=demo|all`; defaults to `demo`. */
  entriesScope?: EntriesScope;
  onProgress?: (resource: ErpResource, rows: number) => void;
}

export interface FullImportResult extends SyncRunSummary {
  perTable: Record<string, number>;
}

/**
 * Largest `change_id` currently in the stream.
 *
 * `sync-events` has no ordering or aggregate parameter, so this pages the collection
 * and keeps the maximum. 21 requests against a 20 665-row stream, a couple of seconds
 * next to the import's few minutes — and it cannot be off by one, which a binary
 * search over `offset` could be.
 */
export async function latestChangeId(client: ErpClient): Promise<number> {
  let max = 0;
  for await (const page of client.listAll("sync-events")) {
    for (const event of page as ErpSyncEvent[]) {
      if (event.change_id > max) max = event.change_id;
    }
  }
  return max;
}

/**
 * The leases the portal can actually show: whatever lane B seeded into `users`, plus the
 * fixture tenants. Reading both means this works before and after lane B lands.
 */
export function demoLeaseIds(db: MirrorDb): string[] {
  const ids = new Set<string>();

  const fromUsers = db.all<{ id: string }>(sql`
    select distinct l.id as id
    from users u
    join parties p on p.external_ref = u.tenant_ref
    join lease_parties lp on lp.party_id = p.id
    join leases l on l.id = lp.lease_contract_id
    where u.tenant_ref is not null`);
  for (const row of fromUsers) ids.add(row.id);

  try {
    const meta = JSON.parse(fs.readFileSync("fixtures/meta.json", "utf8")) as {
      tenants?: { lease_ref?: string }[];
    };
    const refs = (meta.tenants ?? []).map((t) => t.lease_ref).filter(Boolean) as string[];
    for (const ref of refs) {
      const row = db.get<{ id: string }>(sql`select id from leases where external_ref = ${ref}`);
      if (row) ids.add(row.id);
    }
  } catch {
    // No fixtures in this checkout: the users table is then the only source.
  }

  return [...ids];
}

function allLeaseIds(db: MirrorDb): string[] {
  return db.all<{ id: string }>(sql`select id from leases`).map((r) => r.id);
}

/**
 * One request per lease instead of an offset walk. Each lease holds ≤35 entries, so a
 * single page covers it; `listAll` still follows `next_offset` in case that changes.
 */
async function importByLease(
  db: MirrorDb,
  client: ErpClient,
  collection: MirrorCollection,
  leaseIds: string[],
): Promise<number> {
  let written = 0;
  for (const leaseContractId of leaseIds) {
    const rows: Record<string, unknown>[] = [];
    for await (const page of client.listAll(collection.resource, {
      lease_contract_id: leaseContractId,
    })) {
      rows.push(...(page as unknown as Record<string, unknown>[]));
    }
    if (rows.length === 0) continue;
    db.transaction((tx) => {
      upsertRows(tx as MirrorDb, collection.table, rows);
    });
    written += rows.length;
  }
  return written;
}

async function importCollection(
  db: MirrorDb,
  client: ErpClient,
  collection: MirrorCollection,
  cap: number | undefined,
): Promise<number> {
  const limit = cap !== undefined && CAPPABLE.has(collection.resource) ? cap : undefined;
  let written = 0;

  for await (const page of client.listAll(collection.resource)) {
    const rows = (limit !== undefined && written + page.length > limit
      ? page.slice(0, limit - written)
      : page) as unknown as Record<string, unknown>[];

    // One transaction per page: a page is small enough to redo, and holding a
    // transaction open across an await is not possible with better-sqlite3.
    db.transaction((tx) => {
      upsertRows(tx as MirrorDb, collection.table, rows);
    });

    written += rows.length;
    if (limit !== undefined && written >= limit) break;
  }
  return written;
}

export async function runFullImport(options: FullImportOptions = {}): Promise<FullImportResult> {
  const db = options.db ?? defaultDb;
  const client = options.client ?? erp();
  const cap = options.maxRowsPerCollection ?? envInt("SYNC_MAX_ROWS_PER_COLLECTION");

  const selected = options.only?.length
    ? IMPORT_ORDER.filter((c) => options.only!.includes(c.resource))
    : IMPORT_ORDER;
  if (options.only?.length && selected.length !== options.only.length) {
    const known = new Set(IMPORT_ORDER.map((c) => c.resource));
    const unknown = options.only.filter((r) => !known.has(r));
    throw new Error(`--only: not a mirrored collection: ${unknown.join(", ")}`);
  }

  const cursorBefore = readCursor(db);
  const runId = startRun(db, "full", cursorBefore);
  const perTable: Record<string, number> = {};

  try {
    // Read the cursor target first: events recorded during the import stay ahead of it.
    const cursorAfter = await latestChangeId(client);

    const scope = options.entriesScope ?? "demo";
  if (scope !== "demo" && scope !== "all") {
    throw new Error(`--entries: expected "demo" or "all", got "${scope}"`);
  }
    let rows = 0;
    for (const collection of selected) {
      const partitioned = PARTITIONED_BY_LEASE.has(collection.resource);
      // `leases` has a lower rank, so the local mirror already holds them here.
      const written = partitioned
        ? await importByLease(
            db,
            client,
            collection,
            scope === "all" ? allLeaseIds(db) : demoLeaseIds(db),
          )
        : await importCollection(db, client, collection, cap);
      perTable[collection.resource] = written;
      rows += written;
      options.onProgress?.(collection.resource, written);
    }

    // A partial import (`--only`) must not claim the whole stream is applied.
    const full = selected.length === IMPORT_ORDER.length;
    const storedCursor = full ? cursorAfter : cursorBefore;
    db.transaction((tx) => {
      writeCursor(tx as MirrorDb, storedCursor);
    });

    return {
      ...finishRun(db, {
        runId,
        kind: "full",
        eventsApplied: rows,
        cursorBefore,
        cursorAfter: storedCursor,
        status: "ok",
      }),
      perTable,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...finishRun(db, {
        runId,
        kind: "full",
        eventsApplied: Object.values(perTable).reduce((a, b) => a + b, 0),
        cursorBefore,
        cursorAfter: cursorBefore,
        status: "failed",
        error: message,
      }),
      perTable,
    };
  }
}

export { PAGE_LIMIT };
