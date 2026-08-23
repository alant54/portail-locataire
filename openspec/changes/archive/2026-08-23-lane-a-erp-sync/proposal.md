## Why

The portal must show real ERP data without ever writing to the ERP, and the evaluators will re-run the sync to check it does not duplicate anything (checklist #4). This lane builds the ERP client, the full import and the cursor-based incremental sync on top of the frozen schema from `phase-0-foundation`.

## What Changes

- ERP HTTP client with the two required auth headers, pagination (`limit`/`offset` until `next_offset` is null) and retry on 429/5xx.
- Full import command in the brief's recommended order: patrimoine → parties, leases, roles, objects → rent terms, entries, payment plans, meters, maintenance.
- Incremental sync command driven by `/v1/sync-events?after=<cursor>&limit=500`, applying `upsert`/`delete` idempotently and advancing the cursor only after each batch is committed.
- A `sync_runs` row for every run (kind, counts, status, error) and the real implementation of `runIncrementalSync()` consumed by the management "sync" screen (lane C).

## Capabilities

### New Capabilities
- `erp-sync`: importing ERP collections into the local mirror and replaying change events idempotently with a persisted cursor.

### Modified Capabilities
- none

## Impact

- Owns `src/erp/client.ts`, `src/sync/**`, `scripts/sync.ts`, `npm run sync:full`, `npm run sync`.
- Reads `ERP_API`, `ERP_PUBLISHABLE_KEY` from `.env.local`.
- Writes only mirror tables, `sync_cursor` and `sync_runs`. Never touches portal-owned tables.
