import { afterAll, beforeAll, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./test-db.js";
import { upsertRows, softDeleteRow } from "./upsert.js";
import { buildings, leaseParties, meterReadings, parties } from "./schema.js";

let h: TestDb;
beforeAll(async () => { h = await createTestDb(); });
afterAll(() => h.close());

const party = (over: Record<string, unknown> = {}) => ({
  id: "f8f41102-375b-4eba-a21f-b69498862fa4",
  external_ref: "TEN-00001",
  party_kind: "person",
  display_name: "Camille Martin",
  source_revision: 2,
  updated_at: "2026-08-11T11:57:31.742833+00:00",
  archived_at: null,
  ...over,
});

test("writing the same ERP row twice leaves one row", () => {
  upsertRows(h.db, parties, [party()]);
  upsertRows(h.db, parties, [party()]);
  expect(h.db.select().from(parties).all()).toHaveLength(1);
});

test("an older source_revision does not overwrite", () => {
  upsertRows(h.db, parties, [party({ source_revision: 1, display_name: "Ancienne valeur" })]);
  const row = h.db.select().from(parties).where(eq(parties.externalRef, "TEN-00001")).get();
  expect(row?.displayName).toBe("Camille Martin");
});

test("a newer source_revision overwrites and revives a deleted row", () => {
  softDeleteRow(h.db, parties, sql`"external_ref" = 'TEN-00001'`);
  expect(h.db.select().from(parties).get()?.deletedAt).not.toBeNull();

  upsertRows(h.db, parties, [party({ source_revision: 3, display_name: "Camille Martin-Dubois" })]);
  const row = h.db.select().from(parties).get();
  expect(row?.displayName).toBe("Camille Martin-Dubois");
  expect(row?.deletedAt).toBeNull();
  expect(h.db.select().from(parties).all()).toHaveLength(1);
});

test("a link table with no id upserts on its composite key", () => {
  const link = {
    lease_contract_id: "00081b0b-678f-b011-f7e0-88bd13feaa8a",
    party_id: "84620387-789e-d87c-05cf-227438739953",
    role: "primary_payer",
  };
  upsertRows(h.db, leaseParties, [link]);
  upsertRows(h.db, leaseParties, [link]);
  upsertRows(h.db, leaseParties, [{ ...link, role: "co_tenant" }]);
  expect(h.db.select().from(leaseParties).all()).toHaveLength(2);
});

test("a table without source_revision is simply overwritten", () => {
  const reading = {
    id: "d5e2f8d9-b87a-6c0a-f84e-3244c63fbfdb",
    meter_point_id: "736855c3-20e7-4f35-65c6-85c8f8533c49",
    reading_on: "2025-07-01",
    value: 220,
    reading_source: "actual",
  };
  upsertRows(h.db, meterReadings, [reading]);
  upsertRows(h.db, meterReadings, [{ ...reading, value: 245 }]);
  const rows = h.db.select().from(meterReadings).all();
  expect(rows).toHaveLength(1);
  expect(rows[0].value).toBe(245);
});

test("boolean columns are encoded, not rejected by the driver", () => {
  // Regression: raw SQL bypasses drizzle's mappers and better-sqlite3 cannot bind a JS boolean.
  upsertRows(h.db, buildings, [{
    id: "666c331f-935b-621f-77aa-1d90cd3ceee0",
    external_ref: "BLD-0001",
    property_id: "041ff7f7-6036-111c-52fd-f229bff2b8ef",
    label: "Batiment A",
    floors: 4,
    has_lift: true,
    source_revision: 1,
    archived_at: null,
  }]);
  const row = h.db.select().from(buildings).get();
  expect(row?.hasLift).toBe(true);
  expect(row?.floors).toBe(4);
});
