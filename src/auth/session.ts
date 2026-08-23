/**
 * Sessions: an opaque id in an httpOnly cookie, backed by a row in `sessions`.
 *
 * Deliberately hand-rolled rather than NextAuth (design.md): three demo accounts do not
 * justify the setup, and a reviewer can read the whole mechanism in one file.
 *
 * `next/headers` is imported dynamically inside the cookie helpers on purpose — the rest
 * of this module is plain SQL and must stay callable from vitest, where there is no
 * request scope. Every function takes an optional database handle so tests never touch
 * `data/app.db`.
 */
import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "../db/client";
import { loginEvents, sessions, users } from "../db/schema";
import type { MirrorDb } from "../db/upsert";

export const SESSION_COOKIE = "portal_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionUserRow = typeof users.$inferSelect;

/** ISO-8601 in UTC, the format every timestamp column in this schema already uses. */
function isoNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

export function createSession(
  userId: string,
  database: MirrorDb = db,
  ttlMs = SESSION_TTL_MS,
): { id: string; expiresAt: string } {
  const id = randomBytes(24).toString("hex");
  const expiresAt = isoNow(ttlMs);
  database.insert(sessions).values({ id, userId, expiresAt, createdAt: isoNow() }).run();
  return { id, expiresAt };
}

/**
 * Resolves a session id to its user, or `null` when the session is unknown or expired.
 * Expiry is compared in SQL so a clock-skewed row can never slip through a JS compare
 * that ran on a different code path.
 */
export function readSession(sessionId: string, database: MirrorDb = db): SessionUserRow | null {
  const row = database
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, isoNow())))
    .get();
  return row?.user ?? null;
}

export function destroySession(sessionId: string, database: MirrorDb = db): void {
  database.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

/** Housekeeping, called on login so the table cannot grow forever in a long demo. */
export function purgeExpiredSessions(database: MirrorDb = db): void {
  database.delete(sessions).where(lt(sessions.expiresAt, isoNow())).run();
}

/**
 * One row per login attempt. Failures are recorded too — with the submitted email and a
 * null user — because "who tried to get in" is exactly what lane C's screen should show.
 */
export function recordLoginEvent(
  event: {
    userId: string | null;
    email: string | null;
    outcome: "success" | "failure";
    userAgent?: string | null;
    ip?: string | null;
  },
  database: MirrorDb = db,
): void {
  database
    .insert(loginEvents)
    .values({
      id: randomBytes(12).toString("hex"),
      userId: event.userId,
      email: event.email,
      outcome: event.outcome,
      userAgent: event.userAgent ?? null,
      ip: event.ip ?? null,
      at: isoNow(),
    })
    .run();
}

/* ------------------------------------------------------------------ *
 * Cookie helpers — the only part of this file that needs a request scope
 * ------------------------------------------------------------------ */

/**
 * Outside a request scope — a script, a test, a background job — `cookies()` throws.
 * That is not an error here: no request means no cookie means no session, which is
 * exactly the "nobody is signed in" answer both identity seams are built to give. The
 * catch cannot mask a real bug: inside a request scope `cookies()` does not throw.
 */
export async function readSessionCookie(): Promise<string | undefined> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

export async function setSessionCookie(id: string, expiresAt: string): Promise<void> {
  const { cookies } = await import("next/headers");
  (await cookies()).set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // The demo runs over plain HTTP on a forwarded port; `secure` there would drop the
    // cookie and make every login look broken.
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const { cookies } = await import("next/headers");
  (await cookies()).delete(SESSION_COOKIE);
}
