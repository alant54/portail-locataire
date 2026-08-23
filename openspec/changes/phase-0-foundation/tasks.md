## 1. Repository & secrets

- [x] 1.1 `git init` on `main`, commit `.gitignore`, `.env.example`, `docs/`; verify `git grep sb_publishable` returns nothing
- [x] 1.2 Create Next.js App Router + TypeScript skeleton at repo root; verify `npm run dev` serves `/` on port 5173 (`next dev -p 5173`)

## 2. Database

- [x] 2.1 Add `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `tsx`, `vitest`; verify `npm install` succeeds and `better-sqlite3` loads in `node -e`
- [x] 2.2 Write `src/db/schema.ts` with every mirror table (UUID PK, unique `external_ref` where present, `source_revision`, `updated_at`, `archived_at`, `synced_at`) and the portal tables `users`, `sessions`, `login_events`, `tickets`, `ticket_comments` (`author_kind`, `kind` comment|status), `sync_cursor`, `sync_runs`; verify `drizzle-kit generate` produces a migration
- [x] 2.3 Add `src/db/client.ts` and `npm run db:migrate`; verify running it twice on `data/app.db` exits 0 and `sqlite3 data/app.db .tables` lists all tables
- [x] 2.4 Add the shared test harness: `vitest.config.ts`, `npm test`, and `src/db/test-db.ts` giving each suite its own migrated database (never `data/app.db`), with an opt-in fixture seed; verify one sample suite passes and two suites run in the same `npm test` without sharing rows
- [x] 2.5 Add `src/db/upsert.ts` (insert-or-update by `id`, skip when stored `source_revision` is newer); verify a vitest using `test-db.ts` writes the same row twice and count stays 1

## 3. ERP types & fixtures

- [x] 3.1 Write `src/erp/types.ts` for every resource listed in `docs/erp/openapi.json` using the sample shapes in PLAN.md; verify `tsc --noEmit` passes
- [x] 3.2 Write `scripts/pull-fixtures.ts` that picks 3–5 tenants (active lease, non-zero balance, upcoming maintenance), pulls their full graph + `tenant-portal-snapshots`, logs collection sizes, writes `fixtures/*.json`; verify the JSON files exist and sizes are recorded in PLAN.md §7 A2
- [x] 3.3 Write `scripts/seed-fixtures.ts` + `npm run seed:fixtures` using `upsert.ts`; verify running it twice leaves row counts unchanged and each fixture tenant has party, lease, unit, entries

## 4. Cross-lane interfaces & shell

- [x] 4.1 Declare the frozen seam types in `src/contracts.ts`: `CurrentTenant = {userId, tenantRef, leaseRef, unitRef}` (refs are `external_ref`s) and `SyncRunSummary = {runId, kind, eventsApplied, cursorBefore, cursorAfter, status: 'ok'|'failed', error?}`; verify `tsc --noEmit` passes and both types are exported from one place
- [x] 4.2 Add `src/auth/current-tenant.ts` stub (`getCurrentTenant(): CurrentTenant | null`, returning the first fixture tenant, `null` never produced by the stub) and `src/sync/index.ts` stub (`runIncrementalSync(): Promise<SyncRunSummary>` returning a well-formed ok summary with `eventsApplied: 0` and an unchanged cursor); verify both are imported by a placeholder page without type errors
- [x] 4.3 Add the contract test (`src/contracts.test.ts`): assert both stubs return every field of their frozen shape with the right type, so a lane that narrows a return value fails `npm test`; verify it passes against the stubs and fails when a field is deleted
- [x] 4.4 Add shared layout with nav (Mon logement · Mes demandes · Gérance) and empty route groups `(tenant)` and `(admin)`; verify all three routes render
- [x] 4.5 Add `npm run setup` = `db:migrate` + `seed:fixtures`; verify a fresh clone runs `npm i && npm run setup && npm run dev` successfully

## 5. Hand-off

- [ ] 5.1 Commit on `main`, create branches + worktrees `lane-a`, `lane-b`, `lane-c`; verify `git worktree list` shows three entries
- [x] 5.2 Update `docs/PLAN.md` §7 with resolved open questions (A2 sizes, B2 chosen demo tenants); verify the file reflects the decisions
- [x] 5.3 Record the frozen surface in `CLAUDE.md`: `src/contracts.ts`, `schema.ts`, `erp/types.ts` and the dependency list change on `main` only, and every lane test goes through `src/db/test-db.ts`; verify each lane's `tasks.md` is consistent with it
