/**
 * CROSS-LANE INTERFACE — session-backed implementation (lane B). The returned shape is
 * frozen in `src/contracts.ts` and enforced by `src/contracts.test.ts`.
 *
 * The identity comes from the session and nothing else — never from a URL, query string,
 * form body or header. That rule is the whole of checklist item 3.
 *
 * A manager gets `null` here even though they are signed in: `CurrentTenant` is "which
 * tenant's data may this request read", and the answer for a manager is "none". Lane C's
 * management screens read `getCurrentUser()` instead.
 *
 * `leaseRef` / `unitRef` are the tenant's *current* lease — the same one the dashboard
 * opens on — resolved through `lease_parties`, so a `co_tenant` gets their own bail and
 * not a null. A tenant between leases keeps a valid identity with both refs `null`.
 */
import type { CurrentTenant, SessionLookup } from "../contracts";
import { db } from "../db/client";
import { getHome } from "../db/tenant-queries";
import type { MirrorDb } from "../db/upsert";
import { getCurrentUser } from "./current-user";

export async function getCurrentTenant(
  lookup: SessionLookup = {},
): Promise<CurrentTenant | null> {
  const user = await getCurrentUser(lookup);
  if (!user || user.role !== "tenant" || !user.tenantRef) return null;

  const database = (lookup.database as MirrorDb | undefined) ?? db;
  const lease = getHome(user.tenantRef, database);

  return {
    userId: user.userId,
    tenantRef: user.tenantRef,
    leaseRef: lease?.leaseRef ?? null,
    unitRef: lease?.unitRef ?? null,
  };
}
