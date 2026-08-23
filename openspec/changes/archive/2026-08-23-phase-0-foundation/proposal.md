## Why

Three agents will build the ERP sync, the tenant portal and the management screens in parallel (see `docs/PLAN.md`). Without a shared, frozen foundation — app skeleton, local schema, ERP types, fixtures and the two cross-lane interfaces — the lanes would each invent their own and the last hour would be spent merging instead of demoing.

## What Changes

- Initialise the repository (`git init`, `.gitignore`, `.env.example`) with secrets kept in `.env.local` only.
- Create the Next.js (App Router, TypeScript) skeleton with a shared layout and navigation for the tenant and management areas.
- Add SQLite via `better-sqlite3` + Drizzle ORM, with the **complete** local schema (ERP mirror tables + our own tables) and a migration command.
- Add TypeScript types for every ERP resource, derived from sample records and `docs/erp/openapi.json`.
- Add a fixtures dump (3–5 tenants end-to-end) pulled from the ERP plus a `seed:fixtures` command so lanes B and C can work before the real sync exists.
- Define the two cross-lane interfaces as stubs with frozen return shapes: `getCurrentTenant()` and `runIncrementalSync()`.
- Set up the test harness the three lanes share: `npm test`, a vitest config, and a helper that hands each suite its own migrated database.
- Create git worktrees/branches for lanes A, B and C.

## Capabilities

### New Capabilities
- `local-data-model`: the local SQLite database shape — ERP mirror tables keyed by ERP UUID with `external_ref`, plus portal-owned tables (users, sessions, login events, tickets, comments, sync cursor, sync runs) — and the migration behaviour.
- `demo-fixtures`: seeding the local database with a small, coherent set of ERP records for development and the demo without calling the ERP.
- `cross-lane-interfaces`: the two seams the lanes meet at — session-derived tenant identity and the summarised sync trigger — with return shapes frozen before the lanes start.

### Modified Capabilities
- none (greenfield)

## Impact

- New project at repo root: `package.json`, `src/app/**`, `src/db/**`, `src/erp/types.ts`, `src/auth/current-tenant.ts`, `src/sync/index.ts`, `fixtures/**`, `scripts/**`.
- New dependencies: `next`, `react`, `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `tsx`, `vitest`. The dependency list is frozen with the schema: a lane that needs a new package asks for it on `main`.
- Test isolation is decided here, not per lane: each suite gets its own migrated database, so three worktrees running `npm test` never share `data/app.db`.
- Everything in lanes A/B/C depends on this change; `src/db/schema.ts` and `src/erp/types.ts` are frozen once it lands and only change through the human.
