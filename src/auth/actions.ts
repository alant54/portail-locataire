/**
 * Server actions for the session. The decision lives in `login.ts`; this file only does
 * the two things that need a request scope — set/clear the cookie — and the redirect.
 *
 * `redirect()` throws, so it is called outside every try/catch (Next docs).
 */
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { attemptLogin, landingPathFor } from "./login";
import type { LoginFormState } from "./login-state";
import { clearSessionCookie, destroySession, readSessionCookie, setSessionCookie } from "./session";

export async function loginAction(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const outcome = attemptLogin(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""), {
    userAgent: (await headers()).get("user-agent"),
  });

  if (!outcome.ok) return { message: outcome.message };

  await setSessionCookie(outcome.session.id, outcome.session.expiresAt);
  redirect(landingPathFor(outcome.user));
}

export async function logoutAction(): Promise<void> {
  const sessionId = await readSessionCookie();
  if (sessionId) destroySession(sessionId);
  await clearSessionCookie();
  redirect("/login");
}
