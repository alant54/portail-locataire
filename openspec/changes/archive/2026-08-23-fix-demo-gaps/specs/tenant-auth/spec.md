## MODIFIED Requirements

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
