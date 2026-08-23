/**
 * The login decision itself, with no Next.js in sight.
 *
 * Kept out of `actions.ts` on purpose: a `'use server'` module may only export async
 * functions, so it cannot take an injected database handle — and a login test that has to
 * boot a request scope to check that a `login_events` row was written is a test nobody
 * runs. Here the whole rule is a pure function over a database handle; `actions.ts` is the
 * thin wrapper that adds the cookie and the redirect.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import type { MirrorDb } from "../db/upsert";
import { verifyPassword } from "./password";
import { createSession, purgeExpiredSessions, recordLoginEvent, type SessionUserRow } from "./session";

/** Same message for an unknown email and a wrong password: the form must not tell an
 * attacker which of the two it got right. */
export const INVALID_CREDENTIALS = "Identifiants invalides.";

export type LoginOutcome =
  | { ok: true; user: SessionUserRow; session: { id: string; expiresAt: string } }
  | { ok: false; message: string };

export function attemptLogin(
  email: string,
  password: string,
  options: { database?: MirrorDb; userAgent?: string | null; ip?: string | null } = {},
): LoginOutcome {
  const database = options.database ?? db;
  const normalised = email.trim().toLowerCase();

  const user = normalised
    ? (database.select().from(users).where(eq(users.email, normalised)).get() ?? null)
    : null;
  const ok = user !== null && verifyPassword(password, user.passwordHash);

  // Failures are recorded too, with the submitted email and no user id.
  recordLoginEvent(
    {
      userId: ok ? user.id : null,
      email: normalised || null,
      outcome: ok ? "success" : "failure",
      userAgent: options.userAgent ?? null,
      ip: options.ip ?? null,
    },
    database,
  );

  if (!ok) return { ok: false, message: INVALID_CREDENTIALS };

  purgeExpiredSessions(database);
  return { ok: true, user, session: createSession(user.id, database) };
}

/** Where a user lands after signing in. A manager has no tenant dashboard to land on. */
export function landingPathFor(user: { role: "tenant" | "manager" }): string {
  return user.role === "manager" ? "/admin" : "/";
}
