## MODIFIED Requirements

### Requirement: Every sync run is recorded
Each full or incremental run SHALL be recorded with start/finish time, kind, number of events or rows applied, status and error message, so the management side can display sync state. A run that fails before contacting the ERP — including a missing ERP configuration — SHALL be recorded the same way, with status `failed` and the error message, and the command line SHALL report that message on one line without a stack trace.

#### Scenario: Successful run visible
- **WHEN** an incremental sync completes
- **THEN** a run record exists with status `ok`, the number of applied events and the resulting cursor

#### Scenario: Full import without ERP keys
- **WHEN** `npm run sync:full` runs with no `ERP_API` / `ERP_PUBLISHABLE_KEY`
- **THEN** a `full` run record with status `failed` and the configuration error exists, the command exits non-zero after printing that error, and the mirror is unchanged
