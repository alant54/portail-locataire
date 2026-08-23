/**
 * The tenant data layer, against the fixture snapshot.
 *
 * The balance assertions are the **oracle test** (lane B task 2.3): the ERP's own
 * `tenant-portal-snapshots.balance_chf` is deliberately not mirrored into the database,
 * so it can be used to check our arithmetic instead of being restated by it.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./test-db";
import { leases, tenantAccountEntries } from "./schema";
import {
  countOverdue,
  getBalance,
  getDashboard,
  getEntries,
  getHome,
  getLease,
  getLeases,
  getRecentEntries,
  getUpcoming,
} from "./tenant-queries";
import { readBalanceOracle } from "../../scripts/seed-fixtures";

let h: TestDb;
beforeAll(async () => {
  h = await createTestDb({ seed: true });
});
afterAll(() => h.close());

const PRIMARY = "TEN-00005";
const OTHER = "TEN-00170";
/** the `co_tenant` on PRIMARY's lease — not an oracle tenant, so no balance to compare */
const CO_TENANT = "TEN-06002";

describe("mon logement", () => {
  test("resolves unit, address and lease of the primary payer", () => {
    const home = getHome(PRIMARY, h.db);
    expect(home).not.toBeNull();
    expect(home!.leaseRef).toBe("BAIL-000005");
    expect(home!.role).toBe("primary_payer");
    expect(home!.status).toBe("active");
    expect(home!.unitRef).toBe("APT-00005");
    expect(home!.unitLabel).toBe("Appartement 00005");
    expect(home!.address).toBe("Route des Vignes 5");
    expect(home!.locality).toBe("Ecublens VD");
    expect(home!.rooms).toBe(4);
  });

  test("a co-tenant sees the lease they share, with their own role", () => {
    const home = getHome(CO_TENANT, h.db);
    expect(home?.leaseRef).toBe("BAIL-000005");
    expect(home?.role).toBe("co_tenant");
    expect(home?.unitRef).toBe("APT-00005");
  });

  test("the current rent comes from rent_terms", () => {
    const rent = getHome(PRIMARY, h.db)!.rent;
    expect(rent).not.toBeNull();
    expect(rent!.baseRentChf).toBeGreaterThan(0);
    expect(rent!.totalChf).toBeCloseTo(
      (rent!.baseRentChf ?? 0) + (rent!.serviceChargesChf ?? 0) + (rent!.parkingChargesChf ?? 0),
      2,
    );
  });

  test("an unknown tenant reference resolves to nothing, not to an error", () => {
    expect(getLeases("TEN-99999", h.db)).toEqual([]);
    expect(getHome("TEN-99999", h.db)).toBeNull();
    expect(getBalance("TEN-99999", h.db)).toBe(0);
    expect(getRecentEntries("TEN-99999", h.db)).toEqual([]);
    expect(getUpcoming("TEN-99999", h.db)).toEqual({ nextEntry: null, nextMaintenance: null });
  });
});

describe("solde", () => {
  /**
   * B1, settled: every live entry counts whatever its status. If someone later "fixes"
   * the rule by filtering on `status`, this test fails on BAIL-000170.
   */
  test.each(readBalanceOracle())(
    "computed balance matches the ERP snapshot for $tenant_ref",
    ({ tenant_ref, balance_chf }) => {
      expect(getBalance(tenant_ref, h.db)).toBe(balance_chf);
    },
  );

  test("the fixture dataset really does mix statuses, so the rule is not vacuous", () => {
    const statuses = new Set(getEntries(PRIMARY, h.db).map((entry) => entry.status));
    expect(statuses.has("cleared")).toBe(true);
    expect(statuses.size).toBeGreaterThan(1);
    expect(countOverdue(OTHER, h.db)).toBeGreaterThan(0);
  });

  test("the five most recent entries are the tenant's own, newest first", () => {
    const entries = getRecentEntries(PRIMARY, h.db);
    expect(entries).toHaveLength(5);
    expect(entries.every((entry) => entry.leaseRef === "BAIL-000005")).toBe(true);
    const dueDates = entries.map((entry) => entry.dueOn ?? "");
    expect([...dueDates].sort().reverse()).toEqual(dueDates);
  });
});

describe("à venir", () => {
  test("the next maintenance on the tenant's building is shown", () => {
    const { nextMaintenance } = getUpcoming(PRIMARY, h.db, "2026-08-23");
    expect(nextMaintenance).not.toBeNull();
    expect(nextMaintenance!.plannedFor! > "2026-08-23").toBe(true);
    expect(nextMaintenance!.status).not.toBe("completed");
  });

  test("no entry falls due after the snapshot ends, and that is a legitimate empty state", () => {
    expect(getUpcoming(PRIMARY, h.db, "2026-08-23").nextEntry).toBeNull();
    // ...and the query does find one when the date is inside the fixture window.
    expect(getUpcoming(PRIMARY, h.db, "2025-01-01").nextEntry).not.toBeNull();
  });
});

describe("rows the ERP or the sync removed", () => {
  test("a soft-deleted entry leaves the balance and the list", async () => {
    const scratch = await createTestDb({ seed: true });
    try {
      const before = getBalance(OTHER, scratch.db);
      const [newest] = getRecentEntries(OTHER, scratch.db, 1);
      scratch.db
        .update(tenantAccountEntries)
        .set({ deletedAt: "2026-08-23T00:00:00.000Z" })
        .where(eq(tenantAccountEntries.externalRef, newest.entryRef))
        .run();

      const after = getBalance(OTHER, scratch.db);
      const sign = newest.direction === "credit" ? 1 : -1;
      expect(after).toBe(Math.round((before + sign * newest.amountChf) * 100) / 100);
      expect(getEntries(OTHER, scratch.db).some((e) => e.entryRef === newest.entryRef)).toBe(false);
    } finally {
      scratch.close();
    }
  });

  test("an archived lease disappears from the tenant's leases", async () => {
    const scratch = await createTestDb({ seed: true });
    try {
      scratch.db
        .update(leases)
        .set({ archivedAt: "2026-08-23T00:00:00.000Z" })
        .where(eq(leases.externalRef, "BAIL-000005"))
        .run();
      expect(getLeases(PRIMARY, scratch.db)).toEqual([]);
      expect(getBalance(PRIMARY, scratch.db)).toBe(0);
    } finally {
      scratch.close();
    }
  });
});

describe("scoping", () => {
  test("a lease reference belonging to another tenant resolves to null", () => {
    expect(getLease(PRIMARY, "BAIL-000005", h.db)).not.toBeNull();
    expect(getLease(PRIMARY, "BAIL-000170", h.db)).toBeNull();
    expect(getLease(OTHER, "BAIL-000005", h.db)).toBeNull();
  });

  test("narrowing by a foreign lease reference yields nothing, not the other tenant's rows", () => {
    expect(getBalance(PRIMARY, h.db, "BAIL-000170")).toBe(0);
    expect(getEntries(PRIMARY, h.db, "BAIL-000170")).toEqual([]);
  });

  test("the dashboard view-model of one tenant mentions no other tenant's references", () => {
    const view = JSON.stringify(getDashboard(PRIMARY, h.db));
    expect(view).toContain("BAIL-000005");
    for (const foreign of ["BAIL-000010", "BAIL-000170", "BAIL-000340", "APT-00170"]) {
      expect(view).not.toContain(foreign);
    }
  });
});
