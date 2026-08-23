## Context

Schema (`users`, `sessions`, `login_events`) and fixtures are given by `phase-0-foundation`; `getCurrentTenant()` and `getCurrentUser()` exist as stubs that lane C already codes against. Lane B owns the body of both. Next.js App Router with server components and server actions.

## Goals / Non-Goals

**Goals:** one choke point for tenant data; a dashboard readable in ten seconds; an isolation test the evaluators can run.
**Non-Goals:** registration, password reset, OAuth, multi-lease tenants beyond "primary active lease first".

## Decisions

- **Own minimal session auth** (httpOnly cookie → `sessions` row) rather than NextAuth. Alternative: NextAuth/Auth.js — more setup than value for two demo accounts.
- **Both identity seams are async** (landed on `main`, commit `9723d53`, before lane B started). `getCurrentTenant()` and `getCurrentUser()` were declared synchronous in phase 0, but the session is a cookie and `cookies()` is awaited in this version of Next — a synchronous seam physically cannot read one. The *returned shapes* are unchanged, which is what `src/contracts.test.ts` freezes; callers gain one `await`. Done now because lane C had not yet written a call site. Alternative rejected: keep the seam sync and make every page read the cookie itself, which puts the identity plumbing back in the pages the seam exists to protect.
- **`SessionLookup` injection over a request scope in tests.** Both seams take an optional `{ sessionId, database }`. Production passes nothing; tests open a session in their own `createTestDb()` and pass it, so `npm test` needs no request scope and never touches `data/app.db`. Same move as lane A's injected ERP client.
- **Lane B rewrites the two identity tests in `src/contracts.test.ts`.** The versions on `main` assert *stub* behaviour — a non-null tenant with no session, and the `PORTAL_STUB_ROLE` env knob — neither of which can survive a session-backed body. The field-set assertions (the actual frozen contract) are kept verbatim; only the way the identity is obtained changes, to a seeded session.
- **Password hashing with Node `crypto.scrypt`** — no native dependency. Alternative: bcryptjs — fine too, but adds a package.
- **`src/db/tenant-queries.ts` is the only tenant read path.** Every function signature starts with `tenantRef` and joins through `parties.external_ref → lease_parties → leases → lease_objects → rental_units`. Pages call `getCurrentTenant()` then these functions; no page queries mirror tables directly. This is what makes isolation reviewable in one file.
- **Tenant → lease resolution**: leases where the tenant is `primary_payer` or `co_tenant`, ordered active > notice_given > upcoming > ended; dashboard shows the first, "Mes baux" lists the rest if more than one.
- **Balance rule (B1 — settled 2026-08-23)**: **every live entry counts, whatever its `status`.** Σ debit − Σ credit over `tenant_account_entries` reproduces the oracle exactly on all four fixture leases:

  | lease | computed | `balance_chf` |
  |---|---|---|
  | BAIL-000005 | 1090 | 1090 |
  | BAIL-000010 | 1210 | 1210 |
  | BAIL-000170 | 2540 | 2540 |
  | BAIL-000340 | 2420 | 2420 |

  Every status-filtered variant diverges on BAIL-000170 (`status != 'cleared'` → 3630, `status = 'overdue'` → 2420), so `cleared` entries are *not* excluded — a settled invoice that was paid by a credit entry is already netted out by the credit. `tenant_account_entries` has no `archived_at` column at all, so its live filter is `deleted_at IS NULL` only.
- **No `middleware.ts` — gating lives in the two layouts only.** `(tenant)/layout.tsx` redirects an anonymous or expired session to `/login`; `(admin)/layout.tsx` (lane C) answers 404 to anyone who is not a manager. Middleware would be a second copy of the same rule, running on a different runtime, silently drifting from the layout it duplicates — and it cannot open the database to check that the session row still exists, so it could only test for cookie *presence*. Deliberate cut, written down as one.
- **Isolation test runs in-process, not against `next dev`.** Booting a dev server inside `npm test` is the flakiest thing available at hour three, and the suite currently runs in ~1.3 s. Instead the test drives the real route modules: `next/headers` is mocked to serve each tenant's session cookie, `next/navigation`'s `notFound()` throws a sentinel, and the page module is invoked as the async function it is. It asserts three things per direction — the foreign `/bail/<ref>` calls `notFound()`, the tenant-query layer returns nothing for a foreign ref, and the serialised view-model of tenant A contains none of tenant B's references or names.

## Risks / Trade-offs

- [Balance rule mismatches oracle] → settled before implementation (see above); the oracle test keeps it settled.
- [Tenant with no active lease in fixtures] → dashboard shows the most relevant lease and an explicit empty state; demo accounts are chosen to avoid this.
- [Co-tenants have no oracle row] → the four `co_tenant` parties (`TEN-06002/06003/06035/06069`) are not in `tenant-portal-snapshots`, so a co-tenant's balance cannot be oracle-checked — only their lease *visibility* is asserted. One of them (`TEN-06035`, "Atelier Fictif") is an organisation, so no screen may assume a co-tenant has a first name.
- [In-process isolation test could pass while real HTTP leaks] → mitigated by driving the actual page modules and the actual session cookie, not a hand-rolled stand-in for them.
