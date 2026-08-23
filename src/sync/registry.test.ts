import { expect, test } from "vitest";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../db/schema";
import {
  ENTITY_TYPE_TO_RESOURCE,
  IMPORT_ORDER,
  MIRRORED,
  NOT_MIRRORED,
  collectionForEntityType,
} from "./registry";

/** A mirror table is one the sync writes: it carries our two local columns. */
const mirrorTables = (Object.values(schema) as unknown[]).filter((value): value is SQLiteTable => {
  if (typeof value !== "object" || value === null) return false;
  try {
    const names = getTableConfig(value as SQLiteTable).columns.map((c) => c.name);
    return names.includes("synced_at") && names.includes("deleted_at");
  } catch {
    return false;
  }
});

test("the registry is a bijection with the 15 mirror tables", () => {
  expect(mirrorTables).toHaveLength(15);

  const registered = MIRRORED.map((c) => getTableConfig(c.table).name).sort();
  const declared = mirrorTables.map((t) => getTableConfig(t).name).sort();

  expect(registered).toEqual(declared);
  expect(new Set(registered).size).toBe(registered.length);
});

test("the four non-mirrored collections are absent from the registry", () => {
  const resources = new Set(MIRRORED.map((c) => c.resource));
  expect(NOT_MIRRORED).toHaveLength(4);
  for (const resource of NOT_MIRRORED) expect(resources.has(resource)).toBe(false);
  expect(resources.has("sync-events")).toBe(false);
});

test("irregular shapes are encoded, not assumed", () => {
  const byResource = new Map(MIRRORED.map((c) => [c.resource, c]));

  // No `id` at all in the ERP: composite key on the FK pair plus the role.
  expect(byResource.get("lease-parties")!.primaryKey).toEqual([
    "lease_contract_id", "party_id", "role",
  ]);
  expect(byResource.get("lease-objects")!.primaryKey).toEqual([
    "lease_contract_id", "rental_unit_id", "object_role",
  ]);

  // No `source_revision`: every write overwrites.
  expect(byResource.get("meter-readings")!.hasSourceRevision).toBe(false);

  // Detail endpoints exist for 10 of the 15 mirrored collections.
  expect(MIRRORED.filter((c) => c.hasDetail)).toHaveLength(10);
});

test("every registry primary key matches the schema's", () => {
  for (const collection of MIRRORED) {
    const config = getTableConfig(collection.table);
    const composite = config.primaryKeys[0];
    const columns = composite ? composite.columns : config.columns.filter((c) => c.primary);
    expect([...columns.map((c) => c.name)].sort()).toEqual([...collection.primaryKey].sort());
  }
});

test("the entity-type allow-list is exactly the four measured keys", () => {
  // Measured over the whole sync-events stream (20 665 events, 2026-08-23).
  expect(Object.keys(ENTITY_TYPE_TO_RESOURCE).sort()).toEqual([
    "lease_contract", "party", "property", "rental_unit",
  ]);

  expect(collectionForEntityType("property")!.resource).toBe("properties");
  expect(collectionForEntityType("rental_unit")!.resource).toBe("rental-units");
  expect(collectionForEntityType("party")!.resource).toBe("parties");
  // The trap: singularising `leases` gives `lease`, which matches nothing.
  expect(collectionForEntityType("lease_contract")!.resource).toBe("leases");
  expect(collectionForEntityType("lease")).toBeUndefined();

  // Anything outside the allow-list resolves to undefined so the caller can skip it.
  expect(collectionForEntityType("tenant_account_entry")).toBeUndefined();
  expect(collectionForEntityType("unit_amenity")).toBeUndefined();
});

test("import order puts FK targets before the rows pointing at them", () => {
  const rank = new Map(IMPORT_ORDER.map((c, i) => [c.resource, i]));
  expect(rank.get("properties")!).toBeLessThan(rank.get("buildings")!);
  expect(rank.get("buildings")!).toBeLessThan(rank.get("rental-units")!);
  expect(rank.get("rental-units")!).toBeLessThan(rank.get("leases")!);
  expect(rank.get("leases")!).toBeLessThan(rank.get("lease-parties")!);
  expect(rank.get("parties")!).toBeLessThan(rank.get("lease-parties")!);
  expect(rank.get("leases")!).toBeLessThan(rank.get("tenant-account-entries")!);
  expect(rank.get("meter-points")!).toBeLessThan(rank.get("meter-readings")!);
});
