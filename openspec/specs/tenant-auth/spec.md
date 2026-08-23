# Tenant Authentication Specification

## Purpose

Lets a tenant or a manager sign in with a demo account, keeps a session, and records each login so the management side can see who connected.

## Requirements

### Requirement: Login with email and password
The system SHALL authenticate a user by email and password against locally stored, hashed credentials and open a session cookie on success. On failure it SHALL show a generic error without revealing whether the email exists.

#### Scenario: Valid demo credentials
- **WHEN** a tenant submits the demo email and password
- **THEN** a session is created and the tenant is redirected to their dashboard

#### Scenario: Wrong password
- **WHEN** a user submits a wrong password
- **THEN** no session is created and a generic "identifiants invalides" message is shown

### Requirement: Logins are recorded
Every login attempt SHALL append a login event with outcome, timestamp, submitted email, IP and user agent. A successful attempt SHALL reference the authenticated user. A failed attempt SHALL reference the account whose email was submitted when such an account exists, and no account otherwise. The generic error shown to the user SHALL stay identical in both failure cases.

#### Scenario: Login recorded
- **WHEN** a user logs in
- **THEN** a new `success` login event for that user exists with the current timestamp

#### Scenario: Wrong password on an existing account
- **WHEN** a user submits the email of an existing account with a wrong password
- **THEN** a `failure` login event referencing that account is recorded, and the per-account failure count on the logins screen increases by one

#### Scenario: Unknown email
- **WHEN** a user submits an email that matches no account
- **THEN** a `failure` login event with the submitted email and no account reference is recorded, and no account's failure count changes

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
