## Why

Checklist items #1 and #3: a tenant logs in, understands their situation in ten seconds, and can never reach another tenant's data ("on essaiera"). This lane builds authentication, the demo accounts, the tenant-scoped query layer and the dashboard on top of the frozen schema and fixtures from `phase-0-foundation`.

## What Changes

- Email + password login with hashed passwords, cookie sessions, logout, and a `login_events` row on every successful login (consumed by lane C's management screen).
- Demo seeder creating two tenant users linked to fixture tenants and one manager user; credentials documented for the evaluators.
- Real implementation of both identity seams — `getCurrentTenant()` and `getCurrentUser()` — from the session, replacing the Phase 0 stubs.
- A single tenant-scoped query module that every tenant page uses; all functions take the tenant reference from the session, never from the request.
- Dashboard "Mon logement": unit + address, lease (status, dates, rent), balance in CHF with the latest entries, what is coming next (next due entry, next planned maintenance), and an entry point to "Mes demandes" (lane C).
- An automated isolation test.

## Capabilities

### New Capabilities
- `tenant-auth`: login, sessions, logout, login event recording, role gating between tenant and manager areas.
- `tenant-isolation`: every tenant-facing read is scoped to the authenticated tenant; foreign references resolve to not-found.
- `tenant-dashboard`: the tenant's situation at a glance — home, lease, balance, upcoming items.

### Modified Capabilities
- none

## Impact

- Owns `src/auth/**`, `src/app/(tenant)/**` except `tickets/`, `src/db/tenant-queries.ts`, `scripts/seed-demo.ts`, `src/app/login/**`, and the `#session-slot` line of the frozen nav.
- **No new dependency**: password hashing uses Node's built-in `crypto.scrypt`, so the frozen `package.json` is untouched.
- Lane C consumes both identity seams and the `login_events` table. Both became async on `main` (`9723d53`) before this lane started — lane C awaits them.
