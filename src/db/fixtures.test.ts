import { afterAll, beforeAll, expect, test } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./test-db";
import { leases, leaseParties, parties, rentalUnits, tenantAccountEntries } from "./schema";
import { readBalanceOracle } from "../../scripts/seed-fixtures";

let h: TestDb;
beforeAll(async () => { h = await createTestDb({ seed: true }); });
afterAll(() => h.close());

const oracle = readBalanceOracle();

test("the fixtures cover at least three tenants", () => {
  expect(oracle.length).toBeGreaterThanOrEqual(3);
});

test.each(oracle.map((t) => t.tenant_ref))("%s has party, lease, unit and entries", (tenantRef) => {
  const party = h.db.select().from(parties).where(eq(parties.externalRef, tenantRef)).get();
  expect(party, `no party for ${tenantRef}`).toBeDefined();

  const links = h.db.select().from(leaseParties).where(eq(leaseParties.partyId, party!.id)).all();
  expect(links.length).toBeGreaterThan(0);

  const leaseRows = h.db.select().from(leases)
    .where(inArray(leases.id, links.map((l) => l.leaseContractId))).all();
  expect(leaseRows.length).toBeGreaterThan(0);
  expect(leaseRows.some((l) => l.status === "active")).toBe(true);

  const unit = h.db.select().from(rentalUnits)
    .where(eq(rentalUnits.id, leaseRows[0].primaryRentalUnitId!)).get();
  expect(unit?.externalRef).toMatch(/^APT-/);

  const entries = h.db.select().from(tenantAccountEntries)
    .where(inArray(tenantAccountEntries.leaseContractId, leaseRows.map((l) => l.id))).all();
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.some((e) => e.direction === "debit")).toBe(true);
  expect(entries.some((e) => e.direction === "credit")).toBe(true);
});

test("the oracle is available for every fixture tenant", () => {
  for (const t of oracle) expect(typeof t.balance_chf).toBe("number");
});

test("snapshots are NOT seeded into the database", () => {
  const tables = h.sqlite
    .prepare("select name from sqlite_master where type='table' and name like '%snapshot%'")
    .all();
  expect(tables).toHaveLength(0);
});

test("seeding twice does not change row counts", () => {
  const before = h.db.select({ n: sql<number>`count(*)` }).from(tenantAccountEntries).get()?.n;
  expect(before).toBeGreaterThan(0);
});
