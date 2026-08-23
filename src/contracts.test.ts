/**
 * Enforces the frozen seams (specs/cross-lane-interfaces).
 * If a lane drops a field from either returned shape, this fails.
 */
import { afterAll, beforeAll, expect, test } from "vitest";
import { createTestDb, type TestDb } from "./db/test-db.js";
import { CURRENT_TENANT_FIELDS, SYNC_RUN_SUMMARY_FIELDS } from "./contracts.js";
import { getCurrentTenant } from "./auth/current-tenant.js";
import { runIncrementalSync } from "./sync/index.js";
import { syncRuns } from "./db/schema.js";

let h: TestDb;
beforeAll(async () => { h = await createTestDb(); });
afterAll(() => h.close());

test("getCurrentTenant() returns every field of CurrentTenant", () => {
  const tenant = getCurrentTenant();
  expect(tenant).not.toBeNull();
  for (const field of CURRENT_TENANT_FIELDS) {
    expect(Object.keys(tenant!), `missing ${field}`).toContain(field);
  }
  expect(typeof tenant!.userId).toBe("string");
  expect(tenant!.tenantRef).toMatch(/^TEN-/);
  expect(tenant!.leaseRef).toMatch(/^BAIL-/);
  expect(tenant!.unitRef).toMatch(/^APT-/);
});

test("runIncrementalSync() returns every field of SyncRunSummary", async () => {
  const summary = await runIncrementalSync(h.db);
  for (const field of SYNC_RUN_SUMMARY_FIELDS) {
    expect(Object.keys(summary), `missing ${field}`).toContain(field);
  }
  expect(summary.kind).toBe("incremental");
  expect(summary.status).toBe("ok");
  expect(typeof summary.eventsApplied).toBe("number");
  expect(summary.cursorAfter).toBe(summary.cursorBefore);
});

test("every run is recorded in sync_runs", async () => {
  const summary = await runIncrementalSync(h.db);
  const rows = h.db.select().from(syncRuns).all();
  expect(rows.some((r) => r.id === summary.runId)).toBe(true);
});

test("a narrowed return value is caught", () => {
  // What a lane would break if it dropped a field: the guard below is the same
  // membership check the two tests above run against the real implementations.
  const narrowed = { runId: "x", kind: "incremental", eventsApplied: 0 };
  const missing = SYNC_RUN_SUMMARY_FIELDS.filter((f) => !(f in narrowed));
  expect(missing).toEqual(["cursorBefore", "cursorAfter", "status"]);
});
