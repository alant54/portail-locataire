## MODIFIED Requirements

### Requirement: Tenant creates a request
A logged-in tenant SHALL be able to submit a request with a category (e.g. plomberie, chauffage, clés, autre), a title and a description. The request SHALL be stored with status `open`, creation time and the tenant's tenant, lease and unit references taken from the session. Creation SHALL be the first entry of the request's timeline, so the history is never empty.

#### Scenario: Successful creation
- **WHEN** a tenant submits a valid request
- **THEN** a ticket row exists with status `open`, the tenant's references, and the tenant is redirected to the request detail

#### Scenario: Creation visible in the timeline
- **WHEN** a tenant opens a request they just created, or a manager opens it from the inbox
- **THEN** the timeline shows a « Demande ouverte » entry with the creation time, and no empty-state text

#### Scenario: Missing title
- **WHEN** the title is empty
- **THEN** no ticket is created and the form shows the error

#### Scenario: Forged reference
- **WHEN** the submitted form contains a `lease_ref` of another tenant
- **THEN** the stored ticket carries the session tenant's references, not the submitted one
