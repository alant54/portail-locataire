"use client";

/**
 * Client component only because the error message needs `useActionState`; the credentials
 * never touch client state — the browser posts the form straight to the server action, so
 * the form still works with JavaScript disabled.
 */
import { useActionState } from "react";
import { loginAction } from "../../auth/actions";
import { EMPTY_LOGIN_STATE } from "../../auth/login-state";
import styles from "./login.module.css";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, EMPTY_LOGIN_STATE);

  return (
    <form action={formAction}>
      {state.message ? (
        <p className={styles.error} role="alert" aria-live="polite">
          {state.message}
        </p>
      ) : null}

      <label className={styles.field}>
        <span>Adresse e-mail</span>
        <input type="email" name="email" autoComplete="username" required autoFocus />
      </label>

      <label className={styles.field}>
        <span>Mot de passe</span>
        <input type="password" name="password" autoComplete="current-password" required />
      </label>

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
