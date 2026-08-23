import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser } from "../auth/current-user";
import { SessionControl } from "../auth/session-control";
import "./globals.css";

export const metadata = {
  title: "Portail locataire",
  description: "Portail locataire — régie immobilière (données fictives)",
};

/**
 * Shared shell for both route groups. Lanes B and C fill the pages, not this file.
 *
 * FROZEN, with exactly one sanctioned edit point: `#session-slot` below. Lane B
 * renders its login/logout control into it from its own component, so a Logout
 * scenario never requires touching the nav all three lanes render through. Any
 * other change here goes through `main` and is merged into every worktree.
 *
 * The layout is async because both identity seams are: the session is a cookie, and
 * `cookies()` is awaited in this version of Next.
 *
 * The "Gérance" link is rendered only for a manager session: the management area
 * answers 404 to everyone else precisely so its existence is not disclosed, and a
 * link in the nav would have disclosed it anyway.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const isManager = (await getCurrentUser())?.role === "manager";
  return (
    <html lang="fr">
      <body>
        <header className="site">
          <div className="inner">
            <span className="brand">Portail locataire</span>
            <nav>
              <Link href="/">Mon logement</Link>
              <Link href="/tickets">Mes demandes</Link>
              {isManager && <Link href="/admin">Gérance</Link>}
            </nav>
            {/* The one sanctioned edit point: lane B's control, from lane B's own file. */}
            <div id="session-slot">
              <SessionControl />
            </div>
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
