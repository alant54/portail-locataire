## 1. Unblock the lanes (do these before any lane agent starts)

- [x] 1.1 Pre-declare the lanes' npm scripts in `package.json`: `sync` → `tsx scripts/sync.ts`, `sync:full` → `tsx scripts/sync.ts --full` (lane A), `seed:demo` → `tsx scripts/seed-demo.ts` (lane B), and extend `setup` to `db:migrate && seed:fixtures && seed:demo`; verify `npm run sync` fails only with "Cannot find module scripts/sync.ts" and `npm run setup` still seeds 334 fixture rows once `seed:demo` is tolerated as absent (or is a no-op stub)
- [x] 1.2 Add pass-through `src/app/(tenant)/layout.tsx` and `src/app/(admin)/layout.tsx`, each rendering `{children}` with a header comment naming its owning lane (B and C respectively); verify `/`, `/tickets` and `/admin` still return 200 and the nav still renders on each
- [x] 1.3 Add an empty `<div id="session-slot">` to the nav in `src/app/layout.tsx` for lane B's login/logout control, and note in the file that this is the only sanctioned edit point; verify the three routes still render and the slot is present in the HTML
- [x] 1.4 Copy `.env.local` into `/home/vscode/wt-a` (lane A only); verify `git -C /home/vscode/wt-a status --short` stays clean and `node -e` reading it from that directory sees both ERP variables

## 2. Hygiene

- [x] 2.1 Add `*.tsbuildinfo` to `.gitignore` and `git rm --cached tsconfig.tsbuildinfo`; verify `git ls-files | grep tsbuildinfo` is empty and `git check-ignore -v tsconfig.tsbuildinfo` matches — **partially applied already**: `.gitignore` is edited and the deletion is staged but uncommitted
- [x] 2.2 Seed the `sync_cursor` singleton in `scripts/migrate.ts` (`INSERT OR IGNORE INTO sync_cursor (id) VALUES (1)`); verify a fresh `npm run setup` leaves exactly one row with `last_change_id = 0`, and running setup twice still leaves one
- [x] 2.3 Make `scripts/seed-fixtures.ts` check the schema is present before writing and fail with one actionable line ("database not migrated — run `npm run db:migrate`"); verify seeding an unmigrated database prints that line and no Drizzle stack trace

## 3. Fold the two behavioural fixes into phase 0's specs

- [x] 3.1 In `phase-0-foundation/specs/local-data-model/spec.md`, extend the portal-owned-tables requirement so the migration SHALL create the `sync_cursor` singleton, with a scenario asserting exactly one row after a fresh migration; verify `openspec validate phase-0-foundation --strict` passes
- [x] 3.2 In `phase-0-foundation/specs/demo-fixtures/spec.md`, add a requirement that seeding an unmigrated database SHALL fail with an actionable message and no partial writes, with a scenario; verify `openspec validate phase-0-foundation --strict` passes

## 4. Readiness gate

- [x] 4.1 Update `docs/PLAN.md` §5 collision map and `CLAUDE.md` with the settled ownership: who owns each route-group layout, the `session-slot` rule, the pre-declared scripts and their owning lanes; verify no lane's `tasks.md` contradicts the map
- [x] 4.2 Walk each of the three lane `tasks.md` files and confirm every file, export and npm script named in them resolves on `main` (or is explicitly that lane's to create); verify by listing each unresolved name with the lane that owns it — the list must be empty of *shared* files, and hand anything it turns up to §5

## 5. Amend the lane task files

§1–§2 fix the ground the lanes stand on; these fix the instructions, which still
encode the pre-hardening assumptions. Without them a lane is told to do the very
thing this change exists to prevent — and in 5.2's case, a gate simply vanishes.

- [x] 5.1 Reword lane B task 1.3 to gate **only** `(tenant)`: `middleware.ts` plus the session check in `src/app/(tenant)/layout.tsx`, with the manager gate explicitly handed to lane C; verify the task no longer names `(admin)` and lane B's owned-paths list in its proposal still matches
- [x] 5.2 **Add a new task to lane C** for the manager gate in `src/app/(admin)/layout.tsx` (redirect or 404 unless `role = manager`), because today it exists nowhere: lane B's 1.3 was its only home and 5.1 removes it, while lane C has no gating task at all — leaving `/admin` open to any signed-in tenant; verify lane C's `tasks.md` covers the gate and `management-screens` spec gains a scenario for a tenant hitting `/admin`
- [x] 5.3 Drop "wired into `npm run setup`" from lane B task 1.4 — hardening 1.1 already wires `seed:demo`, so lane B only writes `scripts/seed-demo.ts`; verify the task no longer implies a `package.json` edit
- [x] 5.4 Fix lane A task 2.1: drop "add it to `.env.example`" (already present at `.env.example:8`), and add a task for `scripts/sync.ts` — the CLI entry point `npm run sync` / `sync:full` now point at, which no lane task currently asks anyone to create; verify `npm run sync` resolves to a file lane A is tasked with writing
- [ ] 5.5 Re-validate every change (`openspec validate <name> --strict` for all five), then fast-forward the three worktrees to `main` (`git -C /home/vscode/wt-X merge --ff-only main`) and boot one on its assigned port; verify `git worktree list` shows all four at the same commit, the amended lane tasks are present in each worktree, and the lane's dev server returns 200 on `/`
