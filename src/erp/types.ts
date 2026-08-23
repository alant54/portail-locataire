/**
 * FROZEN CONTRACT — changes go through `main` and are merged into every lane worktree.
 *
 * Shapes of the read-only ERP, derived from live sample records probed on 2026-08-23
 * (`docs/erp/openapi.json` has no `components.schemas`). Field presence and nullability
 * were measured over up to 300 rows per collection, so a field typed `| null` here was
 * actually observed null.
 *
 * Closed unions are used only where the brief or the OpenAPI documents the full set
 * (`direction`, `operation`, lease-party roles). Everything else stays `string` with the
 * observed values in a comment — the sample cannot prove a set is closed.
 */

/* ------------------------------------------------------------------ *
 * Envelope
 * ------------------------------------------------------------------ */

export interface ErpPage<T> {
  data: T[];
  meta: {
    resource: string;
    limit: number;
    offset: number;
    /** null on the last page — paginate until it is null. */
    next_offset: number | null;
  };
}

/** Fields shared by the collections that expose a revisioned, archivable row. */
export interface ErpRevisioned {
  source_revision: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/* ------------------------------------------------------------------ *
 * Patrimoine
 * ------------------------------------------------------------------ */

export interface ErpManagementCompany extends ErpRevisioned {
  id: string;
  external_ref: string;
  legal_name: string;
  canton_code: string;
}

export interface ErpPortfolio extends ErpRevisioned {
  id: string;
  external_ref: string;
  management_company_id: string;
  name: string;
  region_name: string;
}

export interface ErpProperty extends ErpRevisioned {
  id: string;
  external_ref: string;
  portfolio_id: string;
  name: string;
  street_name: string;
  street_number: string;
  postal_code: string;
  locality: string;
  construction_year: number;
  /** observed: A–G */
  energy_label: string;
  address_is_synthetic: boolean;
}

export interface ErpBuilding extends ErpRevisioned {
  id: string;
  external_ref: string;
  property_id: string;
  label: string;
  floors: number;
  has_lift: boolean;
}

export interface ErpRentalUnit extends ErpRevisioned {
  id: string;
  external_ref: string;
  building_id: string;
  /** observed: apartment */
  unit_kind: string;
  label: string;
  floor_label: string;
  rooms: number;
  surface_m2: number;
  /** observed: occupied */
  occupancy_status: string;
  rentable_from: string | null;
}

/* ------------------------------------------------------------------ *
 * Parties, baux et rôles
 * ------------------------------------------------------------------ */

export interface ErpParty extends ErpRevisioned {
  id: string;
  external_ref: string;
  /** observed: person, company */
  party_kind: string;
  display_name: string;
  /** null for companies */
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone_e164: string;
  /** observed: fr, de, it */
  locale: string;
}

export interface ErpLease extends ErpRevisioned {
  id: string;
  external_ref: string;
  primary_rental_unit_id: string;
  /** observed: active */
  status: string;
  starts_on: string;
  ends_on: string | null;
  notice_on: string | null;
  currency: string;
}

export type ErpLeasePartyRole = "primary_payer" | "co_tenant" | "guarantor";

/** No `id`, no revision: identified by the triple below. */
export interface ErpLeaseParty {
  lease_contract_id: string;
  party_id: string;
  role: ErpLeasePartyRole;
}

/** No `id`, no revision: identified by the triple below. */
export interface ErpLeaseObject {
  lease_contract_id: string;
  rental_unit_id: string;
  /** observed: primary_home, parking */
  object_role: string;
}

/* ------------------------------------------------------------------ *
 * Argent
 * ------------------------------------------------------------------ */

/** No `external_ref`, no `archived_at`. */
export interface ErpRentTerm {
  id: string;
  lease_contract_id: string;
  effective_from: string;
  effective_to: string | null;
  base_rent_chf: number;
  service_charges_chf: number;
  parking_charges_chf: number;
  indexed_on: string;
  created_at: string;
  updated_at: string;
  source_revision: number;
}

export type ErpEntryDirection = "debit" | "credit";

/** No `archived_at`. Balance = Σ debit − Σ credit over these rows. */
export interface ErpTenantAccountEntry {
  id: string;
  external_ref: string;
  lease_contract_id: string;
  /** observed: rent */
  entry_kind: string;
  direction: ErpEntryDirection;
  /** observed: cleared, overdue, partially_paid */
  status: string;
  amount_chf: number;
  due_on: string;
  settled_on: string | null;
  description: string;
  created_at: string;
  updated_at: string;
  source_revision: number;
}

/** No `external_ref`, no `archived_at`. */
export interface ErpPaymentPlan {
  id: string;
  lease_contract_id: string;
  /** observed: active */
  status: string;
  monthly_amount_chf: number;
  starts_on: string;
  ends_on: string;
  created_at: string;
  updated_at: string;
  source_revision: number;
}

/* ------------------------------------------------------------------ *
 * Compteurs et entretien
 * ------------------------------------------------------------------ */

/** No `archived_at`. */
export interface ErpMeterPoint {
  id: string;
  external_ref: string;
  rental_unit_id: string;
  /** observed: electricity, water */
  meter_kind: string;
  /** observed: kwh, m3 */
  unit_of_measure: string;
  created_at: string;
  updated_at: string;
  source_revision: number;
}

/** Only `id` and `created_at`: no revision to compare, so writes always overwrite. */
export interface ErpMeterReading {
  id: string;
  meter_point_id: string;
  reading_on: string;
  value: number;
  /** observed: actual, estimated */
  reading_source: string;
  created_at: string;
}

/** No `archived_at`. */
export interface ErpPlannedMaintenance {
  id: string;
  external_ref: string;
  building_id: string;
  /** observed: lift, heating, facade, roof, common_area */
  category: string;
  /** observed: planned, scheduled, completed */
  status: string;
  planned_for: string;
  description: string;
  created_at: string;
  updated_at: string;
  source_revision: number;
}

/* ------------------------------------------------------------------ *
 * Vues pré-jointes et métadonnées (not mirrored — see design.md)
 * ------------------------------------------------------------------ */

/** Fixtures + balance oracle only. Never the app's data source. */
export interface ErpTenantPortalSnapshot {
  tenant_ref: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  email: string;
  phone_e164: string;
  lease_ref: string;
  unit_ref: string;
  unit_label: string;
  property_name: string;
  street_name: string;
  street_number: string;
  postal_code: string;
  locality: string;
  address_is_synthetic: boolean;
  lease_status: string;
  starts_on: string;
  ends_on: string | null;
  balance_chf: number;
}

export interface ErpUnitAmenity {
  rental_unit_id: string;
  /** observed: cellar, balcony, accessible, dishwasher */
  amenity_code: string;
}

export interface ErpUnitStatus {
  unit_ref: string;
  unit_kind: string;
  unit_label: string;
  rooms: number;
  surface_m2: number;
  occupancy_status: string;
  rentable_from: string | null;
  building_ref: string;
  property_ref: string;
  property_name: string;
  locality: string;
  active_lease_ref: string;
}

export interface ErpDatasetRelease {
  id: string;
  external_ref: string;
  schema_version: string;
  published_at: string;
  seed_name: string;
  seed_checksum: string;
  notes: string;
}

/* ------------------------------------------------------------------ *
 * Sync events
 * ------------------------------------------------------------------ */

export type ErpSyncOperation = "upsert" | "delete";

export interface ErpSyncEvent {
  /** cursor value: pass the highest one seen as `?after=` */
  change_id: number;
  /** singular snake_case, e.g. `rental_unit`, `lease`, `tenant_account_entry` */
  entity_type: string;
  /** a UUID — detail endpoints take `external_ref`, so resolve through the local mirror */
  entity_id: string;
  operation: ErpSyncOperation;
  source_revision: number;
  changed_at: string;
}

/* ------------------------------------------------------------------ *
 * Resource registry
 * ------------------------------------------------------------------ */

/** Every collection exposed by `docs/erp/openapi.json`. */
export const ERP_RESOURCES = [
  "management-companies",
  "portfolios",
  "properties",
  "buildings",
  "rental-units",
  "parties",
  "leases",
  "lease-parties",
  "lease-objects",
  "rent-terms",
  "tenant-account-entries",
  "payment-plans",
  "meter-points",
  "meter-readings",
  "planned-maintenance",
  "tenant-portal-snapshots",
  "unit-amenities",
  "unit-statuses",
  "dataset-releases",
  "sync-events",
] as const;

export type ErpResource = (typeof ERP_RESOURCES)[number];

/** Row type of each collection, so `listAll<'leases'>` can infer its element. */
export interface ErpResourceMap {
  "management-companies": ErpManagementCompany;
  portfolios: ErpPortfolio;
  properties: ErpProperty;
  buildings: ErpBuilding;
  "rental-units": ErpRentalUnit;
  parties: ErpParty;
  leases: ErpLease;
  "lease-parties": ErpLeaseParty;
  "lease-objects": ErpLeaseObject;
  "rent-terms": ErpRentTerm;
  "tenant-account-entries": ErpTenantAccountEntry;
  "payment-plans": ErpPaymentPlan;
  "meter-points": ErpMeterPoint;
  "meter-readings": ErpMeterReading;
  "planned-maintenance": ErpPlannedMaintenance;
  "tenant-portal-snapshots": ErpTenantPortalSnapshot;
  "unit-amenities": ErpUnitAmenity;
  "unit-statuses": ErpUnitStatus;
  "dataset-releases": ErpDatasetRelease;
  "sync-events": ErpSyncEvent;
}

/** Collections whose `GET /v1/{resource}/{externalRef}` detail endpoint exists. */
export const ERP_DETAIL_ENDPOINTS = [
  "management-companies",
  "portfolios",
  "properties",
  "buildings",
  "rental-units",
  "parties",
  "leases",
  "tenant-account-entries",
  "meter-points",
  "planned-maintenance",
] as const satisfies readonly ErpResource[];
