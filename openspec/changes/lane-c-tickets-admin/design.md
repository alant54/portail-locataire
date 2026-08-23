## Context

Tables `tickets`, `ticket_comments`, `login_events`, `sync_runs`, `sync_cursor` are defined in `phase-0-foundation`. `getCurrentTenant()` and `runIncrementalSync()` exist as stubs; this lane codes against their signatures and gets real behaviour at merge.

## Goals / Non-Goals

**Goals:** a real write path with a visible round-trip tenant → manager → tenant; three management screens that answer the evaluators' questions directly.
**Non-Goals:** attachments/media, notifications, assignment to technicians, SLA, search.

## Decisions

- **Ticket service module `src/tickets/service.ts`** with `createTicket(tenant, input)`, `listForTenant(tenantRef)`, `getForTenant(tenantRef, id)`, `addComment(...)`, `listAll(filter)`, `setStatus(...)`. Tenant-facing functions always take the tenant from `getCurrentTenant()`; the forged-reference scenario is enforced here, not in the form.
- **Status model**: `open → in_progress → closed`, transitions recorded as comments of kind `status` so the detail page has one timeline. Alternative: separate `ticket_events` table — not in the frozen schema; comments with a `kind` column is enough.
- **Server actions** for create/comment/status; pages are server components reading via the service. Alternative: API routes — more surface, no benefit for the demo.
- **Sync screen calls `runIncrementalSync()` inline** in a server action and re-renders (PLAN.md C1). Alternative: background job — not needed.
- **Row counts per table** via a single `SELECT count(*)` loop over the registry / schema table list.
- **Manager gating** relies on lane B's `(admin)` layout check; until merged, the stub treats everyone as manager in dev only.

## Risks / Trade-offs

- [Schema lacks a `kind` column on `ticket_comments`] → request it from the human on `main` before starting (schema change goes through Phase 0 owner).
- [Stub `getCurrentTenant()` hides isolation bugs] → service tests use two explicit tenant refs, independent of the stub.
- [Sync button blocks the request for long syncs] → acceptable for the demo; show elapsed time in the run record.
