## Context

`phase-0-foundation` is applied (18/18) and three worktrees exist at `/home/vscode/wt-{a,b,c}`, but no lane has started. See proposal.md – Why for how the seven defects were found. The constraint that shapes every decision below: three agents work in separate worktrees and merge once, near the end, under time pressure. A shared file edited in two worktrees is not a small problem at T+2:30.

## Goals / Non-Goals

**Goals:**
- No lane needs to edit a file another lane also edits.
- Lane A can authenticate against the ERP the moment it starts.
- A lane's `tasks.md` names only things that already resolve on `main`.

**Non-Goals:**
- Any lane's actual work. This change creates empty seats, not implementations.
- Revisiting the frozen schema or the seam types — those held up under verification.

## Decisions

- **Pre-declare npm scripts for files that do not exist yet.** `package.json` gains `sync`, `sync:full` and `seed:demo` pointing at `scripts/sync.ts` and `scripts/seed-demo.ts`, which lanes A and B create. The script fails with "module not found" until its lane lands — an honest, obvious failure. Alternative: let each lane add its own entry — rejected, that is precisely the two-worktree edit of one frozen file we are trying to avoid. Alternative: a dispatcher script that shells out — rejected, indirection for no gain.

- **`(tenant)` and `(admin)` get pass-through layouts now, each naming its owner in a header comment.** They render `{children}` and nothing else. Lane B fills the tenant one with the session gate; lane C fills the admin one with the `role = manager` gate. Alternative: leave lane B to create `(admin)/layout.tsx` as its task says — rejected, `(admin)/**` is lane C's folder and the file would be authored twice. This also settles the ambiguity in lane B's task 1.3, which assumed both layouts already existed.

- **Auth actions get a reserved slot in the frozen nav.** The root layout renders a `<div id="session-slot">` that lane B fills with its login/logout control via its own component. The nav itself stays frozen. Alternative: let lane B edit `layout.tsx` — rejected, it is the one file all three lanes render through.

- **The `sync_cursor` singleton is created by the migration script, not by a Drizzle migration.** `scripts/migrate.ts` runs `INSERT OR IGNORE INTO sync_cursor (id) VALUES (1)` after applying migrations. Alternative: a data migration in `drizzle/` — rejected, drizzle-kit generates schema migrations from `schema.ts`, and hand-editing generated SQL is a trap for the next `db:generate`.

- **`.env.local` is copied into `wt-a` only.** Lanes B and C never call the ERP. Copying it everywhere widens the blast radius of a secret for no benefit. It stays gitignored in every worktree.

- **The readiness gate is a task, not a script.** One pass over the three `tasks.md` files checking that each named file, export and npm script resolves. Alternative: automate it — rejected, it runs once; the value is a human reading the list, not a tool.

## Risks / Trade-offs

- [A pre-declared script fails confusingly before its lane lands] → each entry is named in `CLAUDE.md` with the lane that owns it, and the failure mode ("module not found until lane A lands") is written next to it.
- [The `session-slot` div is a guess at lane B's needs] → it is one empty element; if lane B needs something different, changing it is a one-line edit on `main` merged down, which is the existing frozen-file process.
- [Copying `.env.local` into a worktree spreads a secret] → it is a publishable read-only key on fictive data, already on this machine, and gitignored in the worktree too.
- [This change delays the lanes by ~20 min] → it is cheaper than one three-way merge conflict on `package.json` during the integration window.

## Migration Plan

Land on `main`, then fast-forward all three worktrees (`git -C /home/vscode/wt-X merge --ff-only main`). The lane branches have no commits of their own yet, so this is a clean fast-forward — and it is the last moment where that is true.
