## Purpose

Gives the management company a minimal view of portal activity: who connected, which requests arrived and how the ERP sync is doing — without being a back-office.

## ADDED Requirements

### Requirement: Logins screen
Managers SHALL see the most recent login events (user email, tenant reference, time) and, per account, the last login time.

#### Scenario: Tenant just logged in
- **WHEN** a tenant logs in and a manager opens the logins screen
- **THEN** that login appears at the top with its timestamp

### Requirement: Requests inbox
Managers SHALL see all requests across tenants with tenant, unit, category, status and date, filter by status, change a request's status (open → in_progress → closed) and add a management comment visible to the tenant.

#### Scenario: Status change
- **WHEN** a manager moves a request to `in_progress`
- **THEN** the tenant's detail page shows the new status and the change time

#### Scenario: Filter by status
- **WHEN** the manager filters on `open`
- **THEN** only open requests are listed

### Requirement: Sync screen
Managers SHALL see the current sync cursor, the last runs (time, kind, events applied, status, error) and row counts per mirror table, and SHALL be able to trigger an incremental sync from the screen.

#### Scenario: Relaunch
- **WHEN** the manager clicks "Relancer la synchro"
- **THEN** an incremental sync runs, a new run record is shown and row counts are not duplicated

### Requirement: Management area is manager-only
The management screens SHALL be inaccessible to tenant and anonymous sessions.

#### Scenario: Tenant attempts access
- **WHEN** a tenant session requests a management screen
- **THEN** the response is not-found or forbidden

### Requirement: Management screens are reachable only by managers
Every route under the management area SHALL be served only to a session whose user has the `manager` role. Any other caller — anonymous, expired session, or an authenticated tenant — SHALL receive a not-found response rather than a redirect or a permission error, so that the existence of the management area is not disclosed. The check SHALL be enforced for the whole area at once, not per page, so a screen added later cannot be left unguarded.

#### Scenario: Tenant tries the management area
- **WHEN** a signed-in tenant requests any management route
- **THEN** the response is 404 and no management data appears in the body

#### Scenario: Anonymous visitor tries the management area
- **WHEN** a request with no valid session reaches any management route
- **THEN** the response is 404

#### Scenario: Manager is admitted
- **WHEN** a session whose user has the `manager` role requests a management route
- **THEN** the screen renders
