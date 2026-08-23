/**
 * CHECKLIST ITEM 3 — a tenant can only ever read their own data.
 *
 * This test drives the **real route modules**: the actual `(tenant)` layout gate and the
 * actual `/bail/[ref]` page, invoked as the async functions they are, with `next/headers`
 * serving a real session cookie and `notFound()` / `redirect()` raising sentinels we can
 * assert on. It does not boot `next dev` (design.md): the suite runs in about a second,
 * and a dev server inside `npm test` is the first thing to go flaky.
 *
 * Every case is played from both sides — what A cannot see of B, and what B cannot see of
 * A — because a scoping bug that only leaks one way is still a leak.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import type { ReactNode } from "react";

/**
 * Runs before every import in this file — which matters, because the app's database
 * singleton is created at import time from `DATABASE_URL`. Pointing it at a throwaway
 * file is what lets this test drive the real pages without them touching `data/app.db`.
 */
const dbFile = vi.hoisted(() => {
  const file = `${process.env.TMPDIR ?? "/tmp"}/portal-isolation-${process.pid}.db`;
  process.env.DATABASE_URL = file;
  return file;
});

/**
 * The oracle fixture carries the whole pre-joined tenant row; `readBalanceOracle()` only
 * declares the two fields its own callers need, so the rest is named here rather than by
 * widening a phase-0 file this lane does not own.
 */
interface PortalSnapshot {
  tenant_ref: string;
  lease_ref: string;
  unit_ref: string;
  display_name: string;
  email: string;
  street_name: string;
  balance_chf: number;
}

/** The session the "browser" is currently carrying. */
let activeSession: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      activeSession ? { name, value: activeSession } : undefined,
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

class NotFoundError extends Error {}
class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
const { createDb } = await import("../db/client");
const { seedFixtures, readBalanceOracle } = await import("../../scripts/seed-fixtures");
const { seedDemoAccounts, DEMO_PASSWORD } = await import("../../scripts/seed-demo");
const { attemptLogin } = await import("./login");

const BailPage = (await import("../app/(tenant)/bail/[ref]/page")).default;
const DashboardPage = (await import("../app/(tenant)/page")).default;
const TenantLayout = (await import("../app/(tenant)/layout")).default;

const LEA = { email: "lea.martin@example.ch", tenant: "TEN-00005", lease: "BAIL-000005" };
const ADRIEN = { email: "adrien.clerc@example.ch", tenant: "TEN-00170", lease: "BAIL-000170" };
const LUCAS = { email: "lucas.martin@example.ch", tenant: "TEN-06002", lease: "BAIL-000005" };
const MANAGER = { email: "gerance@example.ch" };

beforeAll(() => {
  const { sqlite, db } = createDb(dbFile);
  migrate(db, { migrationsFolder: "drizzle" });
  seedFixtures(db);
  seedDemoAccounts(db);
  sqlite.close();
});

afterAll(() => {
  activeSession = undefined;
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

/** Log in for real, then carry the resulting cookie like a browser would. */
function signIn(email: string): void {
  const outcome = attemptLogin(email, DEMO_PASSWORD, { userAgent: "vitest" });
  if (!outcome.ok) throw new Error(`fixture login failed for ${email}`);
  activeSession = outcome.session.id;
}

/** Everything the page would print, flattened out of the element tree it returned. */
function renderedText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join(" ");
  const element = node as { props?: { children?: ReactNode } };
  return element.props ? renderedText(element.props.children) : "";
}

async function openBail(ref: string): Promise<string> {
  return renderedText(await BailPage({ params: Promise.resolve({ ref }) }));
}

async function expectNotFound(ref: string): Promise<void> {
  await expect(openBail(ref)).rejects.toBeInstanceOf(NotFoundError);
}

describe("a tenant reaches their own lease", () => {
  test("Lea opens BAIL-000005 and sees her own data", async () => {
    signIn(LEA.email);
    const body = await openBail(LEA.lease);
    expect(body).toContain("BAIL-000005");
    expect(body).toContain("Appartement 00005");
  });

  test("the co-tenant of that lease opens the very same page", async () => {
    signIn(LUCAS.email);
    const body = await openBail(LUCAS.lease);
    expect(body).toContain("BAIL-000005");
    expect(body).toContain("co-titulaire");
  });
});

describe("a tenant cannot reach another tenant's lease", () => {
  test("Lea asking for Adrien's lease gets 404, in both directions", async () => {
    signIn(LEA.email);
    await expectNotFound(ADRIEN.lease);

    signIn(ADRIEN.email);
    await expectNotFound(LEA.lease);
  });

  test("the co-tenant is scoped to the lease they are on, not to everything", async () => {
    signIn(LUCAS.email);
    await expectNotFound(ADRIEN.lease);
    await expectNotFound("BAIL-000010");
  });

  test("a lease that does not exist answers exactly like one that belongs to someone else", async () => {
    signIn(LEA.email);
    await expectNotFound("BAIL-999999");
    await expectNotFound("' OR 1=1 --");
  });
});

describe("no foreign data reaches the page body", () => {
  test("Lea's dashboard mentions nothing identifying any other tenant", async () => {
    signIn(LEA.email);
    const body = await renderedText(await DashboardPage());

    expect(body).toContain("Lea Martin");
    expect(body).toContain("BAIL-000005");

    const others = (readBalanceOracle() as unknown as PortalSnapshot[]).filter(
      (t) => t.tenant_ref !== LEA.tenant,
    );
    for (const other of others) {
      for (const secret of [
        other.tenant_ref,
        other.lease_ref,
        other.unit_ref,
        other.display_name,
        other.email,
        other.street_name,
        String(other.balance_chf),
      ]) {
        expect(body, `leaked ${secret}`).not.toContain(secret);
      }
    }
  });

  test("and the same holds for the other tenant's dashboard", async () => {
    signIn(ADRIEN.email);
    const body = await renderedText(await DashboardPage());
    expect(body).toContain("BAIL-000170");
    expect(body).not.toContain("BAIL-000005");
    expect(body).not.toContain("Lea Martin");
  });
});

describe("the gate on every tenant route", () => {
  const children = null;

  test("an anonymous request is redirected to /login", async () => {
    activeSession = undefined;
    await expect(TenantLayout({ children })).rejects.toMatchObject({ to: "/login" });
  });

  test("an expired or unknown session is treated as anonymous", async () => {
    activeSession = "not-a-real-session";
    await expect(TenantLayout({ children })).rejects.toMatchObject({ to: "/login" });
  });

  test("a manager has no tenant dashboard and is sent to the management area", async () => {
    signIn(MANAGER.email);
    await expect(TenantLayout({ children })).rejects.toMatchObject({ to: "/admin" });
  });

  test("a tenant passes the gate", async () => {
    signIn(LEA.email);
    await expect(TenantLayout({ children })).resolves.toBeTruthy();
  });

  /**
   * `(tenant)/tickets/` is lane C's folder and inherits this same gate, so an anonymous
   * request to a ticket URL is refused before any ticket code runs. Isolation *between*
   * tenants' tickets belongs to lane C's own test — its pages read the same seam.
   */
  test("the gate covers lane C's ticket routes too, since they live under it", () => {
    expect(fs.existsSync("src/app/(tenant)/tickets")).toBe(true);
    expect(fs.existsSync("src/app/(tenant)/layout.tsx")).toBe(true);
  });
});

describe("identity cannot be forged", () => {
  test("the URL decides which lease is asked for, never which tenant is asking", async () => {
    signIn(LEA.email);
    // Adrien's own reference, requested by Lea's session: refused, not served.
    await expectNotFound(ADRIEN.lease);
    // The same reference is fine once the session really is Adrien's.
    signIn(ADRIEN.email);
    expect(await openBail(ADRIEN.lease)).toContain("BAIL-000170");
  });
});
