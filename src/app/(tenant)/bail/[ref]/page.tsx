/**
 * `/bail/<ref>` — the lease in full: conditions, historique des loyers, toutes les
 * écritures.
 *
 * THE ISOLATION CHOKE POINT. `ref` comes from the URL, which makes it untrusted input: it
 * is passed to `getLease(tenantRef, ref)`, which only ever looks among the leases *this*
 * session's tenant is a party to. A reference belonging to someone else resolves to
 * `null` and the page answers 404 — the same answer as a reference that does not exist,
 * so the URL cannot be used to probe which leases are real.
 */
import { notFound, redirect } from "next/navigation";
import { getCurrentTenant } from "../../../../auth/current-tenant";
import { getBalance, getEntries, getLease, getRentHistory } from "../../../../db/tenant-queries";
import { chf, jour, roleBail, statutBail, statutEcriture, typeEcriture } from "../../format";
import styles from "../../tenant.module.css";

export const metadata = { title: "Mon bail — Portail locataire" };

export default async function BailPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const bail = getLease(tenant.tenantRef, ref);
  if (!bail) notFound();

  const entries = getEntries(tenant.tenantRef, undefined, bail.leaseRef);
  const solde = getBalance(tenant.tenantRef, undefined, bail.leaseRef);
  const loyers = getRentHistory(tenant.tenantRef, bail.leaseRef);

  return (
    <>
      <h1>Bail {bail.leaseRef}</h1>
      <p className="lead">
        {bail.unitLabel ?? bail.unitRef} —{" "}
        {[bail.address, [bail.postalCode, bail.locality].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ")}
      </p>

      <div className={styles.grid}>
        <div className="card">
          <h2>Conditions</h2>
          <ul className={styles.rows}>
            <li>
              <span className={styles.key}>Statut</span>
              <span className={styles.tag}>{statutBail(bail.status)}</span>
            </li>
            <li>
              <span className={styles.key}>Votre rôle</span>
              <span>{roleBail(bail.role)}</span>
            </li>
            <li>
              <span className={styles.key}>Début</span>
              <span>{jour(bail.startsOn)}</span>
            </li>
            <li>
              <span className={styles.key}>Fin</span>
              <span>{bail.endsOn ? jour(bail.endsOn) : "indéterminée"}</span>
            </li>
            {bail.noticeOn ? (
              <li>
                <span className={styles.key}>Résiliation</span>
                <span>{jour(bail.noticeOn)}</span>
              </li>
            ) : null}
            <li>
              <span className={styles.key}>Solde du bail</span>
              <span className={`${styles.amount} ${solde > 0 ? styles.debt : styles.credit}`}>
                {chf(solde)}
              </span>
            </li>
          </ul>
        </div>

        <div className="card">
          <h2>Loyer</h2>
          {loyers.length === 0 ? (
            <p className={styles.empty}>Aucun loyer enregistré pour ce bail.</p>
          ) : (
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Dès le</th>
                    <th>Base</th>
                    <th>Charges</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {loyers.map((loyer) => (
                    <tr key={`${loyer.effectiveFrom}-${loyer.totalChf}`}>
                      <td>{jour(loyer.effectiveFrom)}</td>
                      <td className={styles.amount}>{chf(loyer.baseRentChf)}</td>
                      <td className={styles.amount}>
                        {chf((loyer.serviceChargesChf ?? 0) + (loyer.parkingChargesChf ?? 0))}
                      </td>
                      <td className={styles.amount}>{chf(loyer.totalChf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Écritures ({entries.length})</h2>
        {entries.length === 0 ? (
          <p className={styles.empty}>Aucune écriture sur ce bail.</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Échéance</th>
                  <th>Libellé</th>
                  <th>Réglé le</th>
                  <th>Statut</th>
                  <th>Montant</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.entryRef}>
                    <td>{jour(entry.dueOn)}</td>
                    <td>{entry.description ?? typeEcriture(entry.kind)}</td>
                    <td>{entry.settledOn ? jour(entry.settledOn) : "—"}</td>
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
      </div>
    </>
  );
}
