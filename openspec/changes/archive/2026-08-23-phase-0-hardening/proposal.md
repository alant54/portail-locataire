## Why

Running the applied `phase-0-foundation` at its real surfaces (dev server, npm scripts, a lane worktree) turned up seven defects the task-level verification never touched. Four are hygiene. The other three are ownership collisions that would not surface until the Phase 2 merge — the exact failure the worktree split exists to prevent, hitting at the worst possible moment.

## What Changes

**Hand-off blockers (a lane cannot start, or two lanes collide):**

- Pre-declare the npm scripts the lanes will need — `sync`, `sync:full` (lane A) and `seed:demo` wired into `setup` (lane B) — pointing at files those lanes will create. Today neither exists, so **both lanes must edit the frozen `package.json`** in separate worktrees.
- Add pass-through `src/app/(tenant)/layout.tsx` and `src/app/(admin)/layout.tsx` with the owning lane named in a header comment. Lane B's task 1.3 requires role checks in both, but `(admin)/**` belongs to lane C — as it stands lane B must write into lane C's folder.
- Give logout a home in the frozen header nav (a slot the layout renders, filled by lane B) so a Logout scenario does not force an edit to a frozen file.
- Copy `.env.local` into the `lane-a` worktree. It is correctly gitignored, so lane A — whose entire job is calling the ERP — currently dies on its first `sync:full` with `ERP_API and ERP_PUBLISHABLE_KEY must be set`.

**Hygiene:**

- Untrack `tsconfig.tsbuildinfo` and ignore `*.tsbuildinfo`. It is committed, so all three lanes will regenerate and conflict on a build artifact.
- Seed the `sync_cursor` singleton during migration. After a clean `npm run setup` the table holds **zero** rows, though the spec describes it as a single row holding the cursor.
- Fail fast in `seed:fixtures` when the database has not been migrated. Today it emits a 30-line Drizzle stack trace with the real cause — `no such table: management_companies` — buried at the bottom.

**Readiness gate:** a final task that walks each lane's `tasks.md` and confirms every file, export and npm script it names now resolves on `main`.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- none — see below.

Six of the seven items are tooling, git hygiene and folder ownership: no externally observable behaviour changes, so no spec should. The two that *are* behavioural — the `sync_cursor` singleton and the `seed:fixtures` precondition — belong to `local-data-model` and `demo-fixtures`, capabilities that exist today only as deltas inside the unarchived `phase-0-foundation`. `openspec/specs/` is empty, so there is no base to diff against. Those two are therefore folded into phase 0's own delta specs rather than duplicated here, and this change sets `skip_specs: true`.

## Impact

- `.gitignore`, `package.json` (scripts only), `scripts/migrate.ts`, `scripts/seed-fixtures.ts`.
- New: `src/app/(tenant)/layout.tsx`, `src/app/(admin)/layout.tsx`.
- `src/app/layout.tsx` — one nav slot, then frozen again.
- `docs/PLAN.md` §5 collision map, `CLAUDE.md` hand-off notes.
- `openspec/changes/phase-0-foundation/specs/{local-data-model,demo-fixtures}/spec.md` — two requirements folded in.
- Blocks lanes A, B and C: this should land before any lane agent starts.
