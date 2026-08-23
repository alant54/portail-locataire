/**
 * The tenant server actions, exercised the way a browser calls them: a `FormData`,
 * nothing else. What matters here is what a page cannot show — that the action reads the
 * session for the references, and that a successful creation redirects to the detail.
 *
 * The database is a throwaway file chosen before `db/client` is imported, since that
 * module opens `DATABASE_URL` once at import time.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-actions-"));
process.env.DATABASE_URL = path.join(dir, "actions.db");

// `revalidatePath()` needs a request context this test does not have; the actions call it
// purely to refresh the cache, so a no-op keeps the rest of the behaviour observable.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db } = await import("../../../db/client");
const { tickets } = await import("../../../db/schema");
const { getCurrentTenant } = await import("../../../auth/current-tenant");
const { createTicketAction, addTenantCommentAction } = await import("./actions");
const { EMPTY_CREATE_STATE, EMPTY_MESSAGE_STATE } = await import("../../../tickets/form-state");

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

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
  const session = getCurrentTenant()!;
  expect(session).not.toBeNull();

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
  expect(stored[0]!.tenantRef).toBe(session.tenantRef);
  expect(stored[0]!.leaseRef).toBe(session.leaseRef);
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
