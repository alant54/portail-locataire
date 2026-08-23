/**
 * FROZEN CONTRACT — the two seams where the parallel lanes meet.
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
