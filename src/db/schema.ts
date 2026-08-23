/**
 * FROZEN CONTRACT — changes go through `main` and are merged into every lane worktree.
 *
 * Two families of tables:
 *  - mirror tables, written only by the sync (lane A) through `src/db/upsert.ts`;
 *  - portal-owned tables, written by the app itself.
 *
 * Mirror columns follow the ERP exactly (probed 2026-08-23): a collection that has no
 * `external_ref` / `source_revision` / `archived_at` does not get one here either. Two
 * portal-owned columns are added to every mirror table: `syncedAt` (when we last wrote
 * the row) and `deletedAt` (set when a sync-event delete is applied, since most
 * collections have no `archived_at` of their own).
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Columns every mirror table carries locally. */
const mirrorLocal = {
  syncedAt: text("synced_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  deletedAt: text("deleted_at"),
};

/* ------------------------------------------------------------------ *
 * Mirror — patrimoine
 * ------------------------------------------------------------------ */

export const managementCompanies = sqliteTable("management_companies", {
  id: text("id").primaryKey(),
  externalRef: text("external_ref").notNull().unique(),
  legalName: text("legal_name"),
  cantonCode: text("canton_code"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
  sourceRevision: integer("source_revision"),
  archivedAt: text("archived_at"),
  ...mirrorLocal,
});

export const portfolios = sqliteTable("portfolios", {
  id: text("id").primaryKey(),
  externalRef: text("external_ref").notNull().unique(),
  managementCompanyId: text("management_company_id"),
  name: text("name"),
  regionName: text("region_name"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
  sourceRevision: integer("source_revision"),
  archivedAt: text("archived_at"),
  ...mirrorLocal,
});

export const properties = sqliteTable("properties", {
  id: text("id").primaryKey(),
  externalRef: text("external_ref").notNull().unique(),
  portfolioId: text("portfolio_id"),
  name: text("name"),
  streetName: text("street_name"),
  streetNumber: text("street_number"),
  postalCode: text("postal_code"),
  locality: text("locality"),
  constructionYear: integer("construction_year"),
  energyLabel: text("energy_label"),
  addressIsSynthetic: integer("address_is_synthetic", { mode: "boolean" }),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
  sourceRevision: integer("source_revision"),
  archivedAt: text("archived_at"),
  ...mirrorLocal,
});

export const buildings = sqliteTable("buildings", {
  id: text("id").primaryKey(),
  externalRef: text("external_ref").notNull().unique(),
  propertyId: text("property_id"),
  label: text("label"),
  floors: integer("floors"),
  hasLift: integer("has_lift", { mode: "boolean" }),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
  sourceRevision: integer("source_revision"),
  archivedAt: text("archived_at"),
  ...mirrorLocal,
});

export const rentalUnits = sqliteTable(
  "rental_units",
  {
    id: text("id").primaryKey(),
    externalRef: text("external_ref").notNull().unique(),
    buildingId: text("building_id"),
    unitKind: text("unit_kind"),
    label: text("label"),
    floorLabel: text("floor_label"),
    rooms: integer("rooms"),
    surfaceM2: real("surface_m2"),
    occupancyStatus: text("occupancy_status"),
    rentableFrom: text("rentable_from"),
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    sourceRevision: integer("source_revision"),
    archivedAt: text("archived_at"),
    ...mirrorLocal,
  },
  (t) => [index("rental_units_building_idx").on(t.buildingId)],
);

/* ------------------------------------------------------------------ *
 * Mirror — parties, baux et rôles
 * ------------------------------------------------------------------ */

export const parties = sqliteTable("parties", {
  id: text("id").primaryKey(),
  externalRef: text("external_ref").notNull().unique(),
  partyKind: text("party_kind"),
  displayName: text("display_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phoneE164: text("phone_e164"),
  locale: text("locale"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
  sourceRevision: integer("source_revision"),
  archivedAt: text("archived_at"),
  ...mirrorLocal,
});

export const leases = sqliteTable(
  "leases",
  {
    id: text("id").primaryKey(),
    externalRef: text("external_ref").notNull().unique(),
    primaryRentalUnitId: text("primary_rental_unit_id"),
    status: text("status"),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    noticeOn: text("notice_on"),
    currency: text("currency"),
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    sourceRevision: integer("source_revision"),
    archivedAt: text("archived_at"),
    ...mirrorLocal,
  },
  (t) => [index("leases_unit_idx").on(t.primaryRentalUnitId)],
);

/** No `id` in the ERP: composite key over the pair + role. */
export const leaseParties = sqliteTable(
  "lease_parties",
  {
    leaseContractId: text("lease_contract_id").notNull(),
    partyId: text("party_id").notNull(),
    role: text("role").notNull(),
    ...mirrorLocal,
  },
  (t) => [
    primaryKey({ columns: [t.leaseContractId, t.partyId, t.role] }),
    index("lease_parties_party_idx").on(t.partyId),
  ],
);

/** No `id` in the ERP: composite key over the pair + role. */
export const leaseObjects = sqliteTable(
  "lease_objects",
  {
    leaseContractId: text("lease_contract_id").notNull(),
    rentalUnitId: text("rental_unit_id").notNull(),
    objectRole: text("object_role").notNull(),
    ...mirrorLocal,
  },
  (t) => [
    primaryKey({ columns: [t.leaseContractId, t.rentalUnitId, t.objectRole] }),
    index("lease_objects_lease_idx").on(t.leaseContractId),
  ],
);

/* ------------------------------------------------------------------ *
 * Mirror — argent
 * ------------------------------------------------------------------ */

/** No `external_ref`, no `archived_at` in the ERP. */
export const rentTerms = sqliteTable(
  "rent_terms",
  {
    id: text("id").primaryKey(),
    leaseContractId: text("lease_contract_id"),
    effectiveFrom: text("effective_from"),
    effectiveTo: text("effective_to"),
    baseRentChf: real("base_rent_chf"),
    serviceChargesChf: real("service_charges_chf"),
    parkingChargesChf: real("parking_charges_chf"),
    indexedOn: text("indexed_on"),
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    sourceRevision: integer("source_revision"),
    ...mirrorLocal,
  },
  (t) => [index("rent_terms_lease_idx").on(t.leaseContractId)],
);

/** No `archived_at` in the ERP. */
export const tenantAccountEntries = sqliteTable(
  "tenant_account_entries",
  {
    id: text("id").primaryKey(),
    externalRef: text("external_ref").notNull().unique(),
    leaseContractId: text("lease_contract_id"),
    entryKind: text("entry_kind"),
    direction: text("direction").$type<"debit" | "credit">(),
    status: text("status"),
    amountChf: real("amount_chf"),
    dueOn: text("due_on"),
    settledOn: text("settled_on"),
    description: text("description"),
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    sourceRevision: integer("source_revision"),
    ...mirrorLocal,
  },
  (t) => [
    index("entries_lease_idx").on(t.leaseContractId),
    index("entries_due_idx").on(t.dueOn),
  ],
);

/** No `external_ref`, no `archived_at` in the ERP. */
export const paymentPlans = sqliteTable(
  "payment_plans",
  {
    id: text("id").primaryKey(),
    leaseContractId: text("lease_contract_id"),
    status: text("status"),
    monthlyAmountChf: real("monthly_amount_chf"),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    sourceRevision: integer("source_revision"),
    ...mirrorLocal,
  },
  (t) => [index("payment_plans_lease_idx").on(t.leaseContractId)],
);

/* ------------------------------------------------------------------ *
 * Mirror — compteurs et entretien
 * ------------------------------------------------------------------ */

/** No `archived_at` in the ERP. */
export const meterPoints = sqliteTable(
  "meter_points",
  {
    id: text("id").primaryKey(),
    externalRef: text("external_ref").notNull().unique(),
    rentalUnitId: text("rental_unit_id"),
    meterKind: text("meter_kind"),
    unitOfMeasure: text("unit_of_measure"),
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    sourceRevision: integer("source_revision"),
    ...mirrorLocal,
  },
  (t) => [index("meter_points_unit_idx").on(t.rentalUnitId)],
);

/** Only `id` and `created_at` in the ERP: no revision compare, always overwritten. */
export const meterReadings = sqliteTable(
  "meter_readings",
  {
    id: text("id").primaryKey(),
    meterPointId: text("meter_point_id"),
    readingOn: text("reading_on"),
    value: real("value"),
    readingSource: text("reading_source"),
    createdAt: text("created_at"),
    ...mirrorLocal,
  },
  (t) => [index("meter_readings_point_idx").on(t.meterPointId)],
);

/** No `archived_at` in the ERP. */
export const plannedMaintenance = sqliteTable(
  "planned_maintenance",
  {
    id: text("id").primaryKey(),
    externalRef: text("external_ref").notNull().unique(),
    buildingId: text("building_id"),
    category: text("category"),
    status: text("status"),
    plannedFor: text("planned_for"),
    description: text("description"),
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    sourceRevision: integer("source_revision"),
    ...mirrorLocal,
  },
  (t) => [
    index("maintenance_building_idx").on(t.buildingId),
    index("maintenance_planned_for_idx").on(t.plannedFor),
  ],
);

/* ------------------------------------------------------------------ *
 * Portal-owned
 * ------------------------------------------------------------------ */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"tenant" | "manager">().notNull(),
  /** party `external_ref` (e.g. TEN-00001); null for managers. */
  tenantRef: text("tenant_ref"),
  displayName: text("display_name"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginEvents = sqliteTable(
  "login_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** kept even when the account is unknown, so failed attempts are visible */
    email: text("email"),
    at: text("at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    outcome: text("outcome").$type<"success" | "failure">().notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("login_events_at_idx").on(t.at)],
);

export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    /** refs, not UUIDs: a ticket survives a full re-sync */
    tenantRef: text("tenant_ref").notNull(),
    leaseRef: text("lease_ref"),
    unitRef: text("unit_ref"),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status")
      .$type<"open" | "in_progress" | "closed">()
      .notNull()
      .default("open"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index("tickets_tenant_idx").on(t.tenantRef),
    index("tickets_status_idx").on(t.status),
  ],
);

export const ticketComments = sqliteTable(
  "ticket_comments",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorKind: text("author_kind").$type<"tenant" | "manager">().notNull(),
    /** a status change is a timeline entry too */
    kind: text("kind").$type<"comment" | "status">().notNull().default("comment"),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("ticket_comments_ticket_idx").on(t.ticketId)],
);

/** Singleton row (`id = 1`) holding the last processed sync-event `change_id`. */
export const syncCursor = sqliteTable("sync_cursor", {
  id: integer("id").primaryKey().default(1),
  lastChangeId: integer("last_change_id").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<"full" | "incremental">().notNull(),
    startedAt: text("started_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    finishedAt: text("finished_at"),
    eventsApplied: integer("events_applied").notNull().default(0),
    cursorBefore: integer("cursor_before"),
    cursorAfter: integer("cursor_after"),
    status: text("status").$type<"ok" | "failed" | "running">().notNull(),
    error: text("error"),
  },
  (t) => [index("sync_runs_started_idx").on(t.startedAt)],
);
