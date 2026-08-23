/**
 * The login/logout control mounted in the frozen nav's `#session-slot` — the one
 * sanctioned edit point in `src/app/layout.tsx` (phase-0-hardening).
 */
import Link from "next/link";
import { getCurrentUser } from "./current-user";
import { logoutAction } from "./actions";
import styles from "./session-control.module.css";

export async function SessionControl() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link className={styles.link} href="/login">
        Se connecter
      </Link>
    );
  }

  return (
    <>
      <span className={styles.who}>
        {user.email}
        {user.role === "manager" ? " · gérance" : ""}
      </span>
      <form action={logoutAction}>
        <button className={styles.logout} type="submit">
          Se déconnecter
        </button>
      </form>
    </>
  );
}
