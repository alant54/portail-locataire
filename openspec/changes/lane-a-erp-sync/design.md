## Context

Schema, `upsert.ts` helper and types come from `phase-0-foundation`. ERP facts verified (PLAN.md §2): relations are UUIDs, detail endpoints accept only `external_ref`, `sync-events.entity_id` is a UUID, pages are `{data, meta.next_offset}`.

## Goals / Non-Goals

**Goals:** replayable, idempotent, observable sync; CLI + callable function.
**Non-Goals:** background scheduling, parallel fetching, syncing meter readings in full for the demo (capped, see PLAN.md §6).

## Decisions

- **Upsert by UUID `id`, guard on `source_revision`** — `INSERT … ON CONFLICT(id) DO UPDATE … WHERE excluded.source_revision >= stored.source_revision`. Alternative: delete-and-reinsert per collection — simpler but breaks idempotency guarantees mid-run and churns FK rows.
- **Resolving an `upsert` event (PLAN.md A1)**: look up the local row by `entity_id` → if found and it has an `external_ref`, refetch `GET /v1/{resource}/{external_ref}`; if not found or the collection has no detail endpoint (lease-parties, lease-objects, rent-terms, unit-amenities, meter-readings, payment-plans), collect the `entity_type` and re-page that collection once at the end of the batch. Alternative (c) "re-page every touched collection always" kept as the fallback path, so correctness never depends on the detail endpoints.
- **Batch = one ERP page (≤500 events) = one SQLite transaction**, cursor update inside the same transaction. Alternative: per-event commits — slower and allows a half-applied page.
- **Entity type → table map** in one module (`src/sync/registry.ts`) listing, per collection: ERP path, table, detail-endpoint availability, import order rank. Full import and incremental sync both iterate this map.
- **Client**: `fetch` with `apikey` + `Authorization` headers, 3 retries with backoff on 429/5xx, timeout 30 s. No SDK.
- **Soft delete** via the portal-owned `deleted_at`, present on every mirror table — the ERP's own `archived_at` exists on only 7 of the 15 collections, so it cannot carry deletes. Tenant queries (lane B) filter `archived_at IS NULL AND deleted_at IS NULL`.

## Risks / Trade-offs

- [Large collections make full import slow in the demo] → `--only` flag and a `SYNC_MAX_ROWS_PER_COLLECTION` env cap for meter readings; record caps in the report as a deliberate cut.
- [ERP rate limits] → backoff; full import is a one-time setup step.
- [Unknown `entity_type` in events] → log and skip, count in `sync_runs.error`, do not block the cursor.
