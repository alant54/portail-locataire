/**
 * CROSS-LANE INTERFACE — session-backed implementation (lane B). The returned shape is
 * frozen in `src/contracts.ts` and enforced by `src/contracts.test.ts`.
 *
 * The seam that answers "who is signed in, and with which role". `getCurrentTenant()`
 * cannot answer it: `CurrentTenant` carries no role, and a manager has no `tenant_ref`
 * at all. Lane C's management gate (`src/app/(admin)/layout.tsx`) and the nav both read
 * this, so the gate and the menu tell the same story.
 *
 * Async because the session is an httpOnly cookie and `cookies()` is awaited in this
 * version of Next. `SessionLookup` lets a caller that already holds a session id — a
 * test, a route handler — skip the request scope entirely.
 *
 * The phase-0 `PORTAL_STUB_ROLE` knob is gone with the stub: the roles now come from
 * the `users` table that `npm run seed:demo` fills.
 */
import type { SessionLookup, SessionUser } from "../contracts";
import { db } from "../db/client";
import type { MirrorDb } from "../db/upsert";
import { readSession, readSessionCookie } from "./session";

export async function getCurrentUser(lookup: SessionLookup = {}): Promise<SessionUser | null> {
  const database = (lookup.database as MirrorDb | undefined) ?? db;
  const sessionId = lookup.sessionId ?? (await readSessionCookie());
  if (!sessionId) return null;

  const user = readSession(sessionId, database);
  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    tenantRef: user.tenantRef,
  };
}
