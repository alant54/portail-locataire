# Local Data Model Specification

## Purpose

Defines the local SQLite database that mirrors the read-only ERP and stores everything the portal itself creates, so that sync, tenant product and management screens share one contract.

## Requirements

### Requirement: Mirror tables are keyed by ERP identity
Every mirrored ERP collection (management companies, portfolios, properties, buildings, rental units, parties, leases, lease parties, lease objects, rent terms, tenant account entries, payment plans, meter points, meter readings, planned maintenance) SHALL be stored in its own table, keyed by the identity the ERP actually exposes:

- Collections that expose a UUID `id` SHALL use it as the primary key.
- The link collections `lease-parties` and `lease-objects` expose no `id`; each SHALL use a composite primary key over its foreign-key pair and role (`lease_contract_id + party_id + role`, `lease_contract_id + rental_unit_id + object_role`).

Rows SHALL mirror `external_ref`, `source_revision`, `updated_at` and `archived_at` **where the ERP provides them**, keeping `external_ref` unique. Every mirror row SHALL carry a local `synced_at`. A mirror table whose collection has no `source_revision` SHALL be overwritten on every write rather than revision-compared.

#### Scenario: Same ERP row written twice
- **WHEN** a row with an already-stored primary key is written again
- **THEN** the existing row is updated in place and the table row count does not change

#### Scenario: Link row written twice
- **WHEN** the same `lease_contract_id` + `party_id` + `role` triple is written a second time
- **THEN** the existing row is updated in place and no duplicate is created

#### Scenario: Lookup by business reference
- **WHEN** a lease is looked up by `external_ref` `BAIL-000001`
- **THEN** exactly one row is returned

### Requirement: Deletions are recorded locally on every mirror table
Because only part of the ERP collections expose `archived_at`, every mirror table SHALL carry a portal-owned `deleted_at` column that the sync sets when it applies a delete event, whatever the collection. A row SHALL never be physically removed by the sync. Tenant-facing reads SHALL exclude rows where either `archived_at` or `deleted_at` is set.

#### Scenario: Delete event on a collection without archived_at
- **WHEN** a delete event is applied to a `tenant_account_entries` row
- **THEN** the row still exists with `deleted_at` set and is excluded from tenant reads

#### Scenario: Re-running the full import after a delete
- **WHEN** the full import writes that same row again
- **THEN** the row count is unchanged and the row is present exactly once

### Requirement: Portal-owned tables exist
The database SHALL contain the portal-owned tables `users` (with `role` tenant|manager and `tenant_ref` linking to a party `external_ref`), `sessions`, `login_events`, `tickets` (with `tenant_ref`, `lease_ref`, `unit_ref`, `status` open|in_progress|closed), `ticket_comments` (with `author_kind` tenant|manager and `kind` comment|status), `sync_cursor` (single row holding the last processed `change_id`) and `sync_runs`.

The `sync_cursor` singleton SHALL be created by the migration command itself, so the row exists before the first sync runs and the sync only ever updates it in place.

#### Scenario: Fresh database is migrated
- **WHEN** the migration command runs against an empty database file
- **THEN** all mirror and portal-owned tables exist and the command exits 0

#### Scenario: Migration is re-run
- **WHEN** the migration command runs a second time
- **THEN** it exits 0 without error and without data loss

#### Scenario: Cursor singleton exists after migration
- **WHEN** the migration command has run against an empty database file
- **THEN** `sync_cursor` holds exactly one row, with the cursor at 0

#### Scenario: Cursor singleton survives a re-run
- **WHEN** the migration command runs again over a database whose cursor has advanced
- **THEN** `sync_cursor` still holds exactly one row and its value is unchanged

### Requirement: Secrets stay out of the repository
ERP and Gemini credentials SHALL be read from a local environment file that is ignored by git; the repository SHALL ship an example file with empty values.

#### Scenario: Repository contains no key
- **WHEN** the tracked files are searched for the publishable key prefix
- **THEN** no match is found
