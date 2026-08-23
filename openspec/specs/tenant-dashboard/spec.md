# Tenant Dashboard Specification

## Purpose

Shows a logged-in tenant their housing situation at a glance: where they live, under which lease, what they owe, and what is coming next.

## Requirements

### Requirement: Dashboard shows home and lease
The dashboard SHALL display the tenant's rental unit (label, address, locality) and the lease linked to it (reference, status, start date, end or notice date when present, current rent from rent terms).

#### Scenario: Active lease
- **WHEN** a tenant with an active lease opens the dashboard
- **THEN** unit label, full address, lease reference, status "actif" and start date are visible

### Requirement: Dashboard shows balance in CHF
The dashboard SHALL show the tenant's balance computed as debits minus credits over the account entries of their lease(s), and the five most recent entries with kind, amount, due date and status. The computation rule (which statuses count) SHALL match the ERP's `tenant-portal-snapshots.balance_chf` for the fixture tenants.

#### Scenario: Balance matches oracle
- **WHEN** the balance is computed for a fixture tenant
- **THEN** it equals the `balance_chf` of that tenant's portal snapshot

#### Scenario: Positive balance
- **WHEN** the tenant owes money
- **THEN** the amount is shown with a clear "à payer" label

### Requirement: Dashboard shows what is coming
The dashboard SHALL show the next due account entry and the next planned maintenance affecting the tenant's unit or building, or an explicit "rien de prévu" when none exists.

#### Scenario: Upcoming maintenance
- **WHEN** a planned maintenance exists for the tenant's building in the future
- **THEN** its date and description are shown

### Requirement: Archived ERP rows are hidden
Mirror rows archived by the ERP (`archived_at`) or deleted by the sync (`deleted_at`) SHALL not appear on the dashboard.

#### Scenario: Archived entry
- **WHEN** an account entry of the tenant is archived or deleted by the sync
- **THEN** it is not listed and not counted in the balance
