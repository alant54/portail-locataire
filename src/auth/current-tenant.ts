/**
 * CROSS-LANE INTERFACE — lane B replaces the body, never the signature.
 *
 * Phase 0 stub: returns the first fixture tenant so lanes B and C can build pages before
 * authentication exists. Lane B swaps in the session-backed implementation, which returns
 * `null` for an anonymous, expired or unknown session.
 *
 * The identity comes from the session and nothing else — never from a URL, query string,
 * form body or header. That rule is the whole of checklist item 3.
 */
import type { CurrentTenant } from "../contracts.js";
import { readBalanceOracle } from "../../scripts/seed-fixtures.js";

export function getCurrentTenant(): CurrentTenant | null {
  const [first] = readBalanceOracle();
  if (!first) return null;
  return {
    userId: `stub-${first.tenant_ref}`,
    tenantRef: first.tenant_ref,
    leaseRef: (first as { lease_ref?: string }).lease_ref ?? null,
    unitRef: (first as { unit_ref?: string }).unit_ref ?? null,
  };
}
