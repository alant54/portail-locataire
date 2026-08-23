## 1. Login failure attribution

- [x] 1.1 In `src/auth/login.ts`, record `userId` as the matched account's id on wrong-password failures (null when the email is unknown); verify with a new `login.test.ts` case asserting the `login_events` row for each failure kind and the unchanged generic message.
- [x] 1.2 In `src/tickets/management-queries.test.ts`, produce failures through `login()` instead of hand-inserted rows and assert the per-account `failures` count is 1 after one wrong password and 0 for an unknown email; verify `npx vitest run src/tickets src/auth` passes.

## 2. Request creation in the timeline

- [x] 2.1 In `src/tickets/service.ts`, insert a `created` timeline row in the same transaction as the ticket; verify with a service test that `listTimeline` returns exactly one `created` entry right after `createTicket`.
- [x] 2.2 Add the « Demande ouverte » label for kind `created` and render it in `src/app/(tenant)/tickets/[id]/page.tsx` and `src/app/(admin)/admin/requests/[id]/page.tsx`; verify `npm run typecheck` passes and a fresh ticket shows no empty-state text on either page (`npm run dev`, Léa then gérance).

## 3. Full import failure is recorded

- [x] 3.1 In `src/sync/full-import.ts`, construct the ERP client inside the run's try so a missing configuration yields a `failed` run with the error message; verify with a test that runs `fullImport` with no env and no injected client against `createTestDb` and asserts the `sync_runs` row.
- [x] 3.2 Verify `DATABASE_URL=<scratch>.db npm run sync:full` with `ERP_API` unset prints the one-line configuration error, exits non-zero, and prints no stack trace.

## 4. Checklist and regression pass

- [x] 4.1 Correct `docs/TEST-CHECKLIST.md`: `/bail` redirects with one lease; lease detail sections are Conditions / Loyer / Écritures / Solde; inbox shows Logement not bail; ticket ids are UUIDs; manager on `/` is redirected to `/admin`; §8 marked « non livré → coupe en §6 »; add boxes for dashboard extras (écritures en retard, prochaine échéance, prochain entretien), manager opening a tenant URL, `rm -rf .next` before typecheck, and `npm run setup` before the final pass; verify every box maps to behaviour present in the code.
- [x] 4.2 Run `npm test`, `npm run typecheck` and `openspec validate fix-demo-gaps --strict`; verify all green.
