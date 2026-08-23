/**
 * FROZEN CONTRACT — the seams where the parallel lanes meet.
 *
 * These shapes deliberately live outside the folder that implements them, so the
 * consumer never has to import from the implementer's lane. Lanes replace the bodies
 * behind these types; they never change the types. `src/contracts.test.ts` fails if
 * a lane narrows either shape.
 *
 * See specs/cross-lane-interfaces.
 */

/**
 * Who is asking, resolved from the session and nothing else.
 * All three references are ERP `external_ref` values (`TEN-…`, `BAIL-…`, `APT-…`),
 * never UUIDs, so they survive a full re-sync.
 */
export interface CurrentTenant {
  userId: string;
  tenantRef: string;
  leaseRef: string | null;
  unitRef: string | null;
}

/** Result of one sync run, as rendered by the management sync screen. */
export interface SyncRunSummary {
  runId: string;
  kind: "full" | "incremental";
  eventsApplied: number;
  cursorBefore: number;
  cursorAfter: number;
  status: "ok" | "failed";
  error?: string;
}

/**
 * Optional overrides accepted by both identity seams.
 *
 * Production callers pass nothing: the seam reads the session cookie itself. Tests
 * and route handlers that already hold a session id pass it here, which is what keeps
 * `npm test` hermetic — no request scope, and never `data/app.db`. `database` is typed
 * `object` for the same reason lane A typed its injected ERP client that way: the real
 * type lives in a lane's own module and the seam must not depend on it.
 */
export interface SessionLookup {
  sessionId?: string;
  database?: object;
}

/** Every field of `CurrentTenant`, for the contract test. */
export const CURRENT_TENANT_FIELDS = ["userId", "tenantRef", "leaseRef", "unitRef"] as const;

/** Every field of `SyncRunSummary` that must always be present. */
export const SYNC_RUN_SUMMARY_FIELDS = [
  "runId",
  "kind",
  "eventsApplied",
  "cursorBefore",
  "cursorAfter",
  "status",
] as const;

/**
 * Who is signed in, resolved from the session and nothing else.
 *
 * The third seam, added for lane C: `CurrentTenant` deliberately carries no role, so it
 * cannot answer "may this caller see the management area". `tenantRef` is null for a
 * manager — exactly like `users.tenant_ref` in the schema.
 */
export interface SessionUser {
  userId: string;
  email: string;
  role: "tenant" | "manager";
  tenantRef: string | null;
}

/** Every field of `SessionUser`, for the contract test. */
export const SESSION_USER_FIELDS = ["userId", "email", "role", "tenantRef"] as const;
