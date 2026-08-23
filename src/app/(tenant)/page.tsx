/**
 * "Mon logement" — the ten-second answer to "where do I live, under which lease, what do
 * I owe, and what happens next".
 *
 * The page holds no query of its own: it asks the session who is calling, then reads one
 * view-model from `tenant-queries.ts`. That is what makes the isolation guarantee a
 * property of one file instead of a property of every page.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "../../auth/current-tenant";
import { getDashboard, getTenantName } from "../../db/tenant-queries";
import {
  categorieEntretien,
  chf,
  jour,
  roleBail,
  statutBail,
  statutEcriture,
  typeEcriture,
} from "./format";
import styles from "./tenant.module.css";

export const metadata = { title: "Mon logement — Portail locataire" };

export default async function LogementPage() {
  const tenant = await getCurrentTenant();
  // The layout already gated this route; a null here means the session died mid-request.
  if (!tenant) redirect("/login");

  const view = getDashboard(tenant.tenantRef);
  const name = getTenantName(tenant.tenantRef);
  const { lease } = view;

  return (
    <>
      <h1>Mon logement</h1>
      <p className="lead">
        {name ? `Bonjour ${name}. ` : ""}
        {lease
          ? `Bail ${lease.leaseRef} — ${roleBail(lease.role)}.`
          : "Aucun bail n'est rattaché à votre compte."}
      </p>

      {!lease ? (
        <div className="card">
          <h2>Logement</h2>
          <p className={styles.empty}>
            Aucun bail actif. Si vous pensez qu'il s'agit d'une erreur, contactez la gérance
            via <Link href="/tickets">Mes demandes</Link>.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            <div className="card">
              <h2>Logement</h2>
              <p className={styles.headline}>{lease.unitLabel ?? lease.unitRef ?? "—"}</p>
              <p className={styles.sub}>
                {[lease.address, [lease.postalCode, lease.locality].filter(Boolean).join(" ")]
                  .filter(Boolean)
                  .join(", ") || "Adresse non renseignée"}
              </p>
              <ul className={styles.rows} style={{ marginTop: 10 }}>
                <li>
                  <span className={styles.key}>Pièces</span>
                  <span>{lease.rooms ?? "—"}</span>
                </li>
                <li>
                  <span className={styles.key}>Surface</span>
                  <span>{lease.surfaceM2 ? `${lease.surfaceM2} m²` : "—"}</span>
                </li>
                <li>
                  <span className={styles.key}>Étage</span>
                  <span>{lease.floorLabel ?? "—"}</span>
                </li>
                <li>
                  <span className={styles.key}>Immeuble</span>
                  <span>{lease.buildingLabel ?? lease.propertyName ?? "—"}</span>
                </li>
              </ul>
            </div>

            <div className="card">
              <h2>Bail</h2>
              <p className={styles.headline}>
                {lease.rent ? `${chf(lease.rent.totalChf)} / mois` : "Loyer non renseigné"}
              </p>
              <p className={styles.sub}>
                {lease.leaseRef} · <span className={styles.tag}>{statutBail(lease.status)}</span>
              </p>
              <ul className={styles.rows} style={{ marginTop: 10 }}>
                <li>
                  <span className={styles.key}>Début</span>
                  <span>{jour(lease.startsOn)}</span>
                </li>
                {lease.noticeOn ? (
                  <li>
                    <span className={styles.key}>Résiliation</span>
                    <span>{jour(lease.noticeOn)}</span>
                  </li>
                ) : null}
                <li>
                  <span className={styles.key}>Fin</span>
                  <span>{lease.endsOn ? jour(lease.endsOn) : "indéterminée"}</span>
                </li>
                {lease.rent ? (
                  <li>
                    <span className={styles.key}>Détail</span>
                    <span className={styles.amount}>
                      {chf(lease.rent.baseRentChf)} + {chf(lease.rent.serviceChargesChf)} charges
                      {lease.rent.parkingChargesChf
                        ? ` + ${chf(lease.rent.parkingChargesChf)} parking`
                        : ""}
                    </span>
                  </li>
                ) : null}
              </ul>
              <p className={styles.actions}>
                <Link href={`/bail/${lease.leaseRef}`}>Voir le bail en détail →</Link>
              </p>
            </div>
          </div>

          <div className="card">
            <h2>Solde</h2>
            <p className={`${styles.headline} ${view.balanceChf > 0 ? styles.debt : styles.credit}`}>
              {chf(Math.abs(view.balanceChf))}{" "}
              {view.balanceChf > 0 ? "à payer" : view.balanceChf < 0 ? "en votre faveur" : "— à jour"}
            </p>
            <p className={styles.sub}>
              {view.overdueCount > 0
                ? `${view.overdueCount} écriture${view.overdueCount > 1 ? "s" : ""} en retard`
                : "Aucune écriture en retard"}{" "}
              · débits moins crédits sur toutes vos écritures
            </p>

            {view.recentEntries.length === 0 ? (
              <p className={styles.empty} style={{ marginTop: 10 }}>
                Aucune écriture sur votre compte.
              </p>
            ) : (
              <div className={styles.scroll} style={{ marginTop: 10 }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Échéance</th>
                      <th>Libellé</th>
                      <th>Statut</th>
                      <th>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.recentEntries.map((entry) => (
                      <tr key={entry.entryRef}>
                        <td>{jour(entry.dueOn)}</td>
                        <td>{entry.description ?? typeEcriture(entry.kind)}</td>
                        <td>
                          <span
                            className={`${styles.tag} ${entry.status === "overdue" ? styles.tagLate : ""}`}
                          >
                            {statutEcriture(entry.status)}
                          </span>
                        </td>
                        <td className={styles.amount}>
                          {entry.direction === "credit" ? "−" : "+"}
                          {chf(entry.amountChf)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className={styles.actions}>
              <Link href={`/bail/${lease.leaseRef}`}>Toutes les écritures →</Link>
            </p>
          </div>

          <div className="card">
            <h2>À venir</h2>
            <ul className={styles.rows}>
              <li>
                <span className={styles.key}>Prochaine échéance</span>
                <span>
                  {view.nextEntry
                    ? `${jour(view.nextEntry.dueOn)} — ${chf(view.nextEntry.amountChf)}`
                    : "rien de prévu"}
                </span>
              </li>
              <li>
                <span className={styles.key}>Prochain entretien</span>
                <span>
                  {view.nextMaintenance
                    ? `${jour(view.nextMaintenance.plannedFor)} — ${categorieEntretien(view.nextMaintenance.category)}`
                    : "rien de prévu"}
                </span>
              </li>
            </ul>
            {view.nextMaintenance?.description ? (
              <p className={styles.sub} style={{ marginTop: 8 }}>
                {view.nextMaintenance.description}
              </p>
            ) : null}
          </div>

          <div className="card">
            <h2>Un problème dans le logement ?</h2>
            <p className={styles.empty}>
              Signalez-le à la gérance et suivez son traitement depuis{" "}
              <Link href="/tickets">Mes demandes</Link>.
            </p>
          </div>
        </>
      )}
    </>
  );
}
