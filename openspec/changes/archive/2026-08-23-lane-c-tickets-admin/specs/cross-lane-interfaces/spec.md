## ADDED Requirements

### Requirement: Session role comes from the session
The portal SHALL expose a single session-user resolver, distinct from the tenant-identity resolver, that derives the caller's user identifier, email, role (`tenant` or `manager`) and tenant reference from the request session alone, or an explicit "no identity" result when the request carries no valid session. The tenant reference SHALL be absent for a manager. The resolver SHALL be the only source of role for authorisation decisions, SHALL NOT accept a role from a URL, query string, form body, header or cookie value under the caller's control, and the returned shape SHALL NOT change once this change is applied.

#### Scenario: Manager session
- **WHEN** the resolver is called on a request whose session belongs to a manager user
- **THEN** it returns that user's identifier and email with role `manager` and no tenant reference

#### Scenario: Tenant session
- **WHEN** the resolver is called on a request whose session belongs to a tenant user
- **THEN** it returns role `tenant` together with that user's own tenant reference

#### Scenario: Anonymous request
- **WHEN** the resolver is called on a request with no session, an expired session or an unknown session
- **THEN** it returns the "no identity" result

#### Scenario: Role is not derivable from the tenant seam
- **WHEN** an authorisation decision needs to know whether the caller is a manager
- **THEN** it consults this resolver, because the tenant-identity shape carries no role and a manager has no tenant reference

#### Scenario: A lane narrows the contract
- **WHEN** an implementation drops a field from the returned shape
- **THEN** the contract check that runs in `npm test` fails
