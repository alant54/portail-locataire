# Tenant Portal Challenge — Work Split & Parallel-Agent Plan

Status: **planning** (no code yet). This file is the reference for the OpenSpec
changes that will be created later — one per lane. Source of truth for the brief:
`docs/Instruction..txt`, `docs/API.txt`, contract snapshot in `docs/erp/openapi.json`.

---

## 1. What is being built

A tenant portal on top of a **read-only** property-management ERP, with a local
SQLite database for everything we write, and 2–3 management screens.

Evaluated on 6 checklist items (the only "must"):

| # | Checklist item (from brief) | Lane |
|---|---|---|
| 1 | A tenant logs in and understands their situation in 10 s | B |
| 2 | One real action that writes to our DB (open / follow a request) | C |
| 3 | Tested: impossible to reach another tenant's data | B (+ test) |
| 4 | Sync can be re-run without duplicating data | A (+ admin screen in C) |
| 5 | 2–3 management screens (logins, requests, sync status) | C |
| 6 | Runnable by them + demo account; report says what was cut and why | D |

Guiding rule from the brief: **a narrow, solid scope beats a wide, wobbly one.**

---

## 2. Decisions already taken

| Topic | Decision | Why |
|---|---|---|
| Stack | **Next.js (App Router) + TypeScript + SQLite** (`better-sqlite3`, Drizzle ORM) | Single process, file-based routing → agents work in disjoint folders; Vite port 5173 / Node 22 already in the devcontainer |
| DB | one SQLite file `data/app.db`, schema frozen in Phase 0 | Parallel agents must share one contract |
| Ticket ownership | Lane C owns the ticket domain end-to-end (tenant form + follow page + admin inbox) | Avoids B↔C ping-pong; C only needs `getCurrentTenant()` from B |
| Isolation model | Every tenant query goes through one helper that takes `tenantRef` **from the session**, never from URL/params | Checklist #3 — "on essaiera" |
| Balance | `balance_chf = Σ debit − Σ credit` over `tenant_account_entries` of the tenant's lease(s). The pending-vs-cleared rule is **decided in Lane B** (task 2.3) by matching `tenant-portal-snapshots.balance_chf` for every fixture tenant, then recorded in that lane's `design.md`; Phase 0 only ships the entries table and the snapshot fixtures it needs | The ERP gives an oracle for free — but only Lane B has the query layer to test it against |
| Sync strategy | Full import by collection (limit 1000, offset) → store `max(change_id)` → replay `/v1/sync-events?after=<cursor>&limit=500` → idempotent upsert/delete by **UUID `id`** | ERP relations are UUIDs; `external_ref` kept as display/lookup key |
| Secrets | `.env.local` only (`ERP_API`, `ERP_PUBLISHABLE_KEY`, `GEMINI_API_KEY`). `docs/API.txt` **has been scrubbed** (keys moved to `.env.local`) and stays tracked; `.gitignore` covers `.env*` and `data/*.db` | Brief: keys never in the repo |

### ERP facts discovered (probe on 2026-08-23)

- Envelope: `{ data: [...], meta: { resource, limit, offset, next_offset } }` — paginate until `next_offset === null`.
- Every mirrored row has `id` (UUID), `external_ref` (e.g. `BAIL-000001`, `TEN-00001`, `APT-00001`), `source_revision`, `updated_at`, `archived_at`.
- Foreign keys are UUIDs (`lease_contract_id`, `primary_rental_unit_id`, `party_id`, …).
- Detail endpoints `GET /v1/{resource}/{externalRef}` accept **external_ref only**, not UUIDs.
- `sync-events` rows: `{ change_id, entity_type, entity_id(UUID), operation: upsert|delete, source_revision, changed_at }`. `after` is a `change_id` cursor.
- `tenant-portal-snapshots` is a pre-joined view per tenant (`tenant_ref, lease_ref, unit_ref, address, lease_status, balance_chf`) — use as fixtures + oracle, **not** as the app's data source.
- `tenant-account-entries`: `{ lease_contract_id, entry_kind (rent…), direction debit|credit, status (cleared…), amount_chf, due_on, settled_on }`.
- `lease-parties`: `{ lease_contract_id, party_id, role primary_payer|co_tenant|guarantor }` (no own external_ref).
- No `components.schemas` in the OpenAPI → types are derived from sample records, not generated.

---

## 3. Local data model (to be frozen in Phase 0)

```
 MIRROR (owned by Lane A, keyed by ERP uuid `id`, unique `external_ref`)
   management_companies · portfolios · properties · buildings · rental_units
   parties · leases · lease_parties · lease_objects · rent_terms
   tenant_account_entries · payment_plans
   meter_points · meter_readings · planned_maintenance
   + every row: source_revision, updated_at, archived_at, synced_at

 OURS
   users          (id, email, password_hash, role tenant|manager, tenant_ref → parties.external_ref)
   sessions       (id, user_id, expires_at)
   login_events   (id, user_id, at, ip, user_agent)               ← admin screen 1
   tickets        (id, tenant_ref, lease_ref, unit_ref, category, title, body, status open|in_progress|closed, created_at, updated_at)
   ticket_comments(id, ticket_id, author_kind tenant|manager, kind comment|status, body, created_at)
   sync_cursor    (singleton: last_change_id)
   sync_runs      (id, started_at, finished_at, kind full|incremental, events_applied, status, error)  ← admin screen 3
```

---

## 4. Timeline (≈4 h human time)

```
 T+0        T+0:30                                 T+2:30        T+3:15      T+4:00
  │ PHASE 0 │ PHASE 1 — parallel lanes in worktrees │ PHASE 2     │ PHASE 3  │
  │ serial  │  A  ERP client + sync                 │ merge       │ report   │
  │ you +   │  B  auth + tenant dashboard           │ demo run    │ cuts     │
  │ 1 agent │  C  tickets + admin screens           │ isolation   │ next     │
  │         │ (D  report skeleton, optional)        │ test        │ steps    │
```

### Phase 0 — Foundation (serial, blocks everything)

Deliverables (one OpenSpec change `phase-0-foundation`):

1. `git init`, `.gitignore` (`.env*` except `.env.example`, `data/*.db`, `node_modules/`, `.next/`), `.env.example`. `docs/API.txt` is scrubbed rather than ignored, so the ERP contract notes stay readable in the repo; task 1.1 verifies no key material is tracked.
2. `create-next-app` skeleton that boots; shared layout with nav (tenant / admin).
3. `src/db/schema.ts` — **complete** schema above (mirror + ours), migration, `src/db/client.ts`.
4. `src/erp/types.ts` — TS types for every resource from sample records.
5. `fixtures/` — JSON dump of 3–5 tenants end-to-end (party, lease, lease_parties, unit, building, property, entries, rent_terms, 1–2 maintenance) pulled from the ERP + a `seed:fixtures` script so B and C never wait on A.
6. `src/auth/current-tenant.ts` — `getCurrentTenant()` **stub** returning the demo tenant (B replaces the body, C codes against the signature).
7. Three OpenSpec changes created (A/B/C) with `tasks.md` that become the agents' briefs.
8. Worktrees: `git worktree add /home/vscode/wt-a lane-a` etc. (**not** `../wt-a` — `/` is not writable in this devcontainer).

### Phase 1 — Lanes (parallel)

#### Lane A — ERP + sync
Owns: `src/erp/**`, `src/sync/**`, `scripts/sync.ts`, `npm run sync`, `npm run sync:full`.
- Paginated client with the two auth headers, retry on 429/5xx.
- Full import in brief's order: patrimoine → parties/leases/roles/objects → rent terms, entries, meters, maintenance.
- Upsert by UUID `id` (`INSERT … ON CONFLICT(id) DO UPDATE`), skip if incoming `source_revision` ≤ stored.
- Incremental: `sync-events?after=<cursor>&limit=500` loop; `upsert` → re-fetch the row (see open question A1), `delete` → soft-delete locally (`archived_at`); advance cursor only after the batch commits.
- Write a `sync_runs` row per run.
- Done when: `sync:full` twice → identical row counts; `sync` advances the cursor; a unit test on idempotency.

#### Lane B — auth + tenant product
Owns: `src/auth/**`, `src/app/(tenant)/**` (except `tickets/`), `src/db/tenant-queries.ts`, `scripts/seed-demo.ts`.
- Email + password login (hashed), cookie session, `login_events` insert on success.
- Demo seeder: 3 tenant users (`TEN-00005`, `TEN-00170`, and co-tenant `TEN-06002`) + 1 manager user, credentials in README.
- Real `getCurrentTenant()` from session.
- Dashboard "in 10 seconds": my unit + address, my lease (status, dates, rent from `rent_terms`), balance CHF (debits − credits) with last entries, what's coming (next due entry, next `planned_maintenance` on my building/unit), link to my requests.
- Isolation: `tenant-queries.ts` is the only way to read tenant data; all functions take `tenantRef` from session. Test: logged in as TEN-00001, request TEN-00002's lease/ticket → 404.
- **Delivered.** The isolation evidence for checklist item 3 is **`src/auth/isolation.test.ts`** (13 cases): it signs two tenants in for real, drives the actual `(tenant)` layout gate and `/bail/[ref]` page module, and asserts each side gets a 404 on the other's lease and no foreign reference in the rendered body — plus the co-tenant case, `TEN-06002` on `BAIL-000005`. Demo accounts and the balance rule are in `openspec/changes/lane-b-auth-tenant/design.md`; the balance oracle test is `src/db/tenant-queries.test.ts`.

#### Lane C — tickets + management side
Owns: `src/tickets/**`, `src/app/(tenant)/tickets/**`, `src/app/(admin)/**`.
- Tenant: new request (category, title, description) → writes `tickets` with `tenant_ref/lease_ref/unit_ref` from session; list + detail with status and comments.
- Manager: (1) logins — last login events per user; (2) requests inbox — list, filter by status, change status, add comment; (3) sync — cursor, last runs, row counts per table, "Relancer la synchro" button calling Lane A's incremental sync.
- Manager routes gated on `role = manager`.

#### Lane D — delivery (late, can be the human)
- README: run in 3 commands (`npm i`, `npm run setup` = migrate + sync or seed fixtures, `npm run dev`), demo accounts.
- Report: built / how to run / sync & isolation choices / cut list & next steps.

### Phase 2 — Integration
Merge A → B → C into main, run `setup`, click through the demo script (login → dashboard → create ticket → admin sees it → re-run sync → no duplicates → isolation test). Fix only what blocks the demo.

**Run of 2026-08-23 (lanes A + B + C, `next dev` on a throwaway `DATABASE_URL`, 24 checks).** Passed end to end: login as `lea.martin@example.ch` → dashboard → create a request (a `tenant_ref`/`lease_ref` planted in the POST body is ignored; the row carries the session's refs) → redirect to the detail → manager logs in, sees it in the inbox with its tenant, moves it to *En cours* and answers → the tenant's own page shows both → `adrien.clerc@example.ch` gets 404 on that request id and never sees it in their list → tenant and anonymous get 404 on all four `/admin` routes and are not offered the "Gérance" link → the logins screen shows both sign-ins and a failed attempt on an unknown address.

Gaps found, none blocking the demo:
- **"Relancer la synchro" needs `.env.local` next to the checkout that serves the demo.** In a lane worktree there is none, so the run is recorded as `failed` with `ERP_API and ERP_PUBLISHABLE_KEY must be set`, the cursor does not move, and the screen renders that as a normal outcome. Re-run on `main`, which has the keys: the same click returns `ok`, 0 events applied, cursor `20 665 → 20 665`. Set the cursor first (`npm run sync:full`, or `tsx scripts/set-cursor.ts 20665`) — from cursor 0 the button replays the whole stream inside the request.
- **`sync_runs` has no row until something runs.** After a bare `npm run setup` the sync screen is empty by design; the demo should run `npm run sync:full` first, which is also what stops the first incremental sync from replaying all 20 665 events.
- **The header carries a logout form.** Any script that drives the app without JavaScript must target forms by a field they contain — posting "the first form on the page" signs the caller out.
- **Two `next dev` servers on one port fail silently apart from the log.** The second exits with `EADDRINUSE` while the first keeps answering, so a demo run can silently exercise the wrong database; check the log says `Ready` before trusting a click-through.

### Phase 3 — Report + cuts
Write the report; every cut item goes in as an explicit decision.

---

## 5. Collision map (what keeps the agents independent)

```
 A writes  src/erp/**  src/sync/**  scripts/sync.ts           ← disjoint
 B writes  src/auth/** src/app/(tenant)/** src/app/(tenant)/layout.tsx
           src/db/tenant-queries.ts  scripts/seed-demo.ts
 C writes  src/tickets/** src/app/(tenant)/tickets/** src/app/(admin)/**
           src/app/(admin)/layout.tsx          ← incl. the manager gate
 FROZEN    src/db/schema.ts, src/erp/types.ts, src/contracts.ts,
           src/app/layout.tsx (nav), package.json
           → changes only through the human, re-merged into all worktrees
```

Settled in `phase-0-hardening` so no lane edits a shared file:

| Surface | Owner | Rule |
|---|---|---|
| `src/app/(tenant)/layout.tsx` | B | session gate; anonymous → `/login` |
| `src/app/(admin)/layout.tsx` | C | manager gate; anything but `role = manager` → 404 |
| `src/app/layout.tsx` nav | frozen | one edit point: `#session-slot`, filled by B's own component |
| `package.json` | frozen | `sync`, `sync:full`, `seed:demo` are **pre-declared**; lanes create the files they point at (`scripts/sync.ts` → A, `scripts/seed-demo.ts` → B, currently a no-op stub) |
| `.env.local` | — | present in `wt-a` only; B and C never call the ERP |

Cross-lane interface points (fixed in Phase 0):
- `getCurrentTenant(lookup?): Promise<{ tenantRef, leaseRef, unitRef, userId } | null>` and `getCurrentUser(lookup?): Promise<SessionUser | null>` (B implements, C consumes) — async since `main@9723d53`, because the session is a cookie and `cookies()` is awaited in this Next version
- `runIncrementalSync(): Promise<SyncRunSummary>` (A implements, C's button calls it)
- `login_events`, `sync_runs`, `tickets` table shapes (schema)

---

## 6. Scope

### Minimal (the demo — what the lanes above deliver)
- Login, dashboard (unit / lease / balance / upcoming), create & follow a request.
- Tenant isolation with an automated test.
- 3 manager screens: logins, requests, sync.
- Replayable sync with cursor; full import of the collections the demo needs.
- README + demo accounts + report.

### Extended (explicitly cut from the 4 h; each becomes its own OpenSpec change later)
- Gemini assistant (server-side, tenant-scoped): answers about my lease; qualifies a request, asks for missing info, summarises, confirms, then creates the ticket.
- Meter points & readings chart on the dashboard.
- Payment plans and per-entry detail / PDF statement.
- Ticket media (photos), notifications (email), co-tenant / guarantor views.
- Maintenance calendar per building.
- Full sync of `meter-readings` (large) — demo syncs a capped subset.
- Password reset, account settings, locale switch (fr/de).

---

## 7. Open questions

Phase 0 resolves **A2** and **B2** (task 5.2). A1 is settled by Lane A (task 3.1), B1 by Lane B (task 2.3), C1 by Lane C (task 3.3).

- **A1 — resolving a `sync-events` upsert.** `entity_id` is a UUID, detail endpoints want `external_ref`. Options: (a) look up `external_ref` in the local mirror and re-fetch the detail; (b) for unknown UUIDs (new rows) re-page the affected collection filtered where possible; (c) batch: group events by `entity_type`, re-pull those collections fully (simplest, idempotent, slower). Recommended: (a) with (c) as fallback for unknown ids.
- **A2 — collection sizes.** *(resolved 2026-08-23, Phase 0 task 3.2.)* Measured by paging every collection to `next_offset === null`:

  | Collection | Rows | | Collection | Rows |
  |---|---:|---|---|---:|
  | tenant-account-entries | **161 603** | | lease-parties | 7 470 |
  | meter-readings | **90 000** | | parties | 7 200 |
  | sync-events | 20 665 | | rental-units / unit-statuses | 6 800 |
  | unit-amenities | 8 884 | | leases | 6 525 |
  | lease-objects | 8 325 | | rent-terms | 4 725 |
  | meter-points | 7 500 | | planned-maintenance | 1 200 |
  | tenant-portal-snapshots | 7 470 | | buildings / properties / portfolios / companies / payment-plans / dataset-releases | 420 / 140 / 18 / 3 / 60 / 1 |

  ≈330 k rows overall. Paging `tenant-account-entries` alone takes ~53 s and `meter-readings` ~16 s. Consequence: the demo imports everything **except** `meter-readings`, which is capped via `SYNC_MAX_ROWS_PER_COLLECTION` (recorded as a cut) — the dashboard does not use readings, but it does need every entry to compute a balance.

  Also discovered: the list endpoints accept **server-side filters** (`tenant-account-entries?lease_contract_id=`, `meter-readings?meter_point_id=`, `leases?status=`, `lease-parties?lease_contract_id=`, `planned-maintenance?building_id=`). This is what makes the fixture pull cheap, and it gives lane A a better option for A1 than re-paging a whole collection.
- **B1 — pending entries in balance?** *(resolved in Lane B, task 2.3 — not Phase 0.)* Compare our computation with `tenant-portal-snapshots.balance_chf` for the demo tenants and adopt whichever rule matches; record the chosen status filter in `lane-b-auth-tenant/design.md`.
- **B2 — which tenants are demo accounts?** *(resolved 2026-08-23, Phase 0 task 3.2.)* `TEN-00170` (2540 CHF, APT-00170) · `TEN-00005` (1090 CHF, APT-00005) · `TEN-00340` (2420 CHF, APT-00340) · `TEN-00010` (1210 CHF, APT-00010). All have an active lease, a co-tenant on the lease, upcoming maintenance on their building, and entries covering `cleared` / `overdue` / `partially_paid` in both directions.

  Note for B1: the ERP holds only **7 distinct balances (1090–2540 CHF), all positive** — no tenant is ever in credit, so the "non-zero balance" criterion excludes nobody and the dashboard never shows a negative balance. Worth one line in the report.
- **C1 — does "Relancer la synchro" run inline (simple, blocks request) or as a background job?** Inline is fine for the demo.

---

## 8. OpenSpec changes (created 2026-08-23)

| Change | Run | Specs |
|---|---|---|
| `phase-0-foundation` | first, serial (`/opsx:apply phase-0-foundation`) | local-data-model, demo-fixtures |
| `lane-a-erp-sync` | parallel, worktree `lane-a` | erp-sync |
| `lane-b-auth-tenant` | parallel, worktree `lane-b` | tenant-auth, tenant-isolation, tenant-dashboard |
| `lane-c-tickets-admin` | parallel, worktree `lane-c` | tenant-requests, management-screens |
| `lane-d-delivery` | last (not created yet: README, report, cuts) | — |

Secrets live in `.env.local` (gitignored); `docs/API.txt` no longer contains keys.
