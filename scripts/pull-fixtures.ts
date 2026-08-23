/**
 * One-off: pull a coherent slice of the ERP for 3–5 tenants into `fixtures/`.
 *
 * Chooses tenants that make the dashboard worth looking at — active lease, non-zero
 * balance, upcoming maintenance on their building — then walks their whole graph.
 * Uses the ERP's server-side filters so it never pages the 161k-row entries collection.
 */
import fs from "node:fs";
import { fetchAll } from "./erp-fetch";
import type {
  ErpBuilding, ErpLease, ErpLeaseObject, ErpLeaseParty, ErpManagementCompany,
  ErpMeterPoint, ErpMeterReading, ErpParty, ErpPaymentPlan, ErpPlannedMaintenance,
  ErpPortfolio, ErpProperty, ErpRentTerm, ErpRentalUnit, ErpTenantAccountEntry,
  ErpTenantPortalSnapshot,
} from "../src/erp/types";

const TENANT_TARGET = 4;
const TODAY = new Date().toISOString().slice(0, 10);

const log = (label: string, n: number) => console.log(`  ${label.padEnd(26)} ${String(n).padStart(6)}`);

async function main() {
  console.log("Sizing collections…");
  const sizes: Record<string, number> = {};

  const snapshots = await fetchAll<ErpTenantPortalSnapshot>("tenant-portal-snapshots");
  const maintenance = await fetchAll<ErpPlannedMaintenance>("planned-maintenance");
  const units = await fetchAll<ErpRentalUnit>("rental-units");
  const buildings = await fetchAll<ErpBuilding>("buildings");
  const properties = await fetchAll<ErpProperty>("properties");
  const portfolios = await fetchAll<ErpPortfolio>("portfolios");
  const companies = await fetchAll<ErpManagementCompany>("management-companies");
  const parties = await fetchAll<ErpParty>("parties");
  const leases = await fetchAll<ErpLease>("leases");
  const leaseObjects = await fetchAll<ErpLeaseObject>("lease-objects");
  const rentTerms = await fetchAll<ErpRentTerm>("rent-terms");
  const paymentPlans = await fetchAll<ErpPaymentPlan>("payment-plans");
  const meterPoints = await fetchAll<ErpMeterPoint>("meter-points");

  for (const [k, v] of Object.entries({
    "tenant-portal-snapshots": snapshots.length, "planned-maintenance": maintenance.length,
    "rental-units": units.length, buildings: buildings.length, properties: properties.length,
    portfolios: portfolios.length, "management-companies": companies.length, parties: parties.length,
    leases: leases.length, "lease-objects": leaseObjects.length, "rent-terms": rentTerms.length,
    "payment-plans": paymentPlans.length, "meter-points": meterPoints.length,
  })) sizes[k] = v;

  const unitByRef = new Map(units.map((u) => [u.external_ref, u]));
  const buildingById = new Map(buildings.map((b) => [b.id, b]));
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const portfolioById = new Map(portfolios.map((p) => [p.id, p]));
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const partyByRef = new Map(parties.map((p) => [p.external_ref, p]));
  const leaseByRef = new Map(leases.map((l) => [l.external_ref, l]));

  const upcomingByBuilding = new Set(
    maintenance.filter((m) => m.planned_for >= TODAY && m.status !== "completed").map((m) => m.building_id),
  );

  // Tenants worth demoing: active lease, upcoming maintenance on their building, and
  // balances spread across the range the ERP actually offers (7 distinct values, all
  // positive — no tenant in this dataset is in credit, which is worth saying in the report).
  const candidates = snapshots
    .filter((s) => s.lease_status === "active" && s.balance_chf !== 0)
    .filter((s) => {
      const unit = unitByRef.get(s.unit_ref);
      return unit ? upcomingByBuilding.has(unit.building_id) : false;
    });

  const byBalance = new Map<number, ErpTenantPortalSnapshot[]>();
  for (const s of candidates) {
    const bucket = byBalance.get(s.balance_chf) ?? [];
    bucket.push(s);
    byBalance.set(s.balance_chf, bucket);
  }

  // Spread over the range: highest, lowest, then inwards.
  const balances = [...byBalance.keys()].sort((a, b) => b - a);
  const spread: number[] = [];
  for (let lo = 0, hi = balances.length - 1; lo <= hi && spread.length < TENANT_TARGET; lo++, hi--) {
    spread.push(balances[lo]);
    if (spread.length < TENANT_TARGET && hi !== lo) spread.push(balances[hi]);
  }

  // Within a bucket, prefer a lease that has a co-tenant or a guarantor: the
  // dashboard and the ticket refs are more interesting when the lease is shared.
  const chosen: ErpTenantPortalSnapshot[] = [];
  for (const balance of spread) {
    const bucket = byBalance.get(balance) ?? [];
    let pick = bucket[0];
    for (const candidate of bucket.slice(0, 4)) {
      const lease = leaseByRef.get(candidate.lease_ref);
      if (!lease) continue;
      const roles = await fetchAll<ErpLeaseParty>("lease-parties", { lease_contract_id: lease.id });
      if (roles.length > 1) { pick = candidate; break; }
    }
    if (pick) chosen.push(pick);
  }

  const leaseIds = new Set<string>();
  const unitIds = new Set<string>();
  const partyIds = new Set<string>();
  for (const s of chosen) {
    const lease = leaseByRef.get(s.lease_ref);
    const unit = unitByRef.get(s.unit_ref);
    const party = partyByRef.get(s.tenant_ref);
    if (!lease || !unit || !party) throw new Error(`incomplete graph for ${s.tenant_ref}`);
    leaseIds.add(lease.id);
    unitIds.add(unit.id);
    partyIds.add(party.id);
  }

  // Everyone on those leases (co-tenants, guarantors), and every object they cover.
  const leaseParties: ErpLeaseParty[] = [];
  for (const id of leaseIds) leaseParties.push(...(await fetchAll<ErpLeaseParty>("lease-parties", { lease_contract_id: id })));
  for (const lp of leaseParties) partyIds.add(lp.party_id);

  const objects = leaseObjects.filter((o) => leaseIds.has(o.lease_contract_id));
  for (const o of objects) unitIds.add(o.rental_unit_id);

  const keptUnits = units.filter((u) => unitIds.has(u.id));
  const buildingIds = new Set(keptUnits.map((u) => u.building_id));
  const keptBuildings = buildings.filter((b) => buildingIds.has(b.id));
  const propertyIds = new Set(keptBuildings.map((b) => b.property_id));
  const keptProperties = properties.filter((p) => propertyIds.has(p.id));
  const portfolioIds = new Set(keptProperties.map((p) => p.portfolio_id));
  const keptPortfolios = portfolios.filter((p) => portfolioIds.has(p.id));
  const companyIds = new Set(keptPortfolios.map((p) => p.management_company_id));

  const entries: ErpTenantAccountEntry[] = [];
  for (const id of leaseIds) entries.push(...(await fetchAll<ErpTenantAccountEntry>("tenant-account-entries", { lease_contract_id: id })));

  const keptMeterPoints = meterPoints.filter((m) => unitIds.has(m.rental_unit_id));
  const readings: ErpMeterReading[] = [];
  for (const mp of keptMeterPoints) readings.push(...(await fetchAll<ErpMeterReading>("meter-readings", { meter_point_id: mp.id })));

  const bundle: Record<string, unknown[]> = {
    "management-companies": companies.filter((c) => companyIds.has(c.id)),
    portfolios: keptPortfolios,
    properties: keptProperties,
    buildings: keptBuildings,
    "rental-units": keptUnits,
    parties: parties.filter((p) => partyIds.has(p.id)),
    leases: leases.filter((l) => leaseIds.has(l.id)),
    "lease-parties": leaseParties,
    "lease-objects": objects,
    "rent-terms": rentTerms.filter((r) => leaseIds.has(r.lease_contract_id)),
    "tenant-account-entries": entries,
    "payment-plans": paymentPlans.filter((p) => leaseIds.has(p.lease_contract_id)),
    "meter-points": keptMeterPoints,
    "meter-readings": readings,
    "planned-maintenance": maintenance.filter((m) => buildingIds.has(m.building_id)),
    "tenant-portal-snapshots": snapshots.filter((s) => chosen.some((c) => c.tenant_ref === s.tenant_ref)),
  };

  fs.mkdirSync("fixtures", { recursive: true });
  console.log("Fixture rows:");
  for (const [name, rows] of Object.entries(bundle)) {
    fs.writeFileSync(`fixtures/${name}.json`, JSON.stringify(rows, null, 1));
    log(name, rows.length);
  }
  fs.writeFileSync(
    "fixtures/meta.json",
    JSON.stringify(
      {
        pulled_at: new Date().toISOString(),
        tenants: chosen.map((c) => ({ tenant_ref: c.tenant_ref, lease_ref: c.lease_ref, unit_ref: c.unit_ref, balance_chf: c.balance_chf })),
        collection_sizes: sizes,
      },
      null,
      1,
    ),
  );
  console.log("\nWrote fixtures/meta.json");
}

await main();
