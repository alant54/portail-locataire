/**
 * The management reads (specs/management-screens).
 *
 * Attempts are written by hand where a fixed timestamp is what the assertion is about
 * (ordering, the limit); the per-account failure count instead goes through the real
 * `attemptLogin`, because that count reads `login_events.user_id` and a hand-inserted
 * row is free to carry a user id the login path would never produce.
 */
import { afterEach, beforeEach, expect, test } from "vitest";
import { attemptLogin } from "../auth/login";
import { createTestDb, type TestDb } from "../db/test-db";
import { loginEvents, parties, users } from "../db/schema";
import {
  countMirrorRows,
  listAccountsWithLastLogin,
  listRecentLogins,
} from "./management-queries";

let h: TestDb;
beforeEach(async () => {
  h = await createTestDb();
});
afterEach(() => h.close());

function account(id: string, email: string, role: "tenant" | "manager", tenantRef?: string) {
  h.db
    .insert(users)
    .values({ id, email, passwordHash: "x", role, tenantRef: tenantRef ?? null })
    .run();
}

function attempt(args: {
  id: string;
  at: string;
  outcome: "success" | "failure";
  userId?: string;
  email?: string;
}) {
  h.db
    .insert(loginEvents)
    .values({
      id: args.id,
      at: args.at,
      outcome: args.outcome,
      userId: args.userId ?? null,
      email: args.email ?? null,
      ip: "127.0.0.1",
    })
    .run();
}

test("the newest attempt comes first and carries the account it belongs to", () => {
  account("u-1", "alice@example.ch", "tenant", "TEN-00005");
  attempt({ id: "e-1", at: "2026-08-20T08:00:00.000Z", outcome: "success", userId: "u-1" });
  attempt({ id: "e-2", at: "2026-08-23T09:30:00.000Z", outcome: "success", userId: "u-1" });

  const [newest, older] = listRecentLogins(50, h.db);
  expect(newest!.id).toBe("e-2");
  expect(newest!.email).toBe("alice@example.ch");
  expect(newest!.role).toBe("tenant");
  expect(newest!.tenantRef).toBe("TEN-00005");
  expect(older!.id).toBe("e-1");
});

test("a failed attempt on an unknown address is still listed", () => {
  account("u-1", "alice@example.ch", "tenant", "TEN-00005");
  attempt({ id: "e-1", at: "2026-08-23T07:00:00.000Z", outcome: "success", userId: "u-1" });
  attempt({ id: "e-2", at: "2026-08-23T10:00:00.000Z", outcome: "failure", email: "ghost@example.ch" });

  const rows = listRecentLogins(50, h.db);
  expect(rows[0]!.outcome).toBe("failure");
  expect(rows[0]!.email).toBe("ghost@example.ch");
  // No account behind it: the screen shows the address, and nothing it cannot know.
  expect(rows[0]!.role).toBeNull();
  expect(rows[0]!.tenantRef).toBeNull();
});

test("the limit keeps the screen to the most recent attempts", () => {
  account("u-1", "alice@example.ch", "tenant", "TEN-00005");
  for (let i = 0; i < 60; i++) {
    attempt({
      id: `e-${String(i).padStart(3, "0")}`,
      at: `2026-08-23T${String(i % 24).padStart(2, "0")}:00:00.000Z`,
      outcome: "success",
      userId: "u-1",
    });
  }
  expect(listRecentLogins(50, h.db)).toHaveLength(50);
});

test("each account reports its last success, its failures, and 'never' when it applies", () => {
  account("u-1", "alice@example.ch", "tenant", "TEN-00005");
  account("u-2", "gerance@example.ch", "manager");
  attempt({ id: "e-1", at: "2026-08-22T08:00:00.000Z", outcome: "success", userId: "u-1" });

  // The real path, not a hand-made row: one wrong password on an existing address, one
  // on an address owning no account. Only the first may move a counter.
  expect(attemptLogin("alice@example.ch", "wrong", { database: h.db }).ok).toBe(false);
  expect(attemptLogin("ghost@example.ch", "wrong", { database: h.db }).ok).toBe(false);

  const accounts = listAccountsWithLastLogin(h.db);
  const alice = accounts.find((row) => row.email === "alice@example.ch")!;
  const gerance = accounts.find((row) => row.email === "gerance@example.ch")!;

  expect(alice.lastSuccessAt).toBe("2026-08-22T08:00:00.000Z");
  expect(Number(alice.failures)).toBe(1);
  expect(gerance.lastSuccessAt).toBeNull();
  expect(Number(gerance.failures)).toBe(0);
});

test("row counts cover every mirror table and hide soft-deleted rows", () => {
  const counts = countMirrorRows(h.db);
  expect(counts).toHaveLength(15);
  expect(counts.every((row) => row.rows === 0 && row.deleted === 0)).toBe(true);

  h.db
    .insert(parties)
    .values([
      { id: "p-1", externalRef: "TEN-00001" },
      { id: "p-2", externalRef: "TEN-00002", deletedAt: "2026-08-23T10:00:00.000Z" },
    ])
    .run();

  const after = countMirrorRows(h.db).find((row) => row.table === "parties")!;
  expect(after.rows).toBe(1);
  expect(after.deleted).toBe(1);
});
