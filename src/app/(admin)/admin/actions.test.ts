/**
 * The management server actions (specs/management-screens).
 *
 * Two things a page test could not show:
 *  - a status change or a manager reply is visible on the *tenant's* own detail read,
 *    which is the round trip the demo is built on;
 *  - the actions refuse a non-manager caller by themselves. The `(admin)` layout gates
 *    pages, but a server action is a POST endpoint: it can be called without any layout
 *    ever rendering.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { CurrentTenant } from "../../../contracts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-admin-"));
process.env.DATABASE_URL = path.join(dir, "admin.db");

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const session = vi.hoisted(() => ({ isManager: true }));
vi.mock("../../../tickets/guard", () => ({
  sessionIsManager: async () => session.isManager,
}));

const { db } = await import("../../../db/client");
const { syncRuns } = await import("../../../db/schema");
const { createTicket, getForTenant } = await import("../../../tickets/service");
const { countMirrorRows } = await import("../../../tickets/management-queries");
const { addManagerCommentAction, runSyncAction, setTicketStatusAction } = await import("./actions");
const { EMPTY_MESSAGE_STATE } = await import("../../../tickets/form-state");

const tenant: CurrentTenant = {
  userId: "u-alice",
  tenantRef: "TEN-00005",
  leaseRef: "BAIL-000005",
  unitRef: "APT-00005",
};

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

function openRequest(title: string) {
  const result = createTicket(tenant, { category: "plomberie", title, body: "Description." });
  if (!result.ok) throw new Error("fixture creation failed");
  return result.ticket;
}

function isNotFound(error: unknown) {
  return String((error as { digest?: string })?.digest ?? "").includes(
    "NEXT_HTTP_ERROR_FALLBACK;404",
  );
}

test("a status change reaches the tenant's own view, with its time", async () => {
  const ticket = openRequest("Fuite sous l'évier");

  const state = await setTicketStatusAction(
    EMPTY_MESSAGE_STATE,
    form({ ticketId: ticket.id, status: "in_progress" }),
  );
  expect(state.error).toBeNull();

  const seen = getForTenant(tenant.tenantRef, ticket.id)!;
  expect(seen.ticket.status).toBe("in_progress");
  expect(seen.timeline).toHaveLength(1);
  expect(seen.timeline[0]!.kind).toBe("status");
  expect(seen.timeline[0]!.body).toBe("Ouverte → En cours");
  expect(seen.timeline[0]!.createdAt).toBe(seen.ticket.updatedAt);
});

test("a manager reply reaches the tenant's timeline", async () => {
  const ticket = openRequest("Radiateur froid");

  const state = await addManagerCommentAction(
    EMPTY_MESSAGE_STATE,
    form({ ticketId: ticket.id, body: "Le chauffagiste passe jeudi." }),
  );
  expect(state.error).toBeNull();

  const seen = getForTenant(tenant.tenantRef, ticket.id)!;
  expect(seen.timeline.map((entry) => [entry.authorKind, entry.body])).toEqual([
    ["manager", "Le chauffagiste passe jeudi."],
  ]);
});

test("an unknown status or request is refused without touching anything", async () => {
  const ticket = openRequest("Serrure bloquée");

  expect(
    (await setTicketStatusAction(EMPTY_MESSAGE_STATE, form({ ticketId: ticket.id, status: "vacances" })))
      .error,
  ).toMatch(/Statut inconnu/);
  expect(
    (await setTicketStatusAction(EMPTY_MESSAGE_STATE, form({ ticketId: "nope", status: "closed" })))
      .error,
  ).toMatch(/n'existe pas/);
  expect(
    (await addManagerCommentAction(EMPTY_MESSAGE_STATE, form({ ticketId: ticket.id, body: "  " })))
      .error,
  ).toMatch(/Écrivez un message/);

  expect(getForTenant(tenant.tenantRef, ticket.id)!.ticket.status).toBe("open");
});

test("a non-manager caller is refused by the action itself, with a 404", async () => {
  const ticket = openRequest("Demande à ne pas toucher");
  session.isManager = false;
  try {
    for (const call of [
      () => setTicketStatusAction(EMPTY_MESSAGE_STATE, form({ ticketId: ticket.id, status: "closed" })),
      () => addManagerCommentAction(EMPTY_MESSAGE_STATE, form({ ticketId: ticket.id, body: "Coucou" })),
      () => runSyncAction(EMPTY_MESSAGE_STATE),
    ]) {
      const thrown = await call().then(
        () => new Error("the action answered a non-manager"),
        (error: unknown) => error,
      );
      expect(isNotFound(thrown), `expected a 404, got ${thrown}`).toBe(true);
    }
  } finally {
    session.isManager = true;
  }

  const untouched = getForTenant(tenant.tenantRef, ticket.id)!;
  expect(untouched.ticket.status).toBe("open");
  expect(untouched.timeline).toHaveLength(0);
});

/**
 * No `.env.local` in a lane worktree, so the ERP is unreachable and this run fails — which
 * is the point: the button must record the attempt and leave the mirror exactly as it was.
 * The successful path is lane A's, covered by `src/contracts.test.ts` with a fake ERP.
 */
test("the relaunch button always records a run and never duplicates mirror rows", async () => {
  const before = countMirrorRows();
  const runsBefore = db.select().from(syncRuns).all().length;

  const state = await runSyncAction(EMPTY_MESSAGE_STATE);

  const runs = db.select().from(syncRuns).all();
  expect(runs).toHaveLength(runsBefore + 1);
  const run = runs.at(-1)!;
  expect(run.kind).toBe("incremental");
  expect(["ok", "failed"]).toContain(run.status);
  if (run.status === "failed") {
    expect(state.error).toMatch(/La synchronisation a échoué/);
    expect(run.cursorAfter).toBe(run.cursorBefore);
  }
  expect(countMirrorRows()).toEqual(before);
});
