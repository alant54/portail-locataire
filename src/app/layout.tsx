import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "Portail locataire",
  description: "Portail locataire — régie immobilière (données fictives)",
};

/** Shared shell for both route groups. Lanes B and C fill the pages, not this file. */
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
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
