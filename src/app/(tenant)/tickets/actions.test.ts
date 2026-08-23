/**
 * The tenant server actions, driven the way a browser drives them: a real session cookie
 * and a `FormData`, nothing else. Same shape as lane B's `src/auth/isolation.test.ts` —
 * real modules, a throwaway database, `next/headers` serving the session.
 *
 * What matters here is what a page cannot show: the action reads the tenant from the
 * session on every call, so nothing a hand-rolled POST puts in the body can reach the row,
 * and a successful creation redirects to that request's detail.
 */
import fs from "node:fs";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/** Runs before every import: the database singleton is built at import time. */
const dbFile = vi.hoisted(() => {
  const file = `${process.env.TMPDIR ?? "/tmp"}/portal-tenant-actions-${process.pid}.db`;
  process.env.DATABASE_URL = file;
  return file;
});

/** The session the "browser" is carrying. */
let activeSession: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (activeSession ? { name, value: activeSession } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

// `revalidatePath()` needs a request context this test does not have; the actions call it
// only to refresh the cache, so a no-op keeps the rest of the behaviour observable.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db } = await import("../../../db/client");
const { tickets, users } = await import("../../../db/schema");
const { createSession } = await import("../../../auth/session");
const { getCurrentTenant } = await import("../../../auth/current-tenant");
const { createTicketAction, addTenantCommentAction } = await import("./actions");
const { EMPTY_CREATE_STATE, EMPTY_MESSAGE_STATE } = await import("../../../tickets/form-state");

const ALICE = { id: "u-alice", email: "lea@example.ch", tenantRef: "TEN-00005" };

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
  db.insert(users)
    .values({
      id: ALICE.id,
      email: ALICE.email,
      passwordHash: "x",
      role: "tenant",
      tenantRef: ALICE.tenantRef,
    })
    .run();
  activeSession = createSession(ALICE.id, db).id;
});
afterAll(() => fs.rmSync(dbFile, { force: true }));

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** `redirect()` reports itself by throwing; this is how a caller reads the target. */
function redirectTarget(error: unknown): string | null {
  const digest = (error as { digest?: string })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")
    ? (digest.split(";")[2] ?? null)
    : null;
}

test("creating a request stores the session's references and redirects to the detail", async () => {
  const session = await getCurrentTenant();
  expect(session?.tenantRef).toBe(ALICE.tenantRef);

  const submitted = form({
    category: "chauffage",
    title: "Radiateur froid",
    body: "Le salon ne chauffe plus.",
    // What a hand-rolled POST would add; the action must not read any of it.
    tenant_ref: "TEN-99999",
    lease_ref: "BAIL-999999",
  });

  const thrown = await createTicketAction(EMPTY_CREATE_STATE, submitted).catch((error) => error);
  const target = redirectTarget(thrown);
  expect(target, "the action should redirect to the new request").not.toBeNull();

  const stored = db.select().from(tickets).all();
  expect(stored).toHaveLength(1);
  expect(stored[0]!.tenantRef).toBe(ALICE.tenantRef);
  expect(stored[0]!.status).toBe("open");
  expect(target).toBe(`/tickets/${stored[0]!.id}`);
});

test("an invalid submission comes back with messages and writes nothing", async () => {
  const before = db.select().from(tickets).all().length;

  const state = await createTicketAction(
    EMPTY_CREATE_STATE,
    form({ category: "", title: "", body: "" }),
  );

  expect(state.errors.map((e) => e.field).sort()).toEqual(["body", "category", "title"]);
  expect(state.values.title).toBe("");
  expect(db.select().from(tickets).all()).toHaveLength(before);
});

test("a comment on someone else's request is refused", async () => {
  const mine = db.select().from(tickets).all()[0]!;

  const ok = await addTenantCommentAction(
    EMPTY_MESSAGE_STATE,
    form({ ticketId: mine.id, body: "Merci." }),
  );
  expect(ok.error).toBeNull();

  const foreign = await addTenantCommentAction(
    EMPTY_MESSAGE_STATE,
    form({ ticketId: "00000000-0000-0000-0000-000000000000", body: "Coucou." }),
  );
  expect(foreign.error).toMatch(/clôturée ou n'existe pas/);

  const blank = await addTenantCommentAction(
    EMPTY_MESSAGE_STATE,
    form({ ticketId: mine.id, body: "   " }),
  );
  expect(blank.error).toMatch(/Écrivez un message/);
});

test("without a session the action writes nothing and says so", async () => {
  const signedIn = activeSession;
  activeSession = undefined;
  try {
    const before = db.select().from(tickets).all().length;
    const state = await createTicketAction(
      EMPTY_CREATE_STATE,
      form({ category: "plomberie", title: "Fuite", body: "Sous l'évier." }),
    );
    expect(state.errors[0]!.message).toMatch(/session a expiré/);
    expect(db.select().from(tickets).all()).toHaveLength(before);
  } finally {
    activeSession = signedIn;
  }
});
