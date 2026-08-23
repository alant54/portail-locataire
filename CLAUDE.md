# Tenant Portal (FD_CHALLENGE)

Tenant portal over a **read-only** property-management ERP (fictive data, CHF, Vaud). Everything we create lives in a local SQLite DB. ~4 h challenge: narrow and solid beats wide and wobbly. Full plan: `docs/PLAN.md`. Brief: `docs/Instruction..txt`.

## Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies (`better-sqlite3` needs `build-essential`, present in devcontainer) |
| `npm run setup` | `db:migrate` + `seed:fixtures` + `seed:demo` (the last is a no-op stub until lane B lands) |
| `npm run dev` | Next.js on port 5173 (the forwarded port) |
| `npm test` | vitest — every suite gets its own DB via `src/db/test-db.ts`, never `data/app.db` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` / `db:migrate` | Regenerate a Drizzle migration / apply migrations |
| `npm run pull:fixtures` | Re-pull `fixtures/` from the live ERP (needs `.env.local`) |
| `npm run sync:full` / `npm run sync` | Full ERP import / incremental sync — **lane A**, not built yet |
| `openspec list` / `openspec validate <change> --strict` | Planning status / validate artifacts |

`setup`, `dev` and `test` work from a bare clone with **no `.env.local`**; only `pull:fixtures` and the lane-A sync need ERP keys.

## Architecture

```
src/app/(tenant)/   # tenant pages — lane B (tickets/ subfolder is lane C)
src/app/(admin)/    # management screens — lane C
src/auth/           # sessions, getCurrentTenant() — lane B
src/contracts.ts    # FROZEN cross-lane shapes: CurrentTenant, SyncRunSummary
src/db/             # schema.ts (FROZEN), client, upsert, test-db, tenant-queries.ts
src/erp/            # types.ts (FROZEN), client — lane A
src/sync/           # full import, incremental, registry — lane A
src/tickets/        # ticket service — lane C
fixtures/           # ERP JSON snapshot for 3–5 tenants
scripts/            # pull-fixtures, seed-fixtures, seed-demo, sync
docs/               # PLAN.md, erp/openapi.json, brief
openspec/changes/   # phase-0-foundation, lane-a-erp-sync, lane-b-auth-tenant, lane-c-tickets-admin
```

## Key Files

- `docs/PLAN.md` - work split, verified ERP facts, data model, timeline, open questions
- `docs/erp/openapi.json` - ERP contract snapshot (no `components.schemas`; types come from sample records)
- `src/db/schema.ts`, `src/erp/types.ts`, `src/contracts.ts` - frozen contracts; change only on `main`, then merge into all lane worktrees. **The dependency list in `package.json` is frozen the same way**: a lane that needs a package asks on `main` instead of running `npm install` in its worktree.
- `src/auth/current-tenant.ts`, `src/sync/index.ts` - cross-lane interfaces (`getCurrentTenant(): CurrentTenant | null`, `runIncrementalSync(): Promise<SyncRunSummary>`); lanes replace bodies, never signatures. `src/contracts.test.ts` fails if a lane narrows either shape.
- `src/db/test-db.ts` - every test opens its own migrated database (`createTestDb({ seed })`); nothing in `npm test` may touch `data/app.db`.

## Environment

Required in `.env.local` (gitignored; template in `.env.example`):
- `ERP_API` - base URL of the ERP
- `ERP_PUBLISHABLE_KEY` - sent as both `apikey` and `Authorization: Bearer` headers
- `GEMINI_API_KEY` - bonus assistant only, server-side only

Never write a key into `docs/`, the repo, or the browser bundle.

## ERP facts (verified 2026-08-23)

- `GET /v1/{resource}?limit≤1000&offset` → `{data, meta.next_offset}`; paginate until `next_offset === null`.
- Rows: UUID `id` (PK, used by all FKs), human `external_ref` (`TEN-00001`, `BAIL-000001`, `APT-00001`), `source_revision`, `archived_at` — **but only for 7 of the 15 mirrored collections**. Measured over 200+ rows each:
  - `lease-parties` / `lease-objects` have **no `id` at all** (composite key on the FK pair + role).
  - `rent-terms`, `payment-plans`, `meter-readings` have no `external_ref`; `meter-readings` has no `source_revision` either (always overwrite it).
  - Only patrimoine + `parties` + `leases` carry `archived_at` → deletes use our own `deleted_at`, on every mirror table.
- Detail endpoints accept **external_ref only**; `sync-events.entity_id` is a **UUID** → resolve via the local mirror.
- `sync-events?after=<change_id>&limit=500` — `after` is strictly greater and ascending, and works without `offset` (advance the cursor per batch instead). Operation `upsert|delete`; deletes are applied locally only. Unknown `entity_type` values must be skipped, not fatal.
- The whole stream was read end to end (20 665 events, `max(change_id)` 20 665): **exactly four `entity_type` values occur** — `party` (7 200), `rental_unit` (6 800), `lease_contract` (6 525), `property` (140), one event per row of those collections. `lease_contract` is the `leases` collection: the type is snake_case but **not** the singular of the collection name, so a singularising map silently drops 6 525 events. The other 11 mirrored collections never appear — they only refresh through `sync:full`.
- **The dataset contains zero `delete` events** (`?operation=delete` is empty). The soft-delete path is testable against a fake ERP only, never demoable against the live one.
- A full import must store `max(change_id)` into `sync_cursor`, or the first `npm run sync` replays all 20 665 events (~7–10 min of no-op detail fetches).
- **List endpoints take server-side filters** — `tenant-account-entries?lease_contract_id=`, `meter-readings?meter_point_id=`, `lease-parties?lease_contract_id=`, `planned-maintenance?building_id=`, `leases?status=`, `sync-events?entity_type=`. Cheaper than re-paging a collection to resolve one UUID.
- Collection sizes (A2): `tenant-account-entries` **161 603** (~53 s to page), `meter-readings` **90 000** (~16 s), `sync-events` 20 665, everything else ≤ 8 900. ≈330 k rows total.
- Not mirrored, on purpose: `unit-amenities`, `unit-statuses`, `dataset-releases` (no demo screen needs them) and `tenant-portal-snapshots` (oracle only).
- `tenant-portal-snapshots` gives `balance_chf` per tenant → fixtures + balance oracle, not an app data source.
- Balance = Σ debit − Σ credit on `tenant-account-entries`. POST/PUT/PATCH/DELETE return 405.
- The dataset holds only **7 distinct balances, 1090–2540 CHF, all positive** — no tenant is ever in credit. Entry statuses seen: `cleared`, `overdue`, `partially_paid`.

## Code Style

- TypeScript, Next.js App Router, server components + server actions; Drizzle ORM on `better-sqlite3`.
- Tenant reads go **only** through `src/db/tenant-queries.ts`, `tenantRef` always from the session, never from URL/body.
- Mirror writes go through `src/db/upsert.ts` (upsert by primary key, skip older `source_revision`); tenant reads filter **`archived_at IS NULL AND deleted_at IS NULL`** — and 8 of 15 tables have no `archived_at` column at all, so a helper must not assume it exists.
- Tickets store `tenant_ref/lease_ref/unit_ref` (refs, not UUIDs) so they survive a full re-sync.
- UI copy in French.

## Workflow

- OpenSpec drives the work: phase 0 is **applied and archived** (`phase-0-foundation`, `phase-0-hardening` — see `openspec/changes/archive/`). Lanes A/B/C run next in parallel, one agent per git worktree, then delivery (README + report with cuts).
- Worktrees live at `/home/vscode/wt-a|b|c` (`/` is not writable, so `../wt-a` fails). Each needs its own `npm install` — `node_modules` is not shared.
- Only one `next dev` can hold port 5173: lane A `npm run dev -- -p 5174`, lane B 5173, lane C 5175.
- Ownership settled in `phase-0-hardening` — nobody edits a shared file: `(tenant)/layout.tsx` is lane B's session gate, `(admin)/layout.tsx` is lane C's **manager gate** (404, not a redirect), and the frozen nav exposes exactly one edit point, `#session-slot`, which lane B fills from its own component.
- `package.json` is frozen *including scripts*: `sync` / `sync:full` / `seed:demo` are pre-declared and point at files the lanes create (`scripts/sync.ts` → A, `scripts/seed-demo.ts` → B, a no-op stub until then). `npm run sync` failing with "Cannot find module" simply means lane A has not landed.
- `.env.local` lives in `/home/vscode/wt-a` only — lane A is the only lane that calls the ERP.
- Each lane owns disjoint folders (see Architecture); shared files change on `main` only.
- Every cut feature is written down as a deliberate decision — the report is graded on it.

## Gotchas

- Main specs live in `openspec/specs/` (populated by archiving); validate them with `openspec validate --specs`. Lanes' delta specs diff against that baseline.
- `docs/API.txt` once contained live keys — keys were moved to `.env.local`; keep it that way.
- `meter-readings` (90 k) is the collection to cap for the demo (`SYNC_MAX_ROWS_PER_COLLECTION`) — nothing on the dashboard uses it. Do **not** cap `tenant-account-entries` (161 k) even though it is bigger: the balance needs every row.
- Fixture tenants (B2): `TEN-00005`, `TEN-00010`, `TEN-00170`, `TEN-00340` — active lease, a co-tenant on the lease, upcoming maintenance, mixed entry statuses.
- A tenant can be `co_tenant`, not only `primary_payer`: resolve "my lease" through `lease_parties`, never through `leases.primary_rental_unit_id` alone.
- `openspec validate` takes the change name positionally (`openspec validate <name> --strict`), not `--change`.
- `pkill -f 'next dev'` **kills its own shell** (the pattern matches the pkill command line): use `pkill -f 'next[ ]dev'`.
- Deleting or moving a page leaves stale generated types: `rm -rf .next` before trusting a `tsc` error that names a file you removed. Route groups also cannot collide with `src/app/page.tsx` — `/` lives in `(tenant)/page.tsx`.
- Raw SQL bypasses Drizzle's column mappers and better-sqlite3 cannot bind a JS boolean — run values through `column.mapToDriverValue()` (see `src/db/upsert.ts`).
- Verify secrets by grepping tracked files for the real `.env.local` **values**, not a key prefix — a prefix string matches the docs that mention it and passes vacuously.
- `DATABASE_URL=/tmp/x.db npm run setup` exercises the scripts against a throwaway database — never test against `data/app.db`.
- `tsx -e` cannot run top-level `await` ("cjs output format"): write a temp `.ts` file instead.
- `npm install` in a worktree dirties `package-lock.json`; `git checkout -- package-lock.json` before merging or the noise lands in the integration diff.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
