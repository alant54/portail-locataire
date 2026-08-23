# Cross-Lane Interfaces Specification

## Purpose

Fixes the two seams where the parallel lanes meet — how the portal learns which tenant is asking, and how a management screen triggers a sync — so that each lane can replace the behaviour behind a seam without any other lane changing a line.

## Requirements

### Requirement: Tenant identity comes from the session
The portal SHALL expose a single tenant-identity resolver that derives the caller's identity from the request session alone. It SHALL return the caller's user identifier together with the business references `tenant_ref`, `lease_ref` and `unit_ref` (ERP `external_ref` values, not UUIDs), or an explicit "no identity" result when the request carries no valid session. The resolver SHALL NOT accept a tenant, lease or unit reference from a URL, query string, form body or header, and the returned shape SHALL NOT change once this change is applied.

#### Scenario: Authenticated request
- **WHEN** the resolver is called on a request whose session belongs to a tenant user
- **THEN** it returns that user's identifier and the `tenant_ref`, `lease_ref` and `unit_ref` of that user's own active lease

#### Scenario: Anonymous request
- **WHEN** the resolver is called on a request with no session, an expired session or an unknown session
- **THEN** it returns the "no identity" result and no tenant references

#### Scenario: Forged reference is ignored
- **WHEN** a request supplies a `tenant_ref` in its URL or body that differs from the session's tenant
- **THEN** the resolver still returns the session's own references and the supplied value has no effect

#### Scenario: Behaviour is replaced without changing callers
- **WHEN** the placeholder implementation is replaced by the session-backed one
- **THEN** every consuming module type-checks and runs unchanged

### Requirement: Sync is triggered through one summarised entry point
The portal SHALL expose a single entry point that runs an incremental sync and resolves to a summary containing the run identifier, the number of events applied, the cursor value before and after the run, and a terminal status of success or failure with an error message when it failed. Every invocation SHALL record one corresponding run row in `sync_runs`. Callers SHALL be able to render the summary without reading ERP or sync internals, and the summary shape SHALL NOT change once this change is applied.

#### Scenario: Successful run
- **WHEN** the entry point is invoked and the sync completes
- **THEN** it resolves to a summary with a success status, the applied event count, the before and after cursor values, and a matching `sync_runs` row exists

#### Scenario: Failed run
- **WHEN** the sync fails partway through
- **THEN** the summary carries a failure status and an error message, the after-cursor equals the before-cursor, and a `sync_runs` row records the failure

#### Scenario: Management screen renders the summary
- **WHEN** a management screen invokes the entry point and displays the returned summary
- **THEN** it needs no knowledge of the ERP client, the event pagination or the cursor storage

### Requirement: Seam contracts are frozen and enforced
Both seams SHALL be declared as exported types in the shared source tree before any lane starts, and a check that runs in `npm test` SHALL fail if either returned shape loses a field or changes a field's type.

#### Scenario: A lane narrows a contract
- **WHEN** an implementation drops a field from either returned shape
- **THEN** the contract check fails
