/**
 * Seed the local database from `fixtures/`, through the same `upsert.ts` the sync uses,
 * so a fixture row and a synced row are byte-identical. Lanes B and C therefore never
 * have to wait on lane A.
 *
 * `tenant-portal-snapshots` is deliberately NOT seeded: it is a pre-joined ERP view kept
 * as the balance oracle for tests, never an application data source.
 */
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { createDb } from "../src/db/client.js";
import { upsertRows, type MirrorDb } from "../src/db/upsert.js";
import * as schema from "../src/db/schema.js";

export const FIXTURES_DIR = "fixtures";

/** Import order: patrimoine, then parties and leases, then the rows hanging off them. */
const SEED_ORDER: [string, SQLiteTable][] = [
  ["management-companies", schema.managementCompanies],
  ["portfolios", schema.portfolios],
  ["properties", schema.properties],
  ["buildings", schema.buildings],
  ["rental-units", schema.rentalUnits],
  ["parties", schema.parties],
  ["leases", schema.leases],
  ["lease-parties", schema.leaseParties],
  ["lease-objects", schema.leaseObjects],
  ["rent-terms", schema.rentTerms],
  ["tenant-account-entries", schema.tenantAccountEntries],
  ["payment-plans", schema.paymentPlans],
  ["meter-points", schema.meterPoints],
  ["meter-readings", schema.meterReadings],
  ["planned-maintenance", schema.plannedMaintenance],
];

export function readFixture<T = Record<string, unknown>>(name: string, dir = FIXTURES_DIR): T[] {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`missing fixture ${file} — run \`npm run pull:fixtures\``);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T[];
}

/** The balance oracle: `tenant-portal-snapshots`, kept out of the database on purpose. */
export function readBalanceOracle(dir = FIXTURES_DIR) {
  return readFixture<{ tenant_ref: string; balance_chf: number }>("tenant-portal-snapshots", dir);
}

/**
 * Fail before writing anything if the schema is not there. Without this the first
 * INSERT throws a Drizzle error carrying the whole statement, and the real cause —
 * `no such table` — ends up buried at the bottom of a 30-line dump.
 */
function assertMigrated(db: MirrorDb): void {
  const [first] = SEED_ORDER;
  const table = getTableConfig(first[1]).name;
  const found = db.get<{ name: string }>(
    sql`select name from sqlite_master where type = 'table' and name = ${table}`,
  );
  if (!found) {
    throw new Error(`database not migrated — run \`npm run db:migrate\` (or \`npm run setup\`)`);
  }
}

export function seedFixtures(db: MirrorDb, dir = FIXTURES_DIR): Record<string, number> {
  assertMigrated(db);
  const written: Record<string, number> = {};
  for (const [name, table] of SEED_ORDER) {
    const rows = readFixture(name, dir);
    written[name] = upsertRows(db, table, rows);
  }
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { sqlite, db } = createDb();
  let written: Record<string, number>;
  try {
    written = seedFixtures(db);
  } catch (error) {
    sqlite.close();
    console.error(`seed:fixtures — ${(error as Error).message}`);
    process.exit(1);
  }
  for (const [name, n] of Object.entries(written)) console.log(`  ${name.padEnd(26)} ${String(n).padStart(6)}`);
  const tenants = readBalanceOracle().map((t) => t.tenant_ref);
  sqlite.close();
  console.log(`seeded ${Object.values(written).reduce((a, b) => a + b, 0)} rows for ${tenants.join(", ")}`);
}
