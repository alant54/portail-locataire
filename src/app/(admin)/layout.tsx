/**
 * OWNER: lane C (tickets + management screens).
 *
 * The manager gate for the whole `(admin)` group. It lives here, once, so a screen added
 * later cannot be left unguarded — lane B gates `(tenant)` and must not edit this file.
 *
 * Anything that is not a manager session gets a **404, not a redirect**: a tenant should
 * not learn that the management area exists. The nav in the root layout hides the
 * "Gérance" link for the same reason.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sessionIsManager } from "../../tickets/guard";
import styles from "../../tickets/ui.module.css";

export const dynamic = "force-dynamic";

const SCREENS = [
  { href: "/admin", label: "Vue d'ensemble" },
  { href: "/admin/requests", label: "Demandes" },
  { href: "/admin/logins", label: "Connexions" },
  { href: "/admin/sync", label: "Synchronisation" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  if (!sessionIsManager()) notFound();

  return (
    <>
      <div className={styles.filters}>
        {SCREENS.map((screen) => (
          <Link className={styles.filter} key={screen.href} href={screen.href}>
            {screen.label}
          </Link>
        ))}
      </div>
      {children}
    </>
  );
}
