## Context

Schema (`users`, `sessions`, `login_events`) and fixtures are given by `phase-0-foundation`; `getCurrentTenant()` exists as a stub that lane C already codes against. Next.js App Router with server components and server actions.

## Goals / Non-Goals

**Goals:** one choke point for tenant data; a dashboard readable in ten seconds; an isolation test the evaluators can run.
**Non-Goals:** registration, password reset, OAuth, multi-lease tenants beyond "primary active lease first".

## Decisions

- **Own minimal session auth** (httpOnly cookie → `sessions` row) rather than NextAuth. Alternative: NextAuth/Auth.js — more setup than value for two demo accounts.
- **Password hashing with Node `crypto.scrypt`** — no native dependency. Alternative: bcryptjs — fine too, but adds a package.
- **`src/db/tenant-queries.ts` is the only tenant read path.** Every function signature starts with `tenantRef` and joins through `parties.external_ref → lease_parties → leases → lease_objects → rental_units`. Pages call `getCurrentTenant()` then these functions; no page queries mirror tables directly. This is what makes isolation reviewable in one file.
- **Tenant → lease resolution**: leases where the tenant is `primary_payer` or `co_tenant`, ordered active > notice_given > upcoming > ended; dashboard shows the first, "Mes baux" lists the rest if more than one.
- **Balance rule**: start with all live entries (`archived_at IS NULL AND deleted_at IS NULL`) regardless of `status`; the fixtures carry `cleared`, `overdue` and `partially_paid`, so compare with the snapshot oracle in a test and adjust once (decision recorded here when known).
- **Route gating in `middleware.ts`** by cookie presence + role check in a server layout for `(tenant)` and `(admin)`.
- **Isolation test with vitest + Next route handlers** (or a small integration test hitting the dev server): log in as two tenants, request each other's lease/ticket URLs, expect 404.

## Risks / Trade-offs

- [Balance rule mismatches oracle] → the test reveals it; the rule is a one-line filter.
- [Tenant with no active lease in fixtures] → dashboard shows the most relevant lease and an explicit empty state; demo accounts are chosen to avoid this.
- [Server actions vs route handlers for the isolation test] → test through HTTP so it is independent of implementation.
