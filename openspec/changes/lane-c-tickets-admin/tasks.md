## 1. Ticket domain

- [ ] 1.1 Confirm `ticket_comments` has `kind` (comment|status) and `author_kind` columns on `main` (request the schema tweak if missing); verify `drizzle-kit` migration applied
- [ ] 1.2 Implement `src/tickets/service.ts` (`createTicket`, `listForTenant`, `getForTenant`, `addComment`, `listAll`, `setStatus`); verify vitest covers create, forged reference ignored, foreign ticket returns null, status transition recorded as timeline entry

## 2. Tenant pages

- [ ] 2.1 Build `/tickets` (Mes demandes list) and `/tickets/new` (form + server action with validation); verify creating a request with the demo account stores a row with the session's refs and redirects to detail
- [ ] 2.2 Build `/tickets/[id]` (detail, timeline, comment form); verify a tenant comment appears and a foreign ticket id yields 404

## 3. Management pages

- [ ] 3.1 Build `/admin/logins` (last 50 login events + last login per account); verify a fresh login shows at the top
- [ ] 3.2 Build `/admin/requests` (inbox, status filter, status change action, manager comment); verify the tenant detail reflects the status change
- [ ] 3.3 Build `/admin/sync` (cursor, last 10 runs, row counts per table, "Relancer la synchro" action calling `runIncrementalSync()`); verify clicking the button adds a run record and counts stay stable

## 4. Integration

- [ ] 4.1 After merge with lanes A and B, run the demo path: login → create request → admin changes status → tenant sees it → relaunch sync; verify each step and note any gap in `docs/PLAN.md`
