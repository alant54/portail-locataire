## 1. Client & registry

- [ ] 1.1 Implement `src/erp/client.ts` (headers from env, `listAll(resource)` async generator over pages, `getOne(resource, externalRef)`, retry/backoff); verify a vitest with a mocked `fetch` walks two pages and retries once on 503
- [ ] 1.2 Implement `src/sync/registry.ts` mapping every ERP collection to table, import rank, primary key and detail-endpoint availability; the shapes are irregular, so encode: `lease-parties`/`lease-objects` have a **composite key and no `id`**, `meter-readings` has **no `source_revision`** (always overwrite), and `unit-amenities`/`unit-statuses`/`dataset-releases`/`tenant-portal-snapshots` are **not mirrored**. Verify a test asserts the mapping is a bijection with the 15 mirror tables in the schema *and* that the four non-mirrored collections are absent

## 2. Full import

- [ ] 2.1 Implement `src/sync/full-import.ts` iterating the registry in rank order through `upsert.ts`, with `--only` and a per-collection row cap from env (`SYNC_MAX_ROWS_PER_COLLECTION`, add it to `.env.example`); cap **`meter-readings`** (90 k, unused by the demo) and never `tenant-account-entries` (161 k, needed in full for balances); verify `npm run sync:full` completes against the real ERP and logs per-table counts
- [ ] 2.2 Verify idempotency: run `npm run sync:full` twice and assert identical `SELECT count(*)` per table (add this as `scripts/check-idempotent.sh`)

## 3. Incremental sync

- [ ] 3.1 Implement `src/sync/incremental.ts`: read cursor, page `sync-events?after=&limit=500`, resolve upserts (mirror lookup → detail refetch by `external_ref`; for an unknown UUID use the ERP's **server-side filters**, e.g. `tenant-account-entries?lease_contract_id=`, rather than re-paging the collection), apply deletes with `softDeleteRow` (**`deleted_at`, not `archived_at`** — 8 of 15 tables have no `archived_at`), skip unknown `entity_type` values without failing, one transaction per page including the cursor update; verify a vitest with a fake ERP covers upsert-known, upsert-unknown, delete, unknown-entity-type and mid-batch failure (cursor unchanged)
- [ ] 3.2 Record `sync_runs` for full and incremental runs and implement the real `runIncrementalSync()` in `src/sync/index.ts` returning the frozen `SyncRunSummary` from `src/contracts.ts` (`runId, kind, eventsApplied, cursorBefore, cursorAfter, status, error?`); verify a run row appears after `npm run sync`
- [ ] 3.3 Replay test: reset `sync_cursor` to 0, run `npm run sync`, assert row counts unchanged and cursor back to max; verify via `scripts/check-idempotent.sh`

## 4. Hand-off

- [ ] 4.1 Document `sync:full`, `sync`, env caps and the A1 resolution strategy in `docs/SYNC.md`; verify lane C's sync screen can call `runIncrementalSync()` and display the returned summary
