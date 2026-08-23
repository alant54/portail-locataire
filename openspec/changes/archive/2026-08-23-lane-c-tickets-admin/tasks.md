## 1. Ticket domain

- [x] 1.0 Land the role seam on `main` (shared files are never edited from a lane worktree): `SessionUser` in `src/contracts.ts`, `getCurrentUser()` stub in `src/auth/current-user.ts`, coverage in `src/contracts.test.ts`, and the manager-only "Gérance" link in the frozen `src/app/layout.tsx`; then merge `main` into `lane-c`; verify `npm test` and `npm run typecheck` pass on both `main` and the worktree
- [x] 1.1 Confirm the portal tables on `main` — `ticket_comments.kind` (comment|status) and `.author_kind` are present as of phase 0, as are `login_events.email`/`.outcome` and `sync_runs.cursor_before`/`.cursor_after`; verify `npm run db:migrate` applies cleanly and no schema tweak is needed
- [x] 1.2 Implement `src/tickets/service.ts` (`createTicket`, `listForTenant`, `getForTenant`, `addComment`, `listAll`, `setStatus`); verify vitest covers create, forged reference ignored, foreign ticket returns null, status transition recorded as timeline entry

## 2. Tenant pages

- [x] 2.1 Build `/tickets` (Mes demandes list) and `/tickets/new` (form + server action with validation); verify creating a request with the demo account stores a row with the session's refs and redirects to detail
- [x] 2.2 Build `/tickets/[id]` (detail, timeline, comment form); verify a tenant comment appears and a foreign ticket id yields 404

## 3. Management pages

- [x] 3.0 Gate the whole `(admin)` group in `src/app/(admin)/layout.tsx` (lane C owns this file): resolve the session, and unless the user's `role` is `manager` return a **404, not a redirect** — a tenant should not learn that `/admin` exists. This gate lives nowhere else: lane B gates `(tenant)` only; verify an anonymous request and a signed-in tenant both get 404 on `/admin`, `/admin/logins`, `/admin/requests` and `/admin/sync`, while a manager reaches all four
- [x] 3.1 Build `/admin/logins` (last 50 login events + last login per account), showing failures as well as successes (`login_events.outcome`, with `email` kept for attempts on unknown accounts); verify a fresh login shows at the top and a failed attempt is visible
- [x] 3.2 Build `/admin/requests` (inbox, status filter, status change action, manager comment); verify the tenant detail reflects the status change
- [x] 3.3 Build `/admin/sync` (cursor, last 10 runs via `listRecentSyncRuns()` showing `cursor_before → cursor_after`, row counts per table excluding `deleted_at IS NOT NULL`, "Relancer la synchro" action calling `runIncrementalSync()`); verify clicking the button adds a run record and counts stay stable

## 4. Integration

- [x] 4.1 After merge with lanes A and B, run the demo path: login → create request → admin changes status → tenant sees it → relaunch sync; verify each step and note any gap in `docs/PLAN.md`
