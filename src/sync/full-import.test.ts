/**
 * The full import against a fake ERP.
 *
 * The property that matters here is not "rows arrive" but "the collections the ERP
 * cannot page correctly are never offset-paged" — see design.md, "Decisions".
 */
import { afterEach, beforeEach, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import type { ErpClient } from "../erp/client";
import type { ErpResource } from "../erp/types";
import { createTestDb, type TestDb } from "../db/test-db";
import { upsertRows } from "../db/upsert";
import { leases, meterReadings, syncRuns, tenantAccountEntries, users } from "../db/schema";
import { readCursor } from "./cursor";
import { demoLeaseIds, runFullImport } from "./full-import";

const lease = (n: number) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`,
  external_ref: `BAIL-${String(n).padStart(6, "0")}`,
  status: "active",
  source_revision: 1,
  archived_at: null,
});

const entry = (leaseId: string, n: number) => ({
  id: `bbbbbbbb-${String(n).padStart(4, "0")}-4000-8000-000000000000`,
  external_ref: `ECR-D-${String(n).padStart(7, "0")}`,
  lease_contract_id: leaseId,
  direction: "debit",
  amount_chf: 100,
  source_revision: 1,
});

interface FakeErp extends ErpClient {
  calls: { listAll: { resource: ErpResource; params?: Record<string, unknown> }[] };
}

function fakeErp(rows: Partial<Record<ErpResource, Record<string, unknown>[]>>, maxChangeId = 42): FakeErp {
  const calls: FakeErp["calls"] = { listAll: [] };
  const client: FakeErp = {
    calls,
    async getPage(resource) {
      return { data: rows[resource] ?? [], meta: { resource, limit: 1000, offset: 0, next_offset: null } } as never;
    },
    async *listAll(resource, params) {
      calls.listAll.push({ resource, params: params as Record<string, unknown> });
      if (resource === "sync-events") {
        yield [{ change_id: maxChangeId, entity_type: "party", entity_id: "x", operation: "upsert", source_revision: 1, changed_at: "" }] as never;
        return;
      }
      let data = rows[resource] ?? [];
      const leaseId = (params as { lease_contract_id?: string } | undefined)?.lease_contract_id;
      if (leaseId) data = data.filter((r) => r.lease_contract_id === leaseId);
      if (data.length > 0) yield data as never;
    },
    async getOne() {
      return null as never;
    },
  };
  return client;
}

let h: TestDb;
beforeEach(async () => {
  h = await createTestDb();
});
afterEach(() => h.close());

test("entries and rent terms are read per lease, never offset-paged", async () => {
  const [a, b] = [lease(1), lease(2)];
  const client = fakeErp({
    leases: [a, b],
    "tenant-account-entries": [entry(a.id, 1), entry(a.id, 2), entry(b.id, 3)],
  });

  await runFullImport({ db: h.db, client, entriesScope: "all" });

  const entryCalls = client.calls.listAll.filter((c) => c.resource === "tenant-account-entries");
  // One call per lease, each carrying the filter — and none without it.
  expect(entryCalls).toHaveLength(2);
  for (const call of entryCalls) expect(call.params?.lease_contract_id).toBeDefined();
  expect(h.db.select().from(tenantAccountEntries).all()).toHaveLength(3);
});

test("the demo scope covers only leases the portal can show", async () => {
  const [a, b] = [lease(1), lease(2)];
  const client = fakeErp({
    leases: [a, b],
    "tenant-account-entries": [entry(a.id, 1), entry(b.id, 2)],
  });

  // No users, no fixture match for these refs: nothing to import.
  await runFullImport({ db: h.db, client, entriesScope: "demo" });
  expect(h.db.select().from(tenantAccountEntries).all()).toHaveLength(0);

  // Once lane B seeds a tenant, that tenant's lease is in scope.
  h.db.insert(users).values({
    id: "u1", email: "a@b.ch", passwordHash: "x", role: "tenant", tenantRef: "TEN-00001",
  }).run();
  upsertRows(h.db, leases, [a]);
  h.db.run(sql`insert into parties (id, external_ref) values ('p1', 'TEN-00001')`);
  h.db.run(sql`insert into lease_parties (lease_contract_id, party_id, role) values (${a.id}, 'p1', 'primary_payer')`);

  expect(demoLeaseIds(h.db)).toEqual([a.id]);

  await runFullImport({ db: h.db, client, entriesScope: "demo" });
  expect(h.db.select().from(tenantAccountEntries).all()).toHaveLength(1);
});

test("the cursor is seeded with max(change_id) after a complete import", async () => {
  const client = fakeErp({ leases: [lease(1)] }, 20665);

  const summary = await runFullImport({ db: h.db, client, entriesScope: "all" });

  expect(summary.kind).toBe("full");
  expect(summary.status).toBe("ok");
  expect(summary.cursorAfter).toBe(20665);
  expect(readCursor(h.db)).toBe(20665);
});

test("a partial import does not claim the whole stream", async () => {
  const client = fakeErp({ leases: [lease(1)] }, 20665);

  const summary = await runFullImport({ db: h.db, client, only: ["leases"] });

  expect(summary.cursorAfter).toBe(0);
  expect(readCursor(h.db)).toBe(0);
});

test("the row cap truncates meter readings and never account entries", async () => {
  const a = lease(1);
  const client = fakeErp({
    leases: [a],
    "meter-readings": Array.from({ length: 50 }, (_, i) => ({
      id: `cccccccc-${String(i).padStart(4, "0")}-4000-8000-000000000000`,
      meter_point_id: null,
      value: i,
    })),
    "tenant-account-entries": Array.from({ length: 50 }, (_, i) => entry(a.id, i)),
  });

  await runFullImport({ db: h.db, client, entriesScope: "all", maxRowsPerCollection: 10 });

  expect(h.db.select().from(meterReadings).all()).toHaveLength(10);
  // A capped balance is a wrong balance: entries are never truncated.
  expect(h.db.select().from(tenantAccountEntries).all()).toHaveLength(50);
});

test("re-running the import changes no row count", async () => {
  const a = lease(1);
  const client = fakeErp({
    leases: [a],
    "tenant-account-entries": [entry(a.id, 1), entry(a.id, 2)],
  });

  await runFullImport({ db: h.db, client, entriesScope: "all" });
  const first = h.db.get<{ n: number }>(sql`select count(*) as n from tenant_account_entries`)!.n;
  await runFullImport({ db: h.db, client, entriesScope: "all" });

  expect(h.db.get<{ n: number }>(sql`select count(*) as n from tenant_account_entries`)!.n).toBe(first);
});

test("an unconfigured ERP is a failed run, not a thrown exception", async () => {
  // `npm run sync:full` from a bare clone: the client is built inside the run, so the
  // configuration error is recorded and printed on one line instead of escaping as a
  // stack trace. chdir as well as clearing the vars — env() falls back to `.env.local`,
  // and the repo root has one.
  const saved = { api: process.env.ERP_API, key: process.env.ERP_PUBLISHABLE_KEY };
  const cwd = process.cwd();
  process.env.ERP_API = "";
  process.env.ERP_PUBLISHABLE_KEY = "";
  process.chdir(h.dir);
  try {
    const summary = await runFullImport({ db: h.db });
    expect(summary.status).toBe("failed");
    expect(summary.error).toMatch(/ERP_API/);
    expect(summary.cursorAfter).toBe(summary.cursorBefore);

    const run = h.db.select().from(syncRuns).all().at(-1)!;
    expect(run.kind).toBe("full");
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/ERP_API/);
    expect(run.finishedAt).toBeTruthy();
    // Nothing was fetched, so nothing was written.
    expect(h.db.select().from(leases).all()).toHaveLength(0);
  } finally {
    process.chdir(cwd);
    process.env.ERP_API = saved.api;
    process.env.ERP_PUBLISHABLE_KEY = saved.key;
  }
});

test("an unknown --only collection fails loudly", async () => {
  const client = fakeErp({});
  await expect(
    runFullImport({ db: h.db, client, only: ["nope" as ErpResource] }),
  ).rejects.toThrow(/not a mirrored collection/);
});
