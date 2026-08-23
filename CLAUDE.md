# Tenant Portal (FD_CHALLENGE)

Tenant portal over a **read-only** property-management ERP (fictive data, CHF, Vaud). Everything we create lives in a local SQLite DB. ~4 h challenge: narrow and solid beats wide and wobbly. Full plan: `docs/PLAN.md`. Brief: `docs/Instruction..txt`.

## Commands

Planned (exist once `phase-0-foundation` is applied):

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies (`better-sqlite3` needs `build-essential`, present in devcontainer) |
| `npm run setup` | `db:migrate` + `seed:fixtures` (+ `seed-demo` after lane B) |
| `npm run dev` | Next.js on port 5173 (the forwarded port) |
| `npm run sync:full` / `npm run sync` | Full ERP import / incremental sync from cursor |
| `npm test` | vitest (includes the tenant-isolation test) |
| `openspec list` / `openspec validate <change> --strict` | Planning status / validate artifacts |

## Architecture

```
src/app/(tenant)/   # tenant pages — lane B (tickets/ subfolder is lane C)
src/app/(admin)/    # management screens — lane C
src/auth/           # sessions, getCurrentTenant() — lane B
src/db/             # schema.ts (FROZEN), client, upsert, tenant-queries.ts
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
- `src/db/schema.ts`, `src/erp/types.ts` - frozen contracts; change only on `main`, then merge into all lane worktrees
- `src/auth/current-tenant.ts`, `src/sync/index.ts` - cross-lane interfaces (`getCurrentTenant()`, `runIncrementalSync()`); lanes replace bodies, never signatures

## Environment

Required in `.env.local` (gitignored; template in `.env.example`):
- `ERP_API` - base URL of the ERP
- `ERP_PUBLISHABLE_KEY` - sent as both `apikey` and `Authorization: Bearer` headers
- `GEMINI_API_KEY` - bonus assistant only, server-side only

Never write a key into `docs/`, the repo, or the browser bundle.

## ERP facts (verified 2026-08-23)

- `GET /v1/{resource}?limit≤1000&offset` → `{data, meta.next_offset}`; paginate until `next_offset === null`.
- Rows: UUID `id` (PK, used by all FKs), human `external_ref` (`TEN-00001`, `BAIL-000001`, `APT-00001`), `source_revision`, `archived_at`.
- Detail endpoints accept **external_ref only**; `sync-events.entity_id` is a **UUID** → resolve via the local mirror.
- `sync-events?after=<change_id>&limit=500`, operation `upsert|delete`; deletes are applied locally only.
- `tenant-portal-snapshots` gives `balance_chf` per tenant → fixtures + balance oracle, not an app data source.
- Balance = Σ debit − Σ credit on `tenant-account-entries`. POST/PUT/PATCH/DELETE return 405.

## Code Style

- TypeScript, Next.js App Router, server components + server actions; Drizzle ORM on `better-sqlite3`.
- Tenant reads go **only** through `src/db/tenant-queries.ts`, `tenantRef` always from the session, never from URL/body.
- Mirror writes go through `src/db/upsert.ts` (upsert by `id`, skip older `source_revision`); filter `archived_at IS NULL` when reading.
- Tickets store `tenant_ref/lease_ref/unit_ref` (refs, not UUIDs) so they survive a full re-sync.
- UI copy in French.

## Workflow

- OpenSpec drives the work: `/opsx:apply phase-0-foundation` first (serial), then lanes A/B/C in parallel, one agent per git worktree (`lane-a`, `lane-b`, `lane-c`), then delivery (README + report with cuts).
- Each lane owns disjoint folders (see Architecture); shared files change on `main` only.
- Every cut feature is written down as a deliberate decision — the report is graded on it.

## Gotchas

- `/workspace` is not a git repo until Phase 0 task 1.1; worktrees need it.
- `docs/API.txt` once contained live keys — keys were moved to `.env.local`; keep it that way.
- `meter-readings` is large: cap it for the demo (`SYNC_MAX_ROWS_PER_COLLECTION`), record the cap as a cut.
- `openspec validate` takes the change name positionally (`openspec validate <name> --strict`), not `--change`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
