/**
 * "Mes demandes" — the tenant's own requests, newest first.
 *
 * The list is scoped by the session's `tenantRef`; there is no URL parameter to widen it.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "../../../auth/current-tenant";
import { formatDateTime } from "../../../tickets/format";
import {
  CATEGORY_LABELS,
  listForTenant,
  STATUS_LABELS,
  type Category,
} from "../../../tickets/service";
import styles from "../../../tickets/ui.module.css";

export const dynamic = "force-dynamic";

export default function DemandesPage() {
  const tenant = getCurrentTenant();
  // Lane B's (tenant) layout turns anonymous visitors away before this renders; if it
  // ever does not, showing nothing is the safe failure.
  if (!tenant) notFound();

  const requests = listForTenant(tenant.tenantRef);

  return (
    <>
      <h1>Mes demandes</h1>
      <p className="lead">Vos demandes à la gérance et leur suivi.</p>

      <div className={styles.actions}>
        <Link className={styles.button} href="/tickets/new">
          Nouvelle demande
        </Link>
      </div>

      <div className="card">
        <h2>Demandes ({requests.length})</h2>
        {requests.length === 0 ? (
          <p className={styles.empty}>
            Vous n'avez pas encore de demande. Utilisez « Nouvelle demande » pour en ouvrir une.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Objet</th>
                  <th>Catégorie</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className={styles.num}>{formatDateTime(request.createdAt)}</td>
                    <td>
                      <Link href={`/tickets/${request.id}`}>{request.title}</Link>
                    </td>
                    <td className={styles.muted}>
                      {CATEGORY_LABELS[request.category as Category] ?? request.category}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[request.status]}`}>
                        {STATUS_LABELS[request.status]}
                      </span>
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
