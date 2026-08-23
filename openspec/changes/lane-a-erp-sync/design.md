## Context

Schema, `upsert.ts` helper and types come from `phase-0-foundation`. ERP facts verified (PLAN.md §2): relations are UUIDs, detail endpoints accept only `external_ref`, `sync-events.entity_id` is a UUID, pages are `{data, meta.next_offset}`.

**The whole `sync-events` stream was read end to end (2026-08-23, 20 665 events) before implementation.** It is far narrower than the collection list suggests, and the design below is built on the measured shape rather than the assumed one:

| `entity_type` | events | distinct `entity_id` | = collection size | detail endpoint |
|---|---|---|---|---|
| `party` | 7 200 | 7 200 | yes (7 200) | `/v1/parties/{ref}` |
| `rental_unit` | 6 800 | 6 800 | yes (6 800) | `/v1/rental-units/{ref}` |
| `lease_contract` | 6 525 | 6 525 | yes (6 525) | `/v1/leases/{ref}` |
| `property` | 140 | 140 | yes (140) | `/v1/properties/{ref}` |

- `operation` is **`upsert` for all 20 665 events; the dataset contains no `delete` at all** (`?operation=delete` returns an empty page).
- `source_revision` is 1 (13 325) or 2 (7 340); every event carries a distinct `entity_id`, so no entity appears twice.
- `max(change_id) = 20 665`.
- `?after=` is strictly greater and ascending; `after=20665` returns an empty page with `next_offset: null`.
- All 6 525 `lease_contract` ids were matched against `/v1/leases` — the collection behind that type is `leases`, **not** a collection named after it.

## Goals / Non-Goals

**Goals:** replayable, idempotent, observable sync; CLI + callable function.
**Non-Goals:** background scheduling, parallel fetching, syncing meter readings in full for the demo (capped, see PLAN.md §6), resolving event types the dataset never emits.

## Decisions

- **Upsert by UUID `id`, guard on `source_revision`** — `INSERT … ON CONFLICT(id) DO UPDATE … WHERE excluded.source_revision >= stored.source_revision`. Alternative: delete-and-reinsert per collection — simpler but breaks idempotency guarantees mid-run and churns FK rows.

- **The entity-type map is keyed on the measured strings, never on a singularisation rule.** The four keys are exactly `property → properties`, `rental_unit → rental_units`, `party → parties`, `lease_contract → leases`. `lease_contract` is the trap: singularising `leases` yields `lease`, which matches nothing and would silently drop 6 525 of 20 665 events while every table still looked correctly mapped. A test pins the key set. Any `entity_type` outside the four is logged, counted and skipped — the map is an allow-list, not a lookup that may miss.

- **Resolving an `upsert` event (PLAN.md A1) — detail refetch by default, re-page the collection when the batch is large.** All four live types have both a detail endpoint and an `external_ref`, and after a full import every `entity_id` is already in the mirror (distinct ids = collection size, exactly), so `entity_id → local row → GET /v1/{resource}/{external_ref}` always resolves. The fallback is chosen by cost, not by capability:

  ```
  batch of N events for one entity_type
    detail refetch : N requests
    re-page        : ceil(collection_size / 1000) requests   (parties → 8)
    crossover      : N > collection_size / 1000
  ```

  A 500-event page therefore re-pages instead of issuing 500 detail GETs (~60× fewer requests), and a replay from cursor 0 costs ~21 list requests instead of 20 665 detail requests. Re-paging is also the fallback for a UUID absent from the mirror (a row created after our import). Alternative rejected: resolving unknown UUIDs through the server-side list filters (`tenant-account-entries?lease_contract_id=` and friends). Those filters are real and useful for the fixture pull, but no collection that needs them ever emits an event — it is machinery for a case this dataset cannot produce.

- **Batch = one ERP page (≤500 events) = one SQLite transaction**, cursor update inside the same transaction. Alternative: per-event commits — slower and allows a half-applied page.

- **Page with `after` alone; never combine `after` with `offset`.** Both work together, but advancing the cursor per committed batch (`after=<newCursor>&limit=500`, offset always 0) is self-correcting after a failure, whereas an `offset` walk over a moving `after` window drifts. Terminate on `next_offset === null` only — a full-size last page still reports a non-null `next_offset`, and the following request returns an empty page.

- **The full import seeds the cursor.** Read `max(change_id)` from `sync-events` **before** the import starts, write it into `sync_cursor` in the same transaction that finishes the import. Without this the cursor stays at 0 and the first `npm run sync` replays all 20 665 events — a 7–10 minute no-op that would hang lane C's "Relancer la synchro" button. Reading the max first (rather than after) means events landing during the import are replayed rather than skipped; this ERP is static, so the window is theoretical, but the cheap ordering is the safe one.

- **Entity type → table map** in one module (`src/sync/registry.ts`) listing, per collection: ERP path, table, detail-endpoint availability, import order rank, and the `entity_type` key where one exists. Full import and incremental sync both iterate this map.

- **Client**: `fetch` with `apikey` + `Authorization` headers, 3 retries with backoff on 429/5xx, timeout 30 s. No SDK. It exposes GET only — there is no code path that can issue a write, and a test asserts it (the ERP is read-only; POST/PUT/PATCH/DELETE return 405).

- **Soft delete** via the portal-owned `deleted_at`, present on every mirror table — the ERP's own `archived_at` exists on only 7 of the 15 collections, so it cannot carry deletes. Tenant queries (lane B) filter `archived_at IS NULL AND deleted_at IS NULL`.

## Risks / Trade-offs

- [Large collections make full import slow in the demo] → `--only` flag and a `SYNC_MAX_ROWS_PER_COLLECTION` env cap for meter readings (recommended demo value 2000); record caps in the report as a deliberate cut.
- [ERP rate limits] → backoff; full import is a one-time setup step.
- [Unknown `entity_type` in events] → log and skip, count in `sync_runs.error`, do not block the cursor.
- [The delete path can never be exercised against the live ERP] → the dataset holds zero `delete` events, so `softDeleteRow` and the spec's "Delete event" scenario are covered by the fake-ERP vitest only. Stated in the report as *tested, not demoed*, so nobody hunts for a delete during verification.
- [Only 4 of 15 mirrored collections ever appear in `sync-events`] → the other 11 stay fresh through `sync:full` alone. This is the ERP's behaviour, not a gap in the sync; noted in `docs/SYNC.md` so the demo does not promise incremental freshness for rent terms or account entries.
