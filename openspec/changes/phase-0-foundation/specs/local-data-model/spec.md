## Purpose

Defines the local SQLite database that mirrors the read-only ERP and stores everything the portal itself creates, so that sync, tenant product and management screens share one contract.

## ADDED Requirements

### Requirement: Mirror tables are keyed by ERP identity
Every mirrored ERP collection (management companies, portfolios, properties, buildings, rental units, parties, leases, lease parties, lease objects, rent terms, tenant account entries, payment plans, meter points, meter readings, planned maintenance) SHALL be stored in its own table whose primary key is the ERP UUID `id`. Rows that carry an `external_ref` in the ERP SHALL keep it in a unique column. Every mirror row SHALL keep `source_revision`, `updated_at`, `archived_at` and a local `synced_at`.

#### Scenario: Same ERP row written twice
- **WHEN** a row with an already-stored `id` is written again
- **THEN** the existing row is updated in place and the table row count does not change

#### Scenario: Lookup by business reference
- **WHEN** a lease is looked up by `external_ref` `BAIL-000001`
- **THEN** exactly one row is returned

### Requirement: Portal-owned tables exist
The database SHALL contain the portal-owned tables `users` (with `role` tenant|manager and `tenant_ref` linking to a party `external_ref`), `sessions`, `login_events`, `tickets` (with `tenant_ref`, `lease_ref`, `unit_ref`, `status` open|in_progress|closed), `ticket_comments` (with `author_kind` tenant|manager and `kind` comment|status), `sync_cursor` (single row holding the last processed `change_id`) and `sync_runs`.

#### Scenario: Fresh database is migrated
- **WHEN** the migration command runs against an empty database file
- **THEN** all mirror and portal-owned tables exist and the command exits 0

#### Scenario: Migration is re-run
- **WHEN** the migration command runs a second time
- **THEN** it exits 0 without error and without data loss

### Requirement: Secrets stay out of the repository
ERP and Gemini credentials SHALL be read from a local environment file that is ignored by git; the repository SHALL ship an example file with empty values.

#### Scenario: Repository contains no key
- **WHEN** the tracked files are searched for the publishable key prefix
- **THEN** no match is found
