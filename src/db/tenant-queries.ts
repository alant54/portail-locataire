/**
 * THE ONLY PATH BY WHICH A TENANT PAGE READS DATA.
 *
 * Every exported function takes `tenantRef` as its first argument and derives everything
 * else from it. Pages get that value from `getCurrentTenant()` — i.e. from the session —
 * and never from a URL, query string or form body. A reference that *does* come from the
 * URL (a lease ref in `/bail/<ref>`) is only ever used to **narrow** inside this tenant's
 * own rows: `getLease()` looks the ref up among the leases the tenant is a party to, so a
 * foreign ref resolves to `null` and the page answers 404. That is checklist item 3, and
 * keeping it in one file is what makes it reviewable.
 *
 * Live-row filtering is written out per table on purpose. Only 7 of the 15 mirror tables
 * have an `archived_at` column at all, so a generic "hide archived" helper would either
 * reference a column that does not exist or silently skip the filter where it does.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "./client";
import {
  buildings,
  leaseObjects,
  leaseParties,
  leases,
  parties,
  plannedMaintenance,
  properties,
  rentTerms,
  rentalUnits,
  tenantAccountEntries,
} from "./schema";
import type { MirrorDb } from "./upsert";

export interface LeaseSummary {
  leaseRef: string;
  /** `primary_payer` or `co_tenant` — a co-tenant sees the same lease. */
  role: string;
  status: string | null;
  startsOn: string | null;
  endsOn: string | null;
  noticeOn: string | null;
  unitRef: string | null;
  unitLabel: string | null;
  floorLabel: string | null;
  rooms: number | null;
  surfaceM2: number | null;
  buildingLabel: string | null;
  propertyName: string | null;
  address: string | null;
  locality: string | null;
  postalCode: string | null;
  rent: RentTerm | null;
}

export interface RentTerm {
  baseRentChf: number | null;
  serviceChargesChf: number | null;
  parkingChargesChf: number | null;
  totalChf: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface AccountEntry {
  entryRef: string;
  leaseRef: string;
  kind: string | null;
  direction: "debit" | "credit" | null;
  status: string | null;
  amountChf: number;
  dueOn: string | null;
  settledOn: string | null;
  description: string | null;
}

export interface MaintenanceItem {
  ref: string;
  category: string | null;
  status: string | null;
  plannedFor: string | null;
  description: string | null;
}

export interface DashboardView {
  lease: LeaseSummary | null;
  otherLeases: LeaseSummary[];
  balanceChf: number;
  overdueCount: number;
  recentEntries: AccountEntry[];
  nextEntry: AccountEntry | null;
  nextMaintenance: MaintenanceItem | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The tenant's leases, as `{id, ref, role}`. Everything else in this module is derived
 * from this list, so a tenant can only ever reach rows hanging off one of these leases.
 *
 * Resolved through `lease_parties`, never through `leases.primary_rental_unit_id`: every
 * fixture lease has a `co_tenant` alongside the `primary_payer`, and a co-tenant's own
 * bail would be invisible to them if we matched on the payer alone.
 */
function leaseRowsFor(tenantRef: string, database: MirrorDb) {
  return database
    .select({
      id: leases.id,
      ref: leases.externalRef,
      role: leaseParties.role,
      status: leases.status,
      startsOn: leases.startsOn,
      endsOn: leases.endsOn,
      noticeOn: leases.noticeOn,
    })
    .from(parties)
    .innerJoin(leaseParties, eq(leaseParties.partyId, parties.id))
    .innerJoin(leases, eq(leases.id, leaseParties.leaseContractId))
    .where(
      and(
        eq(parties.externalRef, tenantRef),
        isNull(parties.archivedAt),
        isNull(parties.deletedAt),
        // lease_parties has no `archived_at` in the ERP — local delete flag only.
        isNull(leaseParties.deletedAt),
        isNull(leases.archivedAt),
        isNull(leases.deletedAt),
      ),
    )
    .all();
}

/** active first, then the ones about to end, then the past ones. */
const STATUS_ORDER: Record<string, number> = {
  active: 0,
  notice_given: 1,
  upcoming: 2,
  ended: 3,
  terminated: 3,
};

function statusRank(status: string | null): number {
  return STATUS_ORDER[status ?? ""] ?? 9;
}

/** The home unit of a lease. A lease can also carry a `parking` object; the dashboard
 * shows where the tenant lives, so only `primary_home` is looked up here. */
function unitFor(leaseId: string, database: MirrorDb) {
  return database
    .select({
      unitRef: rentalUnits.externalRef,
      unitLabel: rentalUnits.label,
      floorLabel: rentalUnits.floorLabel,
      rooms: rentalUnits.rooms,
      surfaceM2: rentalUnits.surfaceM2,
      buildingLabel: buildings.label,
      buildingId: buildings.id,
      propertyName: properties.name,
      streetName: properties.streetName,
      streetNumber: properties.streetNumber,
      postalCode: properties.postalCode,
      locality: properties.locality,
    })
    .from(leaseObjects)
    .innerJoin(rentalUnits, eq(rentalUnits.id, leaseObjects.rentalUnitId))
    .leftJoin(buildings, eq(buildings.id, rentalUnits.buildingId))
    .leftJoin(properties, eq(properties.id, buildings.propertyId))
    .where(
      and(
        eq(leaseObjects.leaseContractId, leaseId),
        eq(leaseObjects.objectRole, "primary_home"),
        isNull(leaseObjects.deletedAt),
        isNull(rentalUnits.archivedAt),
        isNull(rentalUnits.deletedAt),
      ),
    )
    .get();
}

/** The rent in force today, falling back to the most recent term for an ended lease. */
function rentFor(leaseId: string, database: MirrorDb, on = today()): RentTerm | null {
  const live = and(eq(rentTerms.leaseContractId, leaseId), isNull(rentTerms.deletedAt));
  const current =
    database
      .select()
      .from(rentTerms)
      .where(
        and(
          live,
          lte(rentTerms.effectiveFrom, on),
          or(isNull(rentTerms.effectiveTo), gte(rentTerms.effectiveTo, on)),
        ),
      )
      .orderBy(desc(rentTerms.effectiveFrom))
      .get() ??
    database.select().from(rentTerms).where(live).orderBy(desc(rentTerms.effectiveFrom)).get();

  if (!current) return null;
  const parts = [current.baseRentChf, current.serviceChargesChf, current.parkingChargesChf];
  return {
    baseRentChf: current.baseRentChf,
    serviceChargesChf: current.serviceChargesChf,
    parkingChargesChf: current.parkingChargesChf,
    totalChf: parts.reduce<number>((sum, part) => sum + (part ?? 0), 0),
    effectiveFrom: current.effectiveFrom,
    effectiveTo: current.effectiveTo,
  };
}

function toSummary(
  row: ReturnType<typeof leaseRowsFor>[number],
  database: MirrorDb,
): LeaseSummary {
  const unit = unitFor(row.id, database);
  const address =
    unit?.streetName && unit.streetNumber
      ? `${unit.streetName} ${unit.streetNumber}`
      : (unit?.streetName ?? null);
  return {
    leaseRef: row.ref,
    role: row.role,
    status: row.status,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    noticeOn: row.noticeOn,
    unitRef: unit?.unitRef ?? null,
    unitLabel: unit?.unitLabel ?? null,
    floorLabel: unit?.floorLabel ?? null,
    rooms: unit?.rooms ?? null,
    surfaceM2: unit?.surfaceM2 ?? null,
    buildingLabel: unit?.buildingLabel ?? null,
    propertyName: unit?.propertyName ?? null,
    address,
    locality: unit?.locality ?? null,
    postalCode: unit?.postalCode ?? null,
    rent: rentFor(row.id, database),
  };
}

/* ------------------------------------------------------------------ *
 * Public API — every function starts from `tenantRef`
 * ------------------------------------------------------------------ */

export function getLeases(tenantRef: string, database: MirrorDb = db): LeaseSummary[] {
  return leaseRowsFor(tenantRef, database)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.ref.localeCompare(b.ref))
    .map((row) => toSummary(row, database));
}

/** "Mon logement": the lease the dashboard is about. */
export function getHome(tenantRef: string, database: MirrorDb = db): LeaseSummary | null {
  return getLeases(tenantRef, database)[0] ?? null;
}

/**
 * A single lease **of this tenant**, by reference. Returns `null` — never someone else's
 * lease — when the reference belongs to another tenant or does not exist. `/bail/<ref>`
 * turns that `null` into a 404.
 */
export function getLease(
  tenantRef: string,
  leaseRef: string,
  database: MirrorDb = db,
): LeaseSummary | null {
  const row = leaseRowsFor(tenantRef, database).find((lease) => lease.ref === leaseRef);
  return row ? toSummary(row, database) : null;
}

/** Lease ids the tenant may read, optionally narrowed to one of their own refs. */
function scopedLeaseIds(tenantRef: string, database: MirrorDb, leaseRef?: string): string[] {
  const rows = leaseRowsFor(tenantRef, database);
  const scoped = leaseRef ? rows.filter((row) => row.ref === leaseRef) : rows;
  return scoped.map((row) => row.id);
}

function liveEntriesOf(ids: string[]) {
  return and(
    inArray(tenantAccountEntries.leaseContractId, ids),
    // tenant_account_entries has no `archived_at` in the ERP.
    isNull(tenantAccountEntries.deletedAt),
  );
}

/**
 * Balance in CHF: Σ debit − Σ credit over every live entry of the tenant's leases,
 * **whatever the entry status** (design.md, B1). `cleared` entries are not excluded —
 * a settled invoice is already netted out by the credit that settled it, and every
 * status-filtered variant misses the oracle on BAIL-000170.
 */
export function getBalance(tenantRef: string, database: MirrorDb = db, leaseRef?: string): number {
  const ids = scopedLeaseIds(tenantRef, database, leaseRef);
  if (ids.length === 0) return 0;
  const rows = database
    .select({
      direction: tenantAccountEntries.direction,
      total: sql<number>`coalesce(sum(${tenantAccountEntries.amountChf}), 0)`,
    })
    .from(tenantAccountEntries)
    .where(liveEntriesOf(ids))
    .groupBy(tenantAccountEntries.direction)
    .all();

  const balance = rows.reduce(
    (sum, row) => sum + (row.direction === "credit" ? -row.total : row.total),
    0,
  );
  // The ERP stores CHF with two decimals; sums of floats need rounding before display.
  return Math.round(balance * 100) / 100;
}

function selectEntries(ids: string[], database: MirrorDb) {
  return database
    .select({
      entryRef: tenantAccountEntries.externalRef,
      leaseRef: leases.externalRef,
      kind: tenantAccountEntries.entryKind,
      direction: tenantAccountEntries.direction,
      status: tenantAccountEntries.status,
      amountChf: tenantAccountEntries.amountChf,
      dueOn: tenantAccountEntries.dueOn,
      settledOn: tenantAccountEntries.settledOn,
      description: tenantAccountEntries.description,
    })
    .from(tenantAccountEntries)
    .innerJoin(leases, eq(leases.id, tenantAccountEntries.leaseContractId))
    .where(liveEntriesOf(ids));
}

function toEntry(row: {
  entryRef: string;
  leaseRef: string;
  kind: string | null;
  direction: "debit" | "credit" | null;
  status: string | null;
  amountChf: number | null;
  dueOn: string | null;
  settledOn: string | null;
  description: string | null;
}): AccountEntry {
  return { ...row, amountChf: row.amountChf ?? 0 };
}

export function getRecentEntries(
  tenantRef: string,
  database: MirrorDb = db,
  limit = 5,
  leaseRef?: string,
): AccountEntry[] {
  const ids = scopedLeaseIds(tenantRef, database, leaseRef);
  if (ids.length === 0) return [];
  return selectEntries(ids, database)
    .orderBy(desc(tenantAccountEntries.dueOn))
    .limit(limit)
    .all()
    .map(toEntry);
}

/** Every entry of one of the tenant's leases, oldest first — the `/bail` detail table. */
export function getEntries(
  tenantRef: string,
  database: MirrorDb = db,
  leaseRef?: string,
): AccountEntry[] {
  const ids = scopedLeaseIds(tenantRef, database, leaseRef);
  if (ids.length === 0) return [];
  return selectEntries(ids, database).orderBy(desc(tenantAccountEntries.dueOn)).all().map(toEntry);
}

export function countOverdue(tenantRef: string, database: MirrorDb = db): number {
  return getEntries(tenantRef, database).filter((entry) => entry.status === "overdue").length;
}

/**
 * What is coming: the next entry falling due and the next maintenance on the tenant's
 * building. Both may legitimately be `null` — the fixture snapshot has no entry due after
 * 2026-06, so "prochaine échéance" is empty for every demo tenant and the page says so.
 */
export function getUpcoming(
  tenantRef: string,
  database: MirrorDb = db,
  on = today(),
): { nextEntry: AccountEntry | null; nextMaintenance: MaintenanceItem | null } {
  const ids = scopedLeaseIds(tenantRef, database);
  if (ids.length === 0) return { nextEntry: null, nextMaintenance: null };

  const nextEntry =
    selectEntries(ids, database)
      .orderBy(asc(tenantAccountEntries.dueOn))
      .all()
      .filter((row) => row.dueOn !== null && row.dueOn >= on)
      .map(toEntry)[0] ?? null;

  const buildingIds = ids
    .map((id) => unitFor(id, database)?.buildingId)
    .filter((id): id is string => Boolean(id));

  const nextMaintenance =
    buildingIds.length === 0
      ? null
      : (database
          .select({
            ref: plannedMaintenance.externalRef,
            category: plannedMaintenance.category,
            status: plannedMaintenance.status,
            plannedFor: plannedMaintenance.plannedFor,
            description: plannedMaintenance.description,
          })
          .from(plannedMaintenance)
          .where(
            and(
              inArray(plannedMaintenance.buildingId, buildingIds),
              // planned_maintenance has no `archived_at` in the ERP.
              isNull(plannedMaintenance.deletedAt),
              gt(plannedMaintenance.plannedFor, on),
              // a job already done is not "à venir", whatever its date
              sql`${plannedMaintenance.status} <> 'completed'`,
            ),
          )
          .orderBy(asc(plannedMaintenance.plannedFor))
          .get() ?? null);

  return { nextEntry, nextMaintenance };
}

/** The tenant's own name, for the greeting. `display_name` covers a company co-tenant
 * ("Atelier Fictif 6035") as well as a person, so no screen assumes a first name. */
export function getTenantName(tenantRef: string, database: MirrorDb = db): string | null {
  const row = database
    .select({ displayName: parties.displayName })
    .from(parties)
    .where(
      and(
        eq(parties.externalRef, tenantRef),
        isNull(parties.archivedAt),
        isNull(parties.deletedAt),
      ),
    )
    .get();
  return row?.displayName ?? null;
}

/** Every rent term of one of the tenant's leases, most recent first — the bail page shows
 * the history, not only what is in force today. */
export function getRentHistory(
  tenantRef: string,
  leaseRef: string,
  database: MirrorDb = db,
): RentTerm[] {
  const [id] = scopedLeaseIds(tenantRef, database, leaseRef);
  if (!id) return [];
  return database
    .select()
    .from(rentTerms)
    .where(and(eq(rentTerms.leaseContractId, id), isNull(rentTerms.deletedAt)))
    .orderBy(desc(rentTerms.effectiveFrom))
    .all()
    .map((term) => ({
      baseRentChf: term.baseRentChf,
      serviceChargesChf: term.serviceChargesChf,
      parkingChargesChf: term.parkingChargesChf,
      totalChf:
        (term.baseRentChf ?? 0) + (term.serviceChargesChf ?? 0) + (term.parkingChargesChf ?? 0),
      effectiveFrom: term.effectiveFrom,
      effectiveTo: term.effectiveTo,
    }));
}

/**
 * Everything the dashboard renders, in one call. The page holds no query of its own, and
 * the isolation test can serialise this object and assert no foreign reference appears.
 */
export function getDashboard(tenantRef: string, database: MirrorDb = db): DashboardView {
  const [lease, ...otherLeases] = getLeases(tenantRef, database);
  const { nextEntry, nextMaintenance } = getUpcoming(tenantRef, database);
  return {
    lease: lease ?? null,
    otherLeases,
    balanceChf: getBalance(tenantRef, database),
    overdueCount: countOverdue(tenantRef, database),
    recentEntries: getRecentEntries(tenantRef, database),
    nextEntry,
    nextMaintenance,
  };
}
