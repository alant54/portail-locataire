/**
 * The isolation rules of the ticket domain (specs/tenant-requests).
 *
 * Two explicit tenants, never the `getCurrentTenant()` stub: the stub always returns
 * the same fixture tenant, so a test written against it would pass even if the
 * service ignored `tenantRef` entirely.
 */
import { afterEach, beforeEach, expect, test } from "vitest";
import type { CurrentTenant } from "../contracts";
import { createTestDb, type TestDb } from "../db/test-db";
import { ticketComments, tickets } from "../db/schema";
import {
  addComment,
  createTicket,
  getForTenant,
  listAll,
  listForTenant,
  setStatus,
  validateTicketInput,
} from "./service";

const alice: CurrentTenant = {
  userId: "u-alice",
  tenantRef: "TEN-00005",
  leaseRef: "BAIL-000005",
  unitRef: "APT-00005",
};
const bob: CurrentTenant = {
  userId: "u-bob",
  tenantRef: "TEN-00170",
  leaseRef: "BAIL-000170",
  unitRef: "APT-00170",
};

const input = { category: "plomberie", title: "Fuite sous l'évier", body: "Ça goutte depuis lundi." };

let h: TestDb;
beforeEach(async () => {
  h = await createTestDb();
});
afterEach(() => h.close());

/** Every test creates through the service, so the stamping rule is always exercised. */
function open(tenant: CurrentTenant, overrides: Partial<typeof input> = {}) {
  const result = createTicket(tenant, { ...input, ...overrides }, h.db);
  if (!result.ok) throw new Error(`unexpected validation failure: ${JSON.stringify(result.errors)}`);
  return result.ticket;
}

test("a new request is stored open, with the session's references", () => {
  const ticket = open(alice);

  expect(ticket.status).toBe("open");
  expect(ticket.tenantRef).toBe("TEN-00005");
  expect(ticket.leaseRef).toBe("BAIL-000005");
  expect(ticket.unitRef).toBe("APT-00005");

  const stored = h.db.select().from(tickets).all();
  expect(stored).toHaveLength(1);
  expect(stored[0]!.title).toBe("Fuite sous l'évier");
});

test("a forged reference in the form body is ignored", () => {
  // What a hand-crafted POST would carry: another tenant's references, plus a
  // status the form never offers.
  const forged = {
    ...input,
    tenant_ref: bob.tenantRef,
    lease_ref: bob.leaseRef,
    unit_ref: bob.unitRef,
    status: "closed",
  } as never;

  const result = createTicket(alice, forged, h.db);
  expect(result.ok).toBe(true);

  const stored = h.db.select().from(tickets).all()[0]!;
  expect(stored.tenantRef).toBe(alice.tenantRef);
  expect(stored.leaseRef).toBe(alice.leaseRef);
  expect(stored.unitRef).toBe(alice.unitRef);
  expect(stored.status).toBe("open");
});

test("validation rejects an empty title and an unknown category", () => {
  const result = createTicket(alice, { category: "piscine", title: "   ", body: "x" }, h.db);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a validation failure");
  expect(result.errors.map((e) => e.field).sort()).toEqual(["category", "title"]);
  expect(h.db.select().from(tickets).all()).toHaveLength(0);
});

test("validateTicketInput trims what it accepts", () => {
  const result = validateTicketInput({ category: " autre ", title: " Titre ", body: " Corps " });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected valid input");
  expect(result.value).toEqual({ category: "autre", title: "Titre", body: "Corps" });
});

test("a tenant lists only their own requests, newest first", () => {
  const first = open(alice, { title: "Première" });
  const second = open(alice, { title: "Deuxième" });
  open(bob, { title: "Chez Bob" });

  const mine = listForTenant(alice.tenantRef, h.db);
  expect(mine.map((t) => t.id)).toEqual([second.id, first.id]);
  expect(mine.some((t) => t.title === "Chez Bob")).toBe(false);
});

test("another tenant's request is indistinguishable from a missing one", () => {
  const hers = open(bob);

  expect(getForTenant(alice.tenantRef, hers.id, h.db)).toBeNull();
  expect(getForTenant(alice.tenantRef, "does-not-exist", h.db)).toBeNull();
  expect(getForTenant(bob.tenantRef, hers.id, h.db)?.ticket.id).toBe(hers.id);
});

test("a tenant comment lands on the timeline, a foreign one does not", () => {
  const ticket = open(alice);

  const mine = addComment(
    { ticketId: ticket.id, authorKind: "tenant", body: "Toujours rien.", tenantRef: alice.tenantRef },
    h.db,
  );
  expect(mine?.authorKind).toBe("tenant");
  expect(mine?.kind).toBe("comment");

  const forged = addComment(
    { ticketId: ticket.id, authorKind: "tenant", body: "Coucou", tenantRef: bob.tenantRef },
    h.db,
  );
  expect(forged).toBeNull();

  const empty = addComment(
    { ticketId: ticket.id, authorKind: "tenant", body: "   ", tenantRef: alice.tenantRef },
    h.db,
  );
  expect(empty).toBeNull();

  expect(getForTenant(alice.tenantRef, ticket.id, h.db)!.timeline).toHaveLength(1);
});

test("a status change is recorded as a timeline entry the tenant can see", () => {
  const ticket = open(alice);

  const moved = setStatus(ticket.id, "in_progress", h.db);
  expect(moved?.status).toBe("in_progress");

  const seen = getForTenant(alice.tenantRef, ticket.id, h.db)!;
  expect(seen.ticket.status).toBe("in_progress");
  expect(seen.timeline).toHaveLength(1);
  expect(seen.timeline[0]!.kind).toBe("status");
  expect(seen.timeline[0]!.authorKind).toBe("manager");
  expect(seen.timeline[0]!.body).toBe("Ouverte → En cours");
  expect(seen.timeline[0]!.createdAt).toBe(seen.ticket.updatedAt);
});

test("a no-op status change writes nothing", () => {
  const ticket = open(alice);
  expect(setStatus(ticket.id, "open", h.db)?.status).toBe("open");
  expect(h.db.select().from(ticketComments).all()).toHaveLength(0);
  expect(setStatus("does-not-exist", "closed", h.db)).toBeNull();
});

test("a closed request stops accepting tenant comments, management keeps the floor", () => {
  const ticket = open(alice);
  setStatus(ticket.id, "closed", h.db);

  expect(
    addComment(
      { ticketId: ticket.id, authorKind: "tenant", body: "Encore un mot", tenantRef: alice.tenantRef },
      h.db,
    ),
  ).toBeNull();
  expect(
    addComment({ ticketId: ticket.id, authorKind: "manager", body: "Dossier clos." }, h.db),
  ).not.toBeNull();
});

test("the inbox spans tenants and filters by status", () => {
  const hers = open(bob);
  open(alice);
  setStatus(hers.id, "in_progress", h.db);

  expect(listAll({}, h.db)).toHaveLength(2);
  expect(listAll({ status: "in_progress" }, h.db).map((t) => t.id)).toEqual([hers.id]);
  expect(listAll({ status: "closed" }, h.db)).toHaveLength(0);
});
