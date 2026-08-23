/**
 * One table of facts about the ERP collections, iterated by both the full import
 * and the incremental sync.
 *
 * Three irregularities are encoded here rather than rediscovered at each call site:
 *  - `lease-parties` / `lease-objects` have no `id` in the ERP at all; their primary
 *    key is the FK pair plus the role;
 *  - `meter-readings` has no `source_revision`, so it is always overwritten;
 *  - four collections are deliberately not mirrored.
 *
 * `entityType` is the fourth: it is the key `sync-events` uses, and it is NOT the
 * singular of the collection name — see ENTITY_TYPE_TO_RESOURCE below.
 */
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { ErpResource } from "../erp/types.js";
import * as schema from "../db/schema.js";

export interface MirrorCollection {
  /** ERP path segment, e.g. `rental-units`. */
  resource: ErpResource;
  table: SQLiteTable;
  /** Import order: FK targets before the rows that point at them. */
  rank: number;
  /** Column names as the ERP spells them, in primary-key order. */
  primaryKey: string[];
  /** Whether `GET /v1/{resource}/{external_ref}` exists. */
  hasDetail: boolean;
  /** Whether rows carry `source_revision` (if not, every write overwrites). */
  hasSourceRevision: boolean;
  /** The `sync-events.entity_type` key, when this collection emits events at all. */
  entityType?: string;
}

export const MIRRORED: MirrorCollection[] = [
  // Patrimoine
  { resource: "management-companies", table: schema.managementCompanies, rank: 1, primaryKey: ["id"], hasDetail: true, hasSourceRevision: true },
  { resource: "portfolios", table: schema.portfolios, rank: 2, primaryKey: ["id"], hasDetail: true, hasSourceRevision: true },
  { resource: "properties", table: schema.properties, rank: 3, primaryKey: ["id"], hasDetail: true, hasSourceRevision: true, entityType: "property" },
  { resource: "buildings", table: schema.buildings, rank: 4, primaryKey: ["id"], hasDetail: true, hasSourceRevision: true },
  { resource: "rental-units", table: schema.rentalUnits, rank: 5, primaryKey: ["id"], hasDetail: true, hasSourceRevision: true, entityType: "rental_unit" },
  // Parties, baux et rôles
  { resource: "parties", table: schema.parties, rank: 6, primaryKey: ["id"], hasDetail: true, hasSourceRevision: true, entityType: "party" },
  { resource: "leases", table: schema.leases, rank: 7, primaryKey: ["id"], hasDetail: true, hasSourceRevision: true, entityType: "lease_contract" },
  { resource: "lease-parties", table: schema.leaseParties, rank: 8, primaryKey: ["lease_contract_id", "party_id", "role"], hasDetail: false, hasSourceRevision: false },
  { resource: "lease-objects", table: schema.leaseObjects, rank: 9, primaryKey: ["lease_contract_id", "rental_unit_id", "object_role"], hasDetail: false, hasSourceRevision: false },
  // Argent
  { resource: "rent-terms", table: schema.rentTerms, rank: 10, primaryKey: ["id"], hasDetail: false, hasSourceRevision: true },
  { resource: "tenant-account-entries", table: schema.tenantAccountEntries, rank: 11, primaryKey: ["id"], hasDetail: true, hasSourceRevision: true },
  { resource: "payment-plans", table: schema.paymentPlans, rank: 12, primaryKey: ["id"], hasDetail: false, hasSourceRevision: true },
  // Compteurs et entretien
  { resource: "meter-points", table: schema.meterPoints, rank: 13, primaryKey: ["id"], hasDetail: true, hasSourceRevision: true },
  { resource: "meter-readings", table: schema.meterReadings, rank: 14, primaryKey: ["id"], hasDetail: false, hasSourceRevision: false },
  { resource: "planned-maintenance", table: schema.plannedMaintenance, rank: 15, primaryKey: ["id"], hasDetail: true, hasSourceRevision: true },
];

/**
 * Deliberately outside the mirror: no demo screen reads them, and
 * `tenant-portal-snapshots` is the balance oracle, not a data source.
 */
export const NOT_MIRRORED: ErpResource[] = [
  "unit-amenities",
  "unit-statuses",
  "dataset-releases",
  "tenant-portal-snapshots",
];

/**
 * The `sync-events` allow-list, measured over the whole stream (20 665 events,
 * 2026-08-23): these four keys are the only ones that occur.
 *
 * `lease_contract` is why this is a table and not a `singularise(resource)` call —
 * that rule yields `lease`, matches nothing, and would drop 6 525 of 20 665 events
 * while every collection still looked correctly mapped.
 */
export const ENTITY_TYPE_TO_RESOURCE: Readonly<Record<string, ErpResource>> = Object.freeze({
  property: "properties",
  rental_unit: "rental-units",
  party: "parties",
  lease_contract: "leases",
});

const byResource = new Map(MIRRORED.map((c) => [c.resource, c]));

export function collectionFor(resource: ErpResource): MirrorCollection | undefined {
  return byResource.get(resource);
}

/** `undefined` for an entity type outside the allow-list — the caller skips it. */
export function collectionForEntityType(entityType: string): MirrorCollection | undefined {
  const resource = ENTITY_TYPE_TO_RESOURCE[entityType];
  return resource ? byResource.get(resource) : undefined;
}

/** Import order: FK targets first. */
export const IMPORT_ORDER = [...MIRRORED].sort((a, b) => a.rank - b.rank);
