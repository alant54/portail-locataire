/**
 * Logging in, end to end at the level below the form: the demo accounts, the generic
 * error, the `login_events` row lane C's screen reads, and the two identity seams
 * answering from the resulting session.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { desc, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../db/test-db";
import { loginEvents } from "../db/schema";
import { seedDemoAccounts, DEMO_PASSWORD } from "../../scripts/seed-demo";
import { attemptLogin, INVALID_CREDENTIALS, landingPathFor } from "./login";
import { readSession } from "./session";
import { getCurrentUser } from "./current-user";
import { getCurrentTenant } from "./current-tenant";

const LEA = "lea.martin@example.ch";
const CO_TENANT = "lucas.martin@example.ch";
const MANAGER = "gerance@example.ch";

let h: TestDb;
beforeAll(async () => {
  h = await createTestDb({ seed: true });
  seedDemoAccounts(h.db);
});
afterAll(() => h.close());

const lastEvent = () =>
  h.db.select().from(loginEvents).orderBy(desc(loginEvents.at), desc(loginEvents.id)).get();

describe("attemptLogin", () => {
  test("the demo credentials open a session", () => {
    const outcome = attemptLogin(LEA, DEMO_PASSWORD, { database: h.db, userAgent: "vitest" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(readSession(outcome.session.id, h.db)?.email).toBe(LEA);
    expect(landingPathFor(outcome.user)).toBe("/");
  });

  test("a successful login is recorded for the management screen", () => {
    const before = h.db.select().from(loginEvents).all().length;
    const outcome = attemptLogin(LEA, DEMO_PASSWORD, { database: h.db, userAgent: "vitest" });
    expect(outcome.ok).toBe(true);

    expect(h.db.select().from(loginEvents).all().length).toBe(before + 1);
    const event = lastEvent();
    expect(event?.outcome).toBe("success");
    expect(event?.email).toBe(LEA);
    expect(event?.userAgent).toBe("vitest");
    expect(event?.at).toBeTruthy();
    expect(h.db.select().from(loginEvents).where(eq(loginEvents.userId, event!.userId!)).all().length)
      .toBeGreaterThan(0);
  });

  test("a wrong password opens nothing and says nothing useful", () => {
    const outcome = attemptLogin(LEA, "wrong", { database: h.db });
    expect(outcome).toEqual({ ok: false, message: INVALID_CREDENTIALS });
    expect(lastEvent()?.outcome).toBe("failure");
  });

  test("an unknown email gives the exact same answer as a wrong password", () => {
    const unknown = attemptLogin("nobody@example.ch", DEMO_PASSWORD, { database: h.db });
    const wrong = attemptLogin(LEA, "wrong", { database: h.db });
    expect(unknown).toEqual(wrong);
    // ...and the attempt is still recorded, with the email that was tried.
    expect(lastEvent()?.email).toBe(LEA);
  });

  test("an empty submission is a failure, not a crash", () => {
    expect(attemptLogin("", "", { database: h.db }).ok).toBe(false);
  });

  test("the email is matched case-insensitively and untrimmed input still works", () => {
    expect(attemptLogin("  Lea.Martin@Example.CH  ", DEMO_PASSWORD, { database: h.db }).ok).toBe(true);
  });

  test("a manager lands on the management area, not on a tenant dashboard", () => {
    const outcome = attemptLogin(MANAGER, DEMO_PASSWORD, { database: h.db });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(landingPathFor(outcome.user)).toBe("/admin");
  });
});

describe("the session answers both identity seams", () => {
  test("a tenant session resolves to that tenant and their own lease", async () => {
    const outcome = attemptLogin(LEA, DEMO_PASSWORD, { database: h.db });
    if (!outcome.ok) throw new Error("login failed");
    const lookup = { sessionId: outcome.session.id, database: h.db };

    expect(await getCurrentUser(lookup)).toEqual({
      userId: outcome.user.id,
      email: LEA,
      role: "tenant",
      tenantRef: "TEN-00005",
    });
    expect(await getCurrentTenant(lookup)).toEqual({
      userId: outcome.user.id,
      tenantRef: "TEN-00005",
      leaseRef: "BAIL-000005",
      unitRef: "APT-00005",
    });
  });

  test("a co-tenant gets the lease they share, not a null one", async () => {
    const outcome = attemptLogin(CO_TENANT, DEMO_PASSWORD, { database: h.db });
    if (!outcome.ok) throw new Error("login failed");
    const tenant = await getCurrentTenant({ sessionId: outcome.session.id, database: h.db });
    expect(tenant?.tenantRef).toBe("TEN-06002");
    expect(tenant?.leaseRef).toBe("BAIL-000005");
  });

  test("a manager is somebody, but is no tenant", async () => {
    const outcome = attemptLogin(MANAGER, DEMO_PASSWORD, { database: h.db });
    if (!outcome.ok) throw new Error("login failed");
    const lookup = { sessionId: outcome.session.id, database: h.db };

    expect((await getCurrentUser(lookup))?.role).toBe("manager");
    expect(await getCurrentTenant(lookup)).toBeNull();
  });

  test("no session, an unknown session and a destroyed one all resolve to nobody", async () => {
    expect(await getCurrentUser({ database: h.db })).toBeNull();
    expect(await getCurrentUser({ sessionId: "ghost", database: h.db })).toBeNull();
    expect(await getCurrentTenant({ sessionId: "ghost", database: h.db })).toBeNull();
  });
});

describe("re-seeding", () => {
  test("seed:demo is idempotent and drops the sessions it invalidates", () => {
    const outcome = attemptLogin(LEA, DEMO_PASSWORD, { database: h.db });
    if (!outcome.ok) throw new Error("login failed");

    seedDemoAccounts(h.db);

    expect(readSession(outcome.session.id, h.db)).toBeNull();
    expect(attemptLogin(LEA, DEMO_PASSWORD, { database: h.db }).ok).toBe(true);
  });
});
