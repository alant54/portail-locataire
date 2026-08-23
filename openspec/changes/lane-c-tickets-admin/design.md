## Context

Tables `tickets`, `ticket_comments`, `login_events`, `sync_runs`, `sync_cursor` are defined in `phase-0-foundation` and verified present before this lane starts — including `ticket_comments.kind` (`comment|status`) and `.author_kind`, which the timeline below depends on. `getCurrentTenant()` and `runIncrementalSync()` exist as seams; lane A has landed, so `runIncrementalSync()` and `listRecentSyncRuns()` are already real in this worktree, while `getCurrentTenant()` is still the fixture stub and gets real behaviour at merge with lane B.

## Goals / Non-Goals

**Goals:** a real write path with a visible round-trip tenant → manager → tenant; three management screens that answer the evaluators' questions directly.
**Non-Goals:** attachments/media, notifications, assignment to technicians, SLA, search.

## Decisions

- **Ticket service module `src/tickets/service.ts`** with `createTicket(tenant, input)`, `listForTenant(tenantRef)`, `getForTenant(tenantRef, id)`, `addComment(...)`, `listAll(filter)`, `setStatus(...)`. Tenant-facing functions always take the tenant from `getCurrentTenant()`; the forged-reference scenario is enforced here, not in the form.
- **Every service function takes an optional db handle** (`database: MirrorDb = db`), exactly like `runIncrementalSync(database = db)`. That is the only way vitest stays off `data/app.db`; the widened-seam precedent is lane A's.
- **Status model**: `open → in_progress → closed`, transitions recorded as comments of kind `status` so the detail page has one timeline. Alternative: separate `ticket_events` table — not in the frozen schema; the `kind` column is enough.
- **Server actions** for create/comment/status; pages are server components reading via the service. Alternative: API routes — more surface, no benefit for the demo.
- **Sync screen calls `runIncrementalSync()` inline** in a server action and re-renders (PLAN.md C1). Alternative: background job — not needed.
- **Row counts per table** via a single `SELECT count(*)` loop over the registry / schema table list, excluding `deleted_at IS NOT NULL`. The helper must not assume `archived_at` exists: 8 of the 15 mirror tables have no such column.
- **Manager gating is lane C's, in `src/app/(admin)/layout.tsx`** — one gate for the whole route group, `notFound()` (404) rather than a redirect, so the area's existence is not disclosed. Supersedes an earlier note in this design that put the check on lane B: lane B gates `(tenant)` only, and `phase-0-hardening` assigned `(admin)/layout.tsx` to this lane.
- **The gate needs a third frozen seam: `getCurrentUser(): SessionUser | null`** (`src/auth/current-user.ts`, shape in `src/contracts.ts`). `CurrentTenant` deliberately carries no role, and a manager row has `tenant_ref = NULL`, so no combination of `getCurrentTenant()` can answer "is this a manager". Alternatives rejected: lane C reading `sessions`/`users` itself (duplicates lane B's cookie/session format and guarantees rework at merge), or lane C adding the resolver inside `src/auth/` on its own branch (breaks single-owner-per-file and conflicts with lane B). Landed on `main` with a stub answering `manager`, plus `PORTAL_STUB_ROLE=tenant|anonymous` for manual checks before lane B exists; `src/contracts.test.ts` covers all three answers.
- **The nav renders "Gérance" only for a manager.** A 404 that hides the management area is pointless while the shared header links to it. The root layout is frozen, so the conditional landed on `main` with the seam rather than being edited from this lane.

## Risks / Trade-offs

- [Stub `getCurrentTenant()` hides isolation bugs] → service tests use two explicit tenant refs and their own db handle, independent of the stub.
- [Stub `getCurrentUser()` answers `manager` in dev] → the 404 paths are proven by tests that mock the seam, not by clicking; `PORTAL_STUB_ROLE` makes them clickable too.
- ["Relancer la synchro" cannot succeed in this worktree] → only `/home/vscode/wt-a` has `.env.local`, so locally the button exercises the *failure* path (`sync_runs.status = 'failed'` + error). The screen must render a failed run as a normal outcome; the happy path is verified after merge on a tree with ERP keys.
- [`login_events` is empty until lane B seeds accounts and logs in] → the logins screen is built and tested against rows the tests insert; its "empty" state is a first-class rendering, not an afterthought.
- [Sync button blocks the request for long syncs] → acceptable for the demo; the run record carries start and finish time.
