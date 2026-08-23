## Purpose

Provides a small, coherent snapshot of ERP data so the tenant and management lanes can be developed and demoed without network access or a completed sync.

## ADDED Requirements

### Requirement: Fixtures cover a tenant end-to-end
The fixtures SHALL contain, for at least three tenants with an active lease, every record needed to render the dashboard: party, lease, lease parties, lease objects, rental unit, building, property, rent terms, tenant account entries (debits and credits) and at least one planned maintenance. The fixtures SHALL use the exact ERP JSON shape so the seeder and the sync write identical rows.

#### Scenario: Seeding an empty database
- **WHEN** the fixtures seed command runs on a migrated, empty database
- **THEN** each fixture tenant has a party, an active lease, a rental unit with address and account entries in the database

#### Scenario: Seeding twice
- **WHEN** the fixtures seed command runs a second time
- **THEN** row counts are unchanged

### Requirement: Fixtures include a balance oracle
For each fixture tenant the `tenant-portal-snapshots` record SHALL be stored alongside, so the computed balance can be compared to the ERP's `balance_chf`.

#### Scenario: Oracle available
- **WHEN** a test reads the fixtures for any seeded tenant (e.g. `TEN-00005`)
- **THEN** a snapshot with `balance_chf` is present for that tenant

### Requirement: Seeding refuses an unprepared database
The fixtures seed command SHALL verify the schema is present before writing anything. When the database has not been migrated it SHALL fail with a single actionable message naming the command to run, SHALL leave no partial data behind, and SHALL exit non-zero so that a chained setup aborts rather than continuing.

#### Scenario: Seeding a database that was never migrated
- **WHEN** the fixtures seed command runs against a database file with no schema
- **THEN** it prints one message naming the migration command, writes nothing, and exits non-zero

#### Scenario: Setup chain aborts
- **WHEN** the seed step fails inside the setup chain
- **THEN** no later step of the chain runs
