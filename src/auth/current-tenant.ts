/**
 * CROSS-LANE INTERFACE — lane B replaces the body, never the returned shape.
 *
 * Phase 0 stub: returns the first fixture tenant so lanes B and C can build pages before
 * authentication exists. Lane B swaps in the session-backed implementation, which returns
 * `null` for an anonymous, expired or unknown session.
 *
 * The identity comes from the session and nothing else — never from a URL, query string,
 * form body or header. That rule is the whole of checklist item 3.
 *
 * ASYNC ON PURPOSE (decided on `main`, 2026-08-23): the session lives in a cookie and
 * `cookies()` is awaited in this version of Next, so a synchronous seam could never read
 * one. The field set is what `src/contracts.test.ts` freezes, and that is unchanged;
 * callers gain one `await`. `SessionLookup` lets a caller that already holds a session id
 * (tests, route handlers) skip the request scope entirely.
 */
import type { CurrentTenant, SessionLookup } from "../contracts";
import { readBalanceOracle } from "../../scripts/seed-fixtures";

export async function getCurrentTenant(
  lookup: SessionLookup = {},
): Promise<CurrentTenant | null> {
  void lookup; // the stub has no session to read; lane B's body uses it
  const [first] = readBalanceOracle();
  if (!first) return null;
  return {
    userId: `stub-${first.tenant_ref}`,
    tenantRef: first.tenant_ref,
    leaseRef: (first as { lease_ref?: string }).lease_ref ?? null,
    unitRef: (first as { unit_ref?: string }).unit_ref ?? null,
  };
}
