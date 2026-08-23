## 1. Auth

- [ ] 1.1 Implement password hashing (`scrypt`) and `src/auth/session.ts` (create/read/destroy session cookie backed by `sessions`); verify a vitest round-trips a session
- [ ] 1.2 Implement `/login` page + server action, logout action, and `login_events` insert on success; verify logging in with a seeded account lands on the dashboard and a `login_events` row is created
- [ ] 1.3 Implement `middleware.ts` + role checks in `(tenant)` and `(admin)` layouts; verify a tenant session gets 404 on `/admin` and an anonymous request is redirected to `/login`
- [ ] 1.4 Write `scripts/seed-demo.ts` (2 tenants from fixtures + 1 manager) wired into `npm run setup`, credentials in README; verify fresh setup then login works for all three accounts

## 2. Tenant data layer

- [ ] 2.1 Replace the `getCurrentTenant()` stub with the session-backed implementation, keeping the frozen `CurrentTenant | null` signature and returning `null` for anonymous or expired sessions; verify lane C's pages still type-check
- [ ] 2.2 Implement `src/db/tenant-queries.ts`: `getHome`, `getLeases`, `getBalance`, `getRecentEntries`, `getUpcoming`, all taking `tenantRef` and filtering `archived_at IS NULL`; verify unit tests against the fixtures DB
- [ ] 2.3 Balance oracle test: computed balance equals `tenant-portal-snapshots.balance_chf` for every fixture tenant; adjust the status filter once and record the rule in design.md; verify the test passes

## 3. Dashboard

- [ ] 3.1 Build `/` (Mon logement): unit + address, lease card, balance card with 5 latest entries, "À venir" card, link to Mes demandes; verify with the demo account every block renders with fixture data and empty states show when data is missing
- [ ] 3.2 Build `/bail` (lease detail with rent terms and all entries); verify it renders for the demo tenant

## 4. Isolation

- [ ] 4.1 Write the isolation test: log in as TEN-A and TEN-B, request each other's `/bail/<ref>` and a ticket URL, expect 404 and no foreign data in the body; verify `npm test` passes and the test file is referenced in `docs/PLAN.md`
