## Why

Checklist items #2 and #5: the tenant must perform one real action that writes to our database (open and follow a request), and the management side needs two or three screens — who logged in, which requests arrived, where the sync stands. This lane builds the ticket domain end-to-end and the management area on top of `phase-0-foundation`, consuming `getCurrentTenant()` (lane B) and `runIncrementalSync()` (lane A).

## What Changes

- Tenant side: "Mes demandes" list, "Nouvelle demande" form (category, title, description), request detail with status timeline and comments.
- Tickets are stamped with the tenant's `tenant_ref`, `lease_ref`, `unit_ref` taken from the session, never from the form.
- Management side (role manager): Connexions (latest logins), Demandes (inbox with status filter, status change, manager comment), Synchronisation (cursor, last runs, per-table counts, "Relancer la synchro" button).

## Capabilities

### New Capabilities
- `tenant-requests`: a tenant creates, lists and follows maintenance/service requests with comments.
- `management-screens`: managers see logins, handle the request inbox and monitor/relaunch the sync.

### Modified Capabilities
- none

## Impact

- Owns `src/tickets/**`, `src/app/(tenant)/tickets/**`, `src/app/(admin)/**`.
- Writes `tickets`, `ticket_comments`; reads `login_events`, `sync_runs`, `sync_cursor`, mirror table counts.
- Calls `runIncrementalSync()` from lane A (stub until merged) and `getCurrentTenant()` from lane B (stub until merged).
