/**
 * The demo accounts. Run by `npm run setup`, after `seed:fixtures`.
 *
 * Four accounts, chosen so the evaluator can check every claim on the checklist:
 *  - two `primary_payer` tenants on different leases → isolation is visible by logging
 *    in twice, not only by reading a test;
 *  - the `co_tenant` of the first tenant's lease → proves "my lease" is resolved through
 *    `lease_parties` and not through `leases.primary_rental_unit_id`;
 *  - one manager → the (admin) area (lane C), and a tenant session that must 404 there.
 *
 * Idempotent: re-running updates the existing rows by email, so `npm run setup` twice
 * does not fail and does not multiply accounts. Sessions of a re-seeded user are dropped,
 * because the password may have changed under them.
 */
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { createDb } from "../src/db/client";
import { sessions, users } from "../src/db/schema";
import type { MirrorDb } from "../src/db/upsert";
import { hashPassword } from "../src/auth/password";

/** Fictive data, local database, throwaway credentials — documented in the README. */
export const DEMO_PASSWORD = "portail2026";

export interface DemoAccount {
  email: string;
  role: "tenant" | "manager";
  tenantRef: string | null;
  displayName: string;
  note: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "lea.martin@example.ch",
    role: "tenant",
    tenantRef: "TEN-00005",
    displayName: "Lea Martin",
    note: "locataire principale — bail BAIL-000005, Ecublens VD",
  },
  {
    email: "adrien.clerc@example.ch",
    role: "tenant",
    tenantRef: "TEN-00170",
    displayName: "Adrien Clerc",
    note: "locataire principal — bail BAIL-000170, l'autre côté du test d'isolation",
  },
  {
    email: "lucas.martin@example.ch",
    role: "tenant",
    tenantRef: "TEN-06002",
    displayName: "Lucas Martin",
    note: "co-titulaire du bail BAIL-000005 — voit le même bail que Lea, et rien d'autre",
  },
  {
    email: "gerance@example.ch",
    role: "manager",
    tenantRef: null,
    displayName: "Gérance fictive",
    note: "gérance — accès aux écrans de gestion",
  },
];

export function seedDemoAccounts(database: MirrorDb, password = DEMO_PASSWORD): DemoAccount[] {
  for (const account of DEMO_ACCOUNTS) {
    const existing = database.select().from(users).where(eq(users.email, account.email)).get();
    const id = existing?.id ?? randomBytes(12).toString("hex");

    if (existing) {
      database.delete(sessions).where(eq(sessions.userId, existing.id)).run();
      database
        .update(users)
        .set({
          passwordHash: hashPassword(password),
          role: account.role,
          tenantRef: account.tenantRef,
          displayName: account.displayName,
        })
        .where(eq(users.id, existing.id))
        .run();
    } else {
      database
        .insert(users)
        .values({
          id,
          email: account.email,
          passwordHash: hashPassword(password),
          role: account.role,
          tenantRef: account.tenantRef,
          displayName: account.displayName,
        })
        .run();
    }
  }
  return DEMO_ACCOUNTS;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { sqlite, db } = createDb();
  try {
    seedDemoAccounts(db);
  } catch (error) {
    sqlite.close();
    console.error(`seed:demo — ${(error as Error).message}`);
    process.exit(1);
  }
  sqlite.close();
  console.log(`  seed:demo — ${DEMO_ACCOUNTS.length} comptes (mot de passe: ${DEMO_PASSWORD})`);
  for (const account of DEMO_ACCOUNTS) {
    console.log(`    ${account.email.padEnd(28)} ${(account.tenantRef ?? account.role).padEnd(10)} ${account.note}`);
  }
}
