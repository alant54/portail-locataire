## Why

The manual pre-delivery checklist (`docs/TEST-CHECKLIST.md`) was verified against the code and three boxes cannot be ticked: the per-account failure counter on `/admin/logins` is always 0, a freshly created request has an empty timeline, and `npm run sync:full` without ERP keys dies with a raw stack trace. All three are visible in the graded demo path ("qui s'est connecté", "une action réelle", "ça se lance chez nous"); each is a small, contained fix.

## What Changes

- Failed logins against an **existing** account are attributed to that account, so the « Comptes » table's failure count reflects the wrong-password attempt the evaluators will make. Unknown-email failures stay unattributed (they still appear in the event list as « Échouée »).
- Creating a request appends a `created` entry to its timeline, so the tenant and the manager both see « Demande ouverte » as the first event instead of « Pas encore de réponse » / « Rien depuis l'ouverture ».
- A full import that cannot build the ERP client (missing `.env.local`) is recorded as a `failed` run with the configuration error, and `npm run sync:full` prints that one-line error, matching the incremental path.
- `docs/TEST-CHECKLIST.md` is corrected where it described behaviour the app never had (`/bail` list vs redirect, lease detail sections, inbox columns, UUID ticket ids, unbuilt Gemini bonus) and gains the boxes found missing (dashboard extras, manager-on-tenant-URL case, `.next` cleanup, `sync_runs` side effects).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `tenant-auth`: "Successful logins are recorded" becomes "Logins are recorded" — failures are recorded too, attributed to the account when the email matches one.
- `tenant-requests`: request creation is itself a timeline event.
- `erp-sync`: a run that fails before reaching the ERP (missing configuration) is still recorded as a failed run.

## Impact

- `src/auth/login.ts`, `src/tickets/management-queries.ts` (+ its test, which currently masks the bug by inserting a failure with a user id the real path never produces).
- `src/tickets/service.ts` (`createTicket`), `src/tickets/labels.ts` if a new timeline kind needs a label, the two ticket detail pages' empty states.
- `src/sync/full-import.ts`, `scripts/sync.ts`.
- `docs/TEST-CHECKLIST.md`. No schema change, no new dependency, no frozen contract touched.
