import type { ReactNode } from "react";
import Link from "next/link";
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
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <header className="site">
          <div className="inner">
            <span className="brand">Portail locataire</span>
            <nav>
              <Link href="/">Mon logement</Link>
              <Link href="/tickets">Mes demandes</Link>
              <Link href="/admin">Gérance</Link>
            </nav>
            {/* Lane B's login/logout control mounts here. Left empty on purpose. */}
            <div id="session-slot" />
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
