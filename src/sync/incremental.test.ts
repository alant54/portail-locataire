/**
 * The incremental sync against a fake ERP.
 *
 * The live dataset contains zero `delete` events and only four entity types, so the
 * delete path, the unknown-entity-type path and a replay from cursor 0 can only be
 * exercised here — see design.md, "Risks".
 */
import { afterEach, beforeEach, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { ErpClient } from "../erp/client.js";
import type { ErpResource, ErpSyncEvent } from "../erp/types.js";
import { createTestDb, type TestDb } from "../db/test-db.js";
import { upsertRows } from "../db/upsert.js";
import { parties, rentalUnits, syncRuns } from "../db/schema.js";
import { readCursor, writeCursor } from "./cursor.js";
import { runIncremental } from "./incremental.js";

const party = (n: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  external_ref: `TEN-${String(n).padStart(5, "0")}`,
  party_kind: "person",
  display_name: `Locataire ${n}`,
  source_revision: 1,
  archived_at: null,
  ...over,
});

const event = (over: Partial<ErpSyncEvent> & { change_id: number }): ErpSyncEvent => ({
  entity_type: "party",
  entity_id: party(1).id,
  operation: "upsert",
  source_revision: 2,
  changed_at: "2026-08-11T11:57:31.742833+00:00",
  ...over,
});

interface FakeErp extends ErpClient {
  calls: { getOne: string[]; listAll: ErpResource[] };
}

function fakeErp(options: {
  events: ErpSyncEvent[];
  rows?: Partial<Record<ErpResource, Record<string, unknown>[]>>;
  failOn?: (resource: string) => boolean;
}): FakeErp {
  const calls = { getOne: [] as string[], listAll: [] as ErpResource[] };
  const rows = options.rows ?? {};

  const client: FakeErp = {
    calls,
    async getPage(resource, params = {}) {
      if (options.failOn?.(resource)) throw new Error(`boom: ${resource}`);
      if (resource === "sync-events") {
        const after = Number(params.after ?? 0);
        const limit = Number(params.limit ?? 500);
        const data = options.events.filter((e) => e.change_id > after).slice(0, limit);
        return { data, meta: { resource, limit, offset: 0, next_offset: null } } as never;
      }
      const data = rows[resource] ?? [];
      return { data, meta: { resource, limit: 1000, offset: 0, next_offset: null } } as never;
    },
    async *listAll(resource) {
      calls.listAll.push(resource);
      if (options.failOn?.(resource)) throw new Error(`boom: ${resource}`);
      const data = rows[resource] ?? [];
      if (data.length > 0) yield data as never;
    },
    async getOne(resource, externalRef) {
      calls.getOne.push(`${resource}/${externalRef}`);
      if (options.failOn?.(resource)) throw new Error(`boom: ${resource}`);
      const found = (rows[resource] ?? []).find((r) => r.external_ref === externalRef);
      return (found ?? null) as never;
    },
  };
  return client;
}

let h: TestDb;
beforeEach(async () => {
  h = await createTestDb();
});
afterEach(() => h.close());

test("upsert of a known UUID is resolved through the detail endpoint", async () => {
  upsertRows(h.db, parties, [party(1)]);
  const client = fakeErp({
    events: [event({ change_id: 7 })],
    rows: { parties: [party(1, { display_name: "Camille Renamed", source_revision: 2 })] },
  });

  const summary = await runIncremental({ db: h.db, client });

  expect(summary.status).toBe("ok");
  expect(summary.eventsApplied).toBe(1);
  expect(summary.cursorBefore).toBe(0);
  expect(summary.cursorAfter).toBe(7);
  expect(client.calls.getOne).toEqual(["parties/TEN-00001"]);
  expect(client.calls.listAll).toEqual([]);
  expect(h.db.select().from(parties).all()[0]!.displayName).toBe("Camille Renamed");
});

test("an unknown UUID falls back to re-paging the collection", async () => {
  // Nothing seeded: the event's entity_id cannot be resolved locally.
  const client = fakeErp({
    events: [event({ change_id: 3, entity_id: party(42).id })],
    rows: { parties: [party(42)] },
  });

  const summary = await runIncremental({ db: h.db, client });

  expect(summary.status).toBe("ok");
  expect(client.calls.getOne).toEqual([]);
  expect(client.calls.listAll).toEqual(["parties"]);
  expect(h.db.select().from(parties).all()).toHaveLength(1);
});

test("a large batch re-pages instead of issuing one detail GET per event", async () => {
  const seeded = Array.from({ length: 10 }, (_, i) => party(i + 1));
  upsertRows(h.db, parties, seeded);
  // 10 local rows → re-paging costs 1 request; 5 events would cost 5 detail GETs.
  const client = fakeErp({
    events: seeded.slice(0, 5).map((p, i) => event({ change_id: i + 1, entity_id: p.id })),
    rows: { parties: seeded },
  });

  await runIncremental({ db: h.db, client });

  expect(client.calls.getOne).toEqual([]);
  expect(client.calls.listAll).toEqual(["parties"]);
});

test("a delete marks the row deleted locally and never calls the ERP", async () => {
  upsertRows(h.db, parties, [party(1)]);
  const client = fakeErp({
    events: [event({ change_id: 9, operation: "delete" })],
    rows: {},
  });

  const summary = await runIncremental({ db: h.db, client });

  const row = h.db.select().from(parties).where(eq(parties.id, party(1).id)).get();
  expect(row).toBeDefined();
  expect(row!.deletedAt).not.toBeNull();
  expect(client.calls.getOne).toEqual([]);
  expect(client.calls.listAll).toEqual([]);
  expect(summary.cursorAfter).toBe(9);
});

test("an unknown entity_type is skipped without stalling the cursor", async () => {
  const client = fakeErp({
    events: [
      event({ change_id: 1, entity_type: "dataset_release", entity_id: "x" }),
      // `lease` is what singularising the collection name would produce: it must not
      // resolve, and it must not be fatal either.
      event({ change_id: 2, entity_type: "lease", entity_id: "y" }),
    ],
    rows: {},
  });

  const summary = await runIncremental({ db: h.db, client });

  expect(summary.status).toBe("ok");
  expect(summary.eventsApplied).toBe(0);
  expect(summary.cursorAfter).toBe(2);
  expect(readCursor(h.db)).toBe(2);
});

test("a failure mid-batch leaves the cursor where it was", async () => {
  upsertRows(h.db, parties, [party(1)]);
  writeCursor(h.db, 5);
  const client = fakeErp({
    events: [event({ change_id: 6 })],
    rows: { parties: [party(1)] },
    failOn: (resource) => resource === "parties",
  });

  const summary = await runIncremental({ db: h.db, client });

  expect(summary.status).toBe("failed");
  expect(summary.error).toContain("boom");
  expect(summary.cursorAfter).toBe(5);
  expect(readCursor(h.db)).toBe(5);
  expect(h.db.select().from(syncRuns).all().at(-1)!.status).toBe("failed");
});

test("replaying from cursor 0 changes no row count and returns the cursor to max", async () => {
  const seeded = [party(1), party(2)];
  upsertRows(h.db, parties, seeded);
  const client = fakeErp({
    events: seeded.map((p, i) => event({ change_id: i + 1, entity_id: p.id })),
    rows: { parties: seeded },
  });

  await runIncremental({ db: h.db, client });
  const before = h.db.get<{ n: number }>(sql`select count(*) as n from parties`)!.n;
  expect(readCursor(h.db)).toBe(2);

  // The scenario the live ERP cannot afford: rewind to 0 and replay everything.
  writeCursor(h.db, 0);
  const replay = await runIncremental({ db: h.db, client });

  expect(replay.status).toBe("ok");
  expect(replay.cursorAfter).toBe(2);
  expect(h.db.get<{ n: number }>(sql`select count(*) as n from parties`)!.n).toBe(before);
});

test("events for several entity types are applied in one run", async () => {
  const unit = {
    id: "11111111-0000-4000-8000-000000000001",
    external_ref: "APT-00001",
    unit_kind: "apartment",
    source_revision: 1,
    archived_at: null,
  };
  upsertRows(h.db, parties, [party(1)]);
  upsertRows(h.db, rentalUnits, [unit]);

  const client = fakeErp({
    events: [
      event({ change_id: 1 }),
      event({ change_id: 2, entity_type: "rental_unit", entity_id: unit.id }),
    ],
    rows: {
      parties: [party(1, { display_name: "Renommé" })],
      "rental-units": [{ ...unit, label: "3.5 pièces", source_revision: 2 }],
    },
  });

  const summary = await runIncremental({ db: h.db, client });

  expect(summary.eventsApplied).toBe(2);
  expect(h.db.select().from(parties).all()[0]!.displayName).toBe("Renommé");
  expect(h.db.select().from(rentalUnits).all()[0]!.label).toBe("3.5 pièces");
});

test("an unconfigured ERP is a failed run, not a thrown exception", async () => {
  // What lane C's "Relancer la synchro" hits in a worktree with no .env.local: the
  // client is built inside the try, so the failure is recorded rather than thrown.
  // chdir as well as clearing the vars — env() falls back to reading .env.local, and
  // lane A's worktree has one.
  const saved = { api: process.env.ERP_API, key: process.env.ERP_PUBLISHABLE_KEY };
  const cwd = process.cwd();
  process.env.ERP_API = "";
  process.env.ERP_PUBLISHABLE_KEY = "";
  process.chdir(h.dir);
  try {
    const summary = await runIncremental({ db: h.db });
    expect(summary.status).toBe("failed");
    expect(summary.error).toMatch(/ERP_API/);
    expect(summary.cursorAfter).toBe(summary.cursorBefore);
    expect(h.db.select().from(syncRuns).all().at(-1)!.status).toBe("failed");
  } finally {
    process.chdir(cwd);
    process.env.ERP_API = saved.api;
    process.env.ERP_PUBLISHABLE_KEY = saved.key;
  }
});

test("no events means no cursor movement and a recorded run", async () => {
  writeCursor(h.db, 4);
  const client = fakeErp({ events: [], rows: {} });

  const summary = await runIncremental({ db: h.db, client });

  expect(summary.status).toBe("ok");
  expect(summary.eventsApplied).toBe(0);
  expect(summary.cursorBefore).toBe(4);
  expect(summary.cursorAfter).toBe(4);
  expect(h.db.select().from(syncRuns).all()).toHaveLength(1);
});
