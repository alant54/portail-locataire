/**
 * The ticket domain — the portal's only write path for tenant requests.
 *
 * Two rules are enforced here rather than in the pages, because a page is easy to
 * forget and a service function is not:
 *  - a ticket is always stamped with the references carried by the session
 *    (`CurrentTenant`), never with anything a form or URL supplied;
 *  - every tenant read is scoped by `tenantRef`, so a foreign ticket id is
 *    indistinguishable from a missing one.
 *
 * Refs (`TEN-…`, `BAIL-…`, `APT-…`), not UUIDs: a ticket survives a full re-sync.
 *
 * Every function takes an optional db handle, exactly like `runIncrementalSync()`.
 * That is what keeps `npm test` off `data/app.db`.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { CurrentTenant } from "../contracts";
import { db as appDb } from "../db/client";
import { tickets, ticketComments } from "../db/schema";
import type { MirrorDb } from "../db/upsert";
import {
  STATUS_LABELS,
  validateTicketInput,
  type CreateTicketInput,
  type TicketStatus,
  type ValidationError,
} from "./labels";

/** Re-exported so server-side callers keep one import; client components use `./labels`. */
export * from "./labels";

export type Ticket = typeof tickets.$inferSelect;
export type TicketComment = typeof ticketComments.$inferSelect;

/** Statuses a tenant may still write a comment on. */
const COMMENTABLE: TicketStatus[] = ["open", "in_progress"];

/**
 * "Newest first", with insertion order as the tiebreak: `created_at` is an ISO
 * string with millisecond resolution, and two requests opened in the same
 * millisecond would otherwise come back in an arbitrary order.
 */
const NEWEST_FIRST = [desc(tickets.createdAt), desc(sql`rowid`)];

/**
 * Creates a request for the session's tenant.
 *
 * `tenant` comes from `getCurrentTenant()`; the input carries only what the tenant
 * typed. A `lease_ref` or `tenant_ref` smuggled into the form body reaches this
 * function as an unread property and cannot end up on the row.
 */
export function createTicket(
  tenant: CurrentTenant,
  input: CreateTicketInput,
  database: MirrorDb = appDb,
): { ok: true; ticket: Ticket } | { ok: false; errors: ValidationError[] } {
  const validated = validateTicketInput(input);
  if (!validated.ok) return validated;

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    tenantRef: tenant.tenantRef,
    leaseRef: tenant.leaseRef,
    unitRef: tenant.unitRef,
    category: validated.value.category,
    title: validated.value.title,
    body: validated.value.body,
    status: "open" as const,
    createdAt: now,
    updatedAt: now,
  };
  database.insert(tickets).values(row).run();
  return { ok: true, ticket: row };
}

/** The tenant's own requests, newest first. */
export function listForTenant(tenantRef: string, database: MirrorDb = appDb): Ticket[] {
  return database
    .select()
    .from(tickets)
    .where(eq(tickets.tenantRef, tenantRef))
    .orderBy(...NEWEST_FIRST)
    .all();
}

/**
 * One request, only if it belongs to this tenant. Another tenant's id returns
 * `null` — the caller renders a 404, so a foreign id leaks nothing, not even
 * whether it exists.
 */
export function getForTenant(
  tenantRef: string,
  id: string,
  database: MirrorDb = appDb,
): { ticket: Ticket; timeline: TicketComment[] } | null {
  const ticket = database
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, id), eq(tickets.tenantRef, tenantRef)))
    .get();
  if (!ticket) return null;
  return { ticket, timeline: listTimeline(ticket.id, database) };
}

/**
 * One request seen from the management side: no tenant scope, because a manager handles
 * every tenant's requests. Only ever called behind the manager gate.
 */
export function getForManager(
  id: string,
  database: MirrorDb = appDb,
): { ticket: Ticket; timeline: TicketComment[] } | null {
  const ticket = database.select().from(tickets).where(eq(tickets.id, id)).get();
  if (!ticket) return null;
  return { ticket, timeline: listTimeline(ticket.id, database) };
}

/** Comments and status changes for one request, oldest first — one timeline. */
export function listTimeline(ticketId: string, database: MirrorDb = appDb): TicketComment[] {
  return database
    .select()
    .from(ticketComments)
    .where(eq(ticketComments.ticketId, ticketId))
    .orderBy(asc(ticketComments.createdAt), asc(ticketComments.id))
    .all();
}

/**
 * Adds a comment. For a tenant author the write is scoped by `tenantRef`, so a
 * tenant cannot comment on someone else's request; a manager passes none.
 * Returns `null` when the request is not visible to that author, when it is
 * closed and the author is the tenant, or when the body is empty.
 */
export function addComment(
  args: {
    ticketId: string;
    authorKind: "tenant" | "manager";
    body: string;
    tenantRef?: string | null;
  },
  database: MirrorDb = appDb,
): TicketComment | null {
  const body = (args.body ?? "").trim();
  if (body.length === 0) return null;

  const ticket = database
    .select()
    .from(tickets)
    .where(
      args.authorKind === "tenant"
        ? and(eq(tickets.id, args.ticketId), eq(tickets.tenantRef, args.tenantRef ?? ""))
        : eq(tickets.id, args.ticketId),
    )
    .get();
  if (!ticket) return null;
  if (args.authorKind === "tenant" && !COMMENTABLE.includes(ticket.status)) return null;

  return writeTimelineEntry(database, {
    ticketId: ticket.id,
    authorKind: args.authorKind,
    kind: "comment",
    body,
  });
}

/** The management inbox: every tenant's requests, newest first, optionally filtered. */
export function listAll(
  filter: { status?: TicketStatus } = {},
  database: MirrorDb = appDb,
): Ticket[] {
  const base = database.select().from(tickets);
  const scoped = filter.status ? base.where(eq(tickets.status, filter.status)) : base;
  return scoped.orderBy(...NEWEST_FIRST).all();
}

/**
 * Moves a request to another status and records the move as a timeline entry of
 * kind `status`, so the tenant's detail page shows the change and its time without
 * a second table. A no-op transition writes nothing.
 */
export function setStatus(
  ticketId: string,
  status: TicketStatus,
  database: MirrorDb = appDb,
): Ticket | null {
  const ticket = database.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) return null;
  if (ticket.status === status) return ticket;

  const now = new Date().toISOString();
  database.update(tickets).set({ status, updatedAt: now }).where(eq(tickets.id, ticketId)).run();
  writeTimelineEntry(database, {
    ticketId,
    authorKind: "manager",
    kind: "status",
    body: `${STATUS_LABELS[ticket.status]} → ${STATUS_LABELS[status]}`,
    createdAt: now,
  });
  return { ...ticket, status, updatedAt: now };
}

function writeTimelineEntry(
  database: MirrorDb,
  entry: {
    ticketId: string;
    authorKind: "tenant" | "manager";
    kind: "comment" | "status";
    body: string;
    createdAt?: string;
  },
): TicketComment {
  const row = {
    id: crypto.randomUUID(),
    ticketId: entry.ticketId,
    authorKind: entry.authorKind,
    kind: entry.kind,
    body: entry.body,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
  database.insert(ticketComments).values(row).run();
  return row;
}
