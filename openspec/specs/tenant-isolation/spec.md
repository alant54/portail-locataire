# Tenant Isolation Specification

## Purpose

Guarantees a logged-in tenant can only ever read data belonging to their own ERP tenant, whatever identifiers they put in URLs or forms.

## Requirements

### Requirement: Tenant scope comes from the session only
Every tenant-facing read SHALL derive the tenant reference from the authenticated session. Identifiers supplied in the URL, query string or body SHALL only ever narrow results within that tenant's data.

#### Scenario: Foreign lease reference in URL
- **WHEN** tenant TEN-00001 is logged in and requests a page or API with lease reference belonging to TEN-00002
- **THEN** the response is not-found and contains no data of TEN-00002

#### Scenario: Foreign ticket identifier
- **WHEN** tenant TEN-00001 requests the ticket detail of a ticket created by TEN-00002
- **THEN** the response is not-found

### Requirement: Isolation is covered by an automated test
An automated test SHALL log in as two different tenants and assert that each one cannot read the other's lease, account entries or tickets.

#### Scenario: Test suite
- **WHEN** the test suite runs
- **THEN** the isolation test passes and is named in the report as the evidence for checklist item 3
