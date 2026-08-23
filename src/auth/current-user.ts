/**
 * CROSS-LANE INTERFACE — lane B replaces the body, never the returned shape.
 *
 * The seam that answers "who is signed in, and with which role". `getCurrentTenant()`
 * cannot answer it: `CurrentTenant` carries no role, and a manager has no `tenant_ref`
 * at all. Lane C's management gate (`src/app/(admin)/layout.tsx`) and the nav both read
 * this, so the gate and the menu tell the same story.
 *
 * Phase-0-style stub: returns a manager so lane C can build the management screens
 * before authentication exists. Set `PORTAL_STUB_ROLE=tenant` to see what a tenant sees
 * (404 on the management area, no "Gérance" link) without lane B. Lane B swaps in the
 * session-backed implementation, which returns `null` for an anonymous, expired or
 * unknown session — and drops the env knob with it.
 *
 * Async for the same reason as `getCurrentTenant()`: the session is a cookie and
 * `cookies()` is awaited in this version of Next. See that file for the decision.
 */
import type { SessionLookup, SessionUser } from "../contracts";

export async function getCurrentUser(lookup: SessionLookup = {}): Promise<SessionUser | null> {
  void lookup; // the stub has no session to read; lane B's body uses it
  if (process.env.PORTAL_STUB_ROLE === "anonymous") return null;
  if (process.env.PORTAL_STUB_ROLE === "tenant") {
    return {
      userId: "stub-tenant",
      email: "locataire@example.ch",
      role: "tenant",
      tenantRef: "TEN-00005",
    };
  }
  return {
    userId: "stub-manager",
    email: "gerance@example.ch",
    role: "manager",
    tenantRef: null,
  };
}
