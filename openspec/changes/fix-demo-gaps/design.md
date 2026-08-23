## Context

See proposal.md. Three independent, local defects found while verifying `docs/TEST-CHECKLIST.md`:

- `src/auth/login.ts` stores `userId: null` on every failure; `listAccountsWithLastLogin` (`src/tickets/management-queries.ts`) joins `login_events` on `user_id`, so the failure sum is structurally 0. Its unit test inserts a failure *with* a user id, which the real path never produces.
- `createTicket` (`src/tickets/service.ts`) writes no `ticket_comments` row; the timeline only ever holds `comment` and `status` kinds.
- `src/sync/full-import.ts` calls `erp()` before `startRun`/`try`, unlike `src/sync/incremental.ts` which builds the client inside the try and records the failure.

Constraints: `src/db/schema.ts` is frozen — no new column or table; UI copy in French; every test uses `createTestDb`.

## Goals / Non-Goals

**Goals:** make the three checklist boxes tickable with the smallest diff; keep the generic login error unchanged.

**Non-Goals:** rate limiting or lockout on failures; attachments or other timeline kinds; changing what `/admin/sync` displays.

## Decisions

- **Attribute failures by user id, only when the account exists.** `login.ts` already resolves the user before verifying the password; pass `user?.id ?? null` instead of `ok ? user.id : null`. Alternative — join `login_events` on `email` in the aggregate — would also count unknown-email attempts typed against a near-miss address and couples the aggregate to a free-text column; rejected. Attribution is invisible to the end user (the message stays generic; `login_events` is manager-only), so it discloses nothing.
- **Fix the masking test instead of working around it.** `management-queries.test.ts` must insert failures through the real `login()` path (or with the user id semantics the real path now produces) so a regression is caught.
- **Creation as a timeline row, not a synthetic entry.** Insert a `ticket_comments` row of kind `created` (author role `tenant`, empty body) inside `createTicket`, in the same transaction as the ticket. Alternative — have both detail pages prepend a fake "opened at `created_at`" entry — duplicates presentation logic in two lanes' pages and leaves the data empty; rejected. The timeline already switches on `kind`, so `created` gets its own French label (« Demande ouverte ») and the empty-state branches become unreachable for new tickets. Existing tickets in `data/app.db` keep an empty history; `npm run setup` rebuilds the demo DB anyway.
- **Move `erp()` inside the run in `full-import.ts`**, mirroring `incremental.ts`: create the run record first, construct the client in the `try`, record `failed` + message in the `catch`, rethrow or return the summary as today. `scripts/sync.ts` then already prints the one-line failure for `full` as it does for `incremental`.

## Risks / Trade-offs

- [A `created` kind reaches code that assumes `comment | status`] → grep `kind` switches in both detail pages and `labels.ts`; TypeScript narrows the union so `tsc` flags misses.
- [Tests that count timeline rows after creation now see one more row] → adjust expectations; that is the intended behaviour change.
- [A failed `full` run now leaves a `sync_runs` row in `data/app.db`] → same as incremental today; the checklist already tells the tester to rebuild with `npm run setup` before the final pass.
