## 1. Auth

- [x] 1.1 Implement password hashing (`scrypt`) and `src/auth/session.ts` (create/read/destroy session cookie backed by `sessions`); verify a vitest round-trips a session
- [x] 1.2 Implement `/login` page + server action, logout action, and `login_events` insert on success; verify logging in with a seeded account lands on the dashboard and a `login_events` row is created
- [x] 1.3 Implement `middleware.ts` + the session gate in `src/app/(tenant)/layout.tsx` **only** — the manager gate on `(admin)` belongs to lane C (task 3.0), which owns that folder; verify an anonymous request to `/` or `/tickets` is redirected to `/login` and an authenticated tenant reaches the dashboard. Do not edit `src/app/(admin)/**`
- [x] 1.4 Replace the `scripts/seed-demo.ts` stub: **3 tenant accounts + 1 manager** — `TEN-00005` and `TEN-00170` (both `primary_payer`) plus `TEN-06002`, the `co_tenant` on `TEN-00005`'s lease `BAIL-000005`. The third account is what makes task 4.1's co-tenant case runnable; without it no co-tenant can log in. Credentials in README. `npm run seed:demo` is already declared and already runs inside `npm run setup`, so **do not edit `package.json`**; verify a fresh `npm run setup` then login works for all three accounts

## 2. Tenant data layer

- [x] 2.1 Replace **both** identity stubs with session-backed implementations — `getCurrentTenant()` and `getCurrentUser()` (the role seam lane C added on `main`) — keeping the frozen returned shapes, honouring `SessionLookup`, and returning `null` for an anonymous, expired or unknown session. Drop the `PORTAL_STUB_ROLE` env knob with the stub. Rewrite the two identity tests in `src/contracts.test.ts` around a seeded session, keeping their field-set assertions verbatim; verify `npm test` and `npm run typecheck` pass
- [x] 2.2 Implement `src/db/tenant-queries.ts`: `getHome`, `getLeases`, `getBalance`, `getRecentEntries`, `getUpcoming`, all taking `tenantRef` and filtering **`archived_at IS NULL AND deleted_at IS NULL`** (only 7 of 15 tables have `archived_at`, so the filter is per-table, not generic). Resolve the tenant's leases through `lease_parties` — every fixture tenant shares their lease with a `co_tenant`, so matching only `primary_payer` silently hides a real tenant's own bail; verify unit tests via `createTestDb({ seed: true })`
- [x] 2.3 Balance oracle test: computed balance equals `tenant-portal-snapshots.balance_chf` for every fixture tenant (`readBalanceOracle()` from `scripts/seed-fixtures.ts`; the snapshots are deliberately not in the DB). Entries carry `cleared`, `overdue` and `partially_paid` — B1 is already settled in design.md — **all live entries count, no status filter** (verified against all four oracle balances) — so this test pins that rule rather than discovering it. Note the dataset has only positive balances, so an empty-state and a credit balance can never be observed here; verify the test passes

## 3. Dashboard

- [x] 3.1 Build `/` (Mon logement): unit + address, lease card, balance card with 5 latest entries, "À venir" card, link to Mes demandes; verify with the demo account every block renders with fixture data and empty states show when data is missing
- [x] 3.2 Build `/bail` (lease detail with rent terms and all entries); verify it renders for the demo tenant

## 4. Isolation

- [x] 4.1 Write the isolation test: log in as TEN-A and TEN-B, request each other's `/bail/<ref>` and a ticket URL, expect 404 and no foreign data in the body; add the co-tenant case using the `TEN-06002` account from task 1.4 (a `co_tenant` on `BAIL-000005` must still see that lease, and still nothing else). Per design.md the test drives the real route modules in-process — mocked `next/headers` cookie, sentinel `notFound()` — not a live dev server; verify `npm test` passes and the test file is referenced in `docs/PLAN.md`
