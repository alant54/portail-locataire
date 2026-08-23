# ERP Sync Specification

## Purpose

Keeps the local mirror of the read-only ERP complete and up to date through a full import and a replayable, idempotent incremental sync driven by a persisted change cursor.

## Requirements

### Requirement: Full import mirrors every collection without duplicates
The system SHALL import every mirrored collection completely, writing rows by ERP primary key so that re-running the import leaves row counts unchanged. The import SHALL never issue a non-GET request to the ERP.

Collections whose offset pagination the ERP serves reliably SHALL be read page by page until it reports no next page. A collection whose pages are observed to overlap or skip rows SHALL NOT be read that way: it SHALL be read through a filter that partitions it into independently stable requests, so that no row is silently missing from the mirror.

#### Scenario: Import twice
- **WHEN** the full import runs twice in a row on the same database
- **THEN** the row count of every mirror table is identical after both runs and no row is duplicated

#### Scenario: A collection whose pagination loses rows
- **WHEN** a collection returns fewer distinct primary keys than rows fetched across a full offset walk, or two walks return different sets
- **THEN** the full import reads that collection through a partitioning filter instead of by offset
- **AND** a balance computed from the imported rows equals the value the ERP reports for that tenant

#### Scenario: Import order respects relations
- **WHEN** the full import runs on an empty database
- **THEN** patrimoine collections are written before parties and leases, which are written before rent terms, entries, meters and maintenance

### Requirement: Incremental sync replays change events from a cursor
The system SHALL keep the largest processed `change_id` in the local database and request `sync-events` strictly after it. For `upsert` events the local row SHALL be refreshed from the ERP; for `delete` events the local row SHALL be marked deleted locally by setting `deleted_at`, without calling the ERP for writes and without removing the row. The cursor SHALL advance only after the batch has been committed.

#### Scenario: Nothing new
- **WHEN** incremental sync runs and the ERP returns no events after the cursor
- **THEN** the cursor is unchanged and a sync run is recorded with zero events applied

#### Scenario: Replaying the same events
- **WHEN** the cursor is manually reset to an earlier value and incremental sync runs again
- **THEN** row counts are unchanged and the cursor returns to the previous maximum

#### Scenario: Delete event
- **WHEN** an event with operation `delete` is processed for a known entity
- **THEN** the local row still exists with `deleted_at` set and the ERP receives no write request

#### Scenario: Batch failure
- **WHEN** applying a batch of events fails midway
- **THEN** the cursor is not advanced and the sync run is recorded with status `failed` and the error

### Requirement: Every sync run is recorded
Each full or incremental run SHALL be recorded with start/finish time, kind, number of events or rows applied, status and error message, so the management side can display sync state.

#### Scenario: Successful run visible
- **WHEN** an incremental sync completes
- **THEN** a run record exists with status `ok`, the number of applied events and the resulting cursor
