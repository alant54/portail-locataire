## 1. Auth

- [ ] 1.1 Implement password hashing (`scrypt`) and `src/auth/session.ts` (create/read/destroy session cookie backed by `sessions`); verify a vitest round-trips a session
- [ ] 1.2 Implement `/login` page + server action, logout action, and `login_events` insert on success; verify logging in with a seeded account lands on the dashboard and a `login_events` row is created
- [ ] 1.3 Implement `middleware.ts` + role checks in `(tenant)` and `(admin)` layouts; verify a tenant session gets 404 on `/admin` and an anonymous request is redirected to `/login`
- [ ] 1.4 Write `scripts/seed-demo.ts` (2 tenants from fixtures — `TEN-00005` and `TEN-00170` — plus 1 manager) wired into `npm run setup`, credentials in README; verify fresh setup then login works for all three accounts

## 2. Tenant data layer

- [ ] 2.1 Replace the `getCurrentTenant()` stub with the session-backed implementation, keeping the frozen `CurrentTenant | null` signature and returning `null` for anonymous or expired sessions; verify lane C's pages still type-check
- [ ] 2.2 Implement `src/db/tenant-queries.ts`: `getHome`, `getLeases`, `getBalance`, `getRecentEntries`, `getUpcoming`, all taking `tenantRef` and filtering **`archived_at IS NULL AND deleted_at IS NULL`** (only 7 of 15 tables have `archived_at`, so the filter is per-table, not generic). Resolve the tenant's leases through `lease_parties` — every fixture tenant shares their lease with a `co_tenant`, so matching only `primary_payer` silently hides a real tenant's own bail; verify unit tests via `createTestDb({ seed: true })`
- [ ] 2.3 Balance oracle test: computed balance equals `tenant-portal-snapshots.balance_chf` for every fixture tenant (`readBalanceOracle()` from `scripts/seed-fixtures.ts`; the snapshots are deliberately not in the DB). Entries carry `cleared`, `overdue` and `partially_paid` — settle B1 by finding which set reproduces the 4 known balances, then record the rule in design.md. Note the dataset has only positive balances, so an empty-state and a credit balance can never be observed here; verify the test passes

## 3. Dashboard

- [ ] 3.1 Build `/` (Mon logement): unit + address, lease card, balance card with 5 latest entries, "À venir" card, link to Mes demandes; verify with the demo account every block renders with fixture data and empty states show when data is missing
- [ ] 3.2 Build `/bail` (lease detail with rent terms and all entries); verify it renders for the demo tenant

## 4. Isolation

- [ ] 4.1 Write the isolation test: log in as TEN-A and TEN-B, request each other's `/bail/<ref>` and a ticket URL, expect 404 and no foreign data in the body; add the co-tenant case (a `co_tenant` on a shared lease must still see that lease, and still nothing else); verify `npm test` passes and the test file is referenced in `docs/PLAN.md`
