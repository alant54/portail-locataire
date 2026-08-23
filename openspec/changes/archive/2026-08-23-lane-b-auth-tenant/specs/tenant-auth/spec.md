## Purpose

Lets a tenant or a manager sign in with a demo account, keeps a session, and records each login so the management side can see who connected.

## ADDED Requirements

### Requirement: Login with email and password
The system SHALL authenticate a user by email and password against locally stored, hashed credentials and open a session cookie on success. On failure it SHALL show a generic error without revealing whether the email exists.

#### Scenario: Valid demo credentials
- **WHEN** a tenant submits the demo email and password
- **THEN** a session is created and the tenant is redirected to their dashboard

#### Scenario: Wrong password
- **WHEN** a user submits a wrong password
- **THEN** no session is created and a generic "identifiants invalides" message is shown

### Requirement: Successful logins are recorded
Every successful login SHALL append a login event with user, timestamp and user agent.

#### Scenario: Login recorded
- **WHEN** a user logs in
- **THEN** a new login event for that user exists with the current timestamp

### Requirement: Areas are gated by role
Tenant pages SHALL require a tenant session; management pages SHALL require a manager session. Unauthenticated requests SHALL be redirected to the login page.

#### Scenario: Tenant opens a management page
- **WHEN** a logged-in tenant requests a management URL
- **THEN** the request is refused with not-found or forbidden and no management data is returned

#### Scenario: Logout
- **WHEN** a user logs out
- **THEN** the session is invalidated and tenant pages redirect to login

### Requirement: Demo accounts exist
The setup SHALL create at least two tenant accounts linked to distinct ERP tenants and one manager account, with credentials listed in the README.

#### Scenario: Fresh setup
- **WHEN** the setup command completes on a fresh database
- **THEN** the README credentials log in successfully
