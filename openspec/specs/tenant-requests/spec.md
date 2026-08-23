# Tenant Requests Specification

## Purpose

Gives the tenant one real action: opening a request about their home and following it until it is closed, with the request stored in the portal's own database.

## Requirements

### Requirement: Tenant creates a request
A logged-in tenant SHALL be able to submit a request with a category (e.g. plomberie, chauffage, clés, autre), a title and a description. The request SHALL be stored with status `open`, creation time and the tenant's tenant, lease and unit references taken from the session.

#### Scenario: Successful creation
- **WHEN** a tenant submits a valid request
- **THEN** a ticket row exists with status `open`, the tenant's references, and the tenant is redirected to the request detail

#### Scenario: Missing title
- **WHEN** the title is empty
- **THEN** no ticket is created and the form shows the error

#### Scenario: Forged reference
- **WHEN** the submitted form contains a `lease_ref` of another tenant
- **THEN** the stored ticket carries the session tenant's references, not the submitted one

### Requirement: Tenant follows their requests
The tenant SHALL see a list of their own requests with status and date, and a detail page with the status history and comments from both tenant and management. The tenant SHALL be able to add a comment on an open or in-progress request.

#### Scenario: List shows own requests only
- **WHEN** the tenant opens "Mes demandes"
- **THEN** only requests created by this tenant are listed, newest first

#### Scenario: Tenant comments
- **WHEN** the tenant posts a comment on their open request
- **THEN** the comment appears in the detail with author "locataire" and timestamp
