/**
 * Passwords and sessions, at the level where they are plain SQL — no request scope.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../db/test-db";
import { loginEvents, sessions, users } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";
import {
  createSession,
  destroySession,
  purgeExpiredSessions,
  readSession,
  recordLoginEvent,
} from "./session";

let h: TestDb;
beforeAll(async () => {
  h = await createTestDb();
  h.db
    .insert(users)
    .values({
      id: "u1",
      email: "someone@example.ch",
      passwordHash: hashPassword("correct horse"),
      role: "tenant",
      tenantRef: "TEN-00005",
      displayName: "Someone",
    })
    .run();
});
afterAll(() => h.close());

describe("password hashing", () => {
  test("a password verifies against its own hash and nothing else", () => {
    const stored = hashPassword("correct horse");
    expect(verifyPassword("correct horse", stored)).toBe(true);
    expect(verifyPassword("Correct horse", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  test("two hashes of the same password differ — the salt is per hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  test("the plaintext never appears in the stored value", () => {
    expect(hashPassword("portail2026")).not.toContain("portail2026");
  });

  test("a corrupted or foreign hash reads as a wrong password, it does not throw", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "bcrypt$12$abc")).toBe(false);
    expect(verifyPassword("x", "scrypt$notanumber$ab$cd")).toBe(false);
  });
});

describe("sessions", () => {
  test("a session round-trips to its user and dies when destroyed", () => {
    const session = createSession("u1", h.db);
    expect(readSession(session.id, h.db)?.email).toBe("someone@example.ch");

    destroySession(session.id, h.db);
    expect(readSession(session.id, h.db)).toBeNull();
  });

  test("an unknown session id resolves to nobody", () => {
    expect(readSession("not-a-session", h.db)).toBeNull();
  });

  test("an expired session resolves to nobody and is purged", () => {
    const expired = createSession("u1", h.db, -1000);
    expect(readSession(expired.id, h.db)).toBeNull();

    expect(h.db.select().from(sessions).where(eq(sessions.id, expired.id)).get()).toBeDefined();
    purgeExpiredSessions(h.db);
    expect(h.db.select().from(sessions).where(eq(sessions.id, expired.id)).get()).toBeUndefined();
  });

  test("session ids are unguessable and unique", () => {
    const ids = new Set(Array.from({ length: 20 }, () => createSession("u1", h.db).id));
    expect(ids.size).toBe(20);
    expect([...ids].every((id) => id.length >= 32)).toBe(true);
  });
});

describe("login events", () => {
  test("a failure is recorded with the submitted email and no user", () => {
    recordLoginEvent(
      { userId: null, email: "ghost@example.ch", outcome: "failure", userAgent: "vitest" },
      h.db,
    );
    const row = h.db
      .select()
      .from(loginEvents)
      .where(eq(loginEvents.email, "ghost@example.ch"))
      .get();
    expect(row?.outcome).toBe("failure");
    expect(row?.userId).toBeNull();
    expect(row?.userAgent).toBe("vitest");
  });
});
