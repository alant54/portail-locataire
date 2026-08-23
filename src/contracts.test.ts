/**
 * Enforces the frozen seams (specs/cross-lane-interfaces).
 * If a lane drops a field from either returned shape, this fails.
 */
import { afterAll, beforeAll, expect, test } from "vitest";
import { createTestDb, type TestDb } from "./db/test-db";
import {
  CURRENT_TENANT_FIELDS,
  SESSION_USER_FIELDS,
  SYNC_RUN_SUMMARY_FIELDS,
} from "./contracts";
import { getCurrentTenant } from "./auth/current-tenant";
import { getCurrentUser } from "./auth/current-user";
import { runIncrementalSync } from "./sync/index";
import { syncRuns } from "./db/schema";
import { attemptLogin } from "./auth/login";
import { seedDemoAccounts, DEMO_PASSWORD } from "../scripts/seed-demo";

let h: TestDb;
/** Fixtures + demo accounts, so the identity seams have a real session to answer from. */
let identity: TestDb;
let session: { id: string; userId: string };

beforeAll(async () => {
  h = await createTestDb();
  identity = await createTestDb({ seed: true });
  seedDemoAccounts(identity.db);
  const outcome = attemptLogin("lea.martin@example.ch", DEMO_PASSWORD, { database: identity.db });
  if (!outcome.ok) throw new Error("could not open a session for the contract test");
  session = { id: outcome.session.id, userId: outcome.user.id };
});
afterAll(() => {
  h.close();
  identity.close();
});

/** What a caller holding a session id passes; production passes nothing and reads the cookie. */
const lookup = () => ({ sessionId: session.id, database: identity.db });

test("getCurrentTenant() returns every field of CurrentTenant", async () => {
  const tenant = await getCurrentTenant(lookup());
  expect(tenant).not.toBeNull();
  for (const field of CURRENT_TENANT_FIELDS) {
    expect(Object.keys(tenant!), `missing ${field}`).toContain(field);
  }
  expect(typeof tenant!.userId).toBe("string");
  expect(tenant!.tenantRef).toMatch(/^TEN-/);
  expect(tenant!.leaseRef).toMatch(/^BAIL-/);
  expect(tenant!.unitRef).toMatch(/^APT-/);
});

test("getCurrentUser() returns every field of SessionUser", async () => {
  const user = await getCurrentUser(lookup());
  expect(user).not.toBeNull();
  for (const field of SESSION_USER_FIELDS) {
    expect(Object.keys(user!), `missing ${field}`).toContain(field);
  }
  expect(typeof user!.userId).toBe("string");
  expect(typeof user!.email).toBe("string");
  expect(["tenant", "manager"]).toContain(user!.role);
});

/**
 * The role seam only earns its keep if it can also say "not a manager" and "nobody" —
 * the two answers lane C's 404 gate is built on. Phase 0 faked both with a
 * `PORTAL_STUB_ROLE` env knob; now they come from the session itself, which is the thing
 * the gate will actually be holding.
 */
test("getCurrentUser() can return a tenant and an absent session", async () => {
  const tenant = await getCurrentUser(lookup());
  expect(tenant?.role).toBe("tenant");
  expect(tenant?.tenantRef).toMatch(/^TEN-/);

  const manager = attemptLogin("gerance@example.ch", DEMO_PASSWORD, { database: identity.db });
  if (!manager.ok) throw new Error("could not open a manager session");
  expect((await getCurrentUser({ sessionId: manager.session.id, database: identity.db }))?.role)
    .toBe("manager");

  // No session at all, and a session id nobody ever issued.
  expect(await getCurrentUser({ database: identity.db })).toBeNull();
  expect(await getCurrentUser({ sessionId: "never-issued", database: identity.db })).toBeNull();
});

/**
 * The two seams answer different questions, and lane C's gate depends on the difference:
 * a manager is signed in (`SessionUser`) but has no tenant data to read (`CurrentTenant`).
 */
test("a manager is a user but not a tenant", async () => {
  const manager = attemptLogin("gerance@example.ch", DEMO_PASSWORD, { database: identity.db });
  if (!manager.ok) throw new Error("could not open a manager session");
  const managerLookup = { sessionId: manager.session.id, database: identity.db };

  expect(await getCurrentUser(managerLookup)).not.toBeNull();
  expect(await getCurrentTenant(managerLookup)).toBeNull();
});

/**
 * A stand-in ERP with nothing new to report. Injected so this test stays hermetic:
 * the real client needs `.env.local`, which only lane A's worktree has.
 */
const noEventsErp = () => ({
  async getPage() {
    return { data: [], meta: { resource: "sync-events", limit: 500, offset: 0, next_offset: null } };
  },
  async *listAll() {},
  async getOne() {
    return null;
  },
});

test("runIncrementalSync() returns every field of SyncRunSummary", async () => {
  const summary = await runIncrementalSync(h.db, noEventsErp());
  for (const field of SYNC_RUN_SUMMARY_FIELDS) {
    expect(Object.keys(summary), `missing ${field}`).toContain(field);
  }
  expect(summary.kind).toBe("incremental");
  expect(summary.status).toBe("ok");
  expect(typeof summary.eventsApplied).toBe("number");
  expect(summary.cursorAfter).toBe(summary.cursorBefore);
});

test("every run is recorded in sync_runs", async () => {
  const summary = await runIncrementalSync(h.db, noEventsErp());
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
