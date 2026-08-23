/**
 * The request inbox: every tenant's requests, filterable by status.
 *
 * The filter travels in the query string because it decides nothing about access — the
 * manager gate already did that, and this list is never scoped to a tenant.
 */
import Link from "next/link";
import { formatDateTime } from "../../../../tickets/format";
import {
  CATEGORY_LABELS,
  STATUSES,
  STATUS_LABELS,
  type Category,
  type TicketStatus,
} from "../../../../tickets/labels";
import { listAll } from "../../../../tickets/service";
import styles from "../../../../tickets/ui.module.css";

export const dynamic = "force-dynamic";

export default async function DemandesInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const requested = (await searchParams).status;
  const status = STATUSES.find((candidate) => candidate === requested);
  const requests = listAll(status ? { status } : {});
  const counts = countByStatus();

  return (
    <>
      <h1>Demandes</h1>
      <p className="lead">Toutes les demandes des locataires, la plus récente en premier.</p>

      <div className={styles.filters}>
        <Link className={status ? styles.filter : styles.filterActive} href="/admin/requests">
          Toutes ({counts.total})
        </Link>
        {STATUSES.map((candidate) => (
          <Link
            className={status === candidate ? styles.filterActive : styles.filter}
            key={candidate}
            href={`/admin/requests?status=${candidate}`}
          >
            {STATUS_LABELS[candidate]} ({counts[candidate]})
          </Link>
        ))}
      </div>

      <div className="card">
        <h2>{status ? STATUS_LABELS[status] : "Toutes les demandes"} ({requests.length})</h2>
        {requests.length === 0 ? (
          <p className={styles.empty}>Aucune demande dans cette vue.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Locataire</th>
                  <th>Logement</th>
                  <th>Objet</th>
                  <th>Catégorie</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className={styles.num}>{formatDateTime(request.createdAt)}</td>
                    <td className={styles.num}>{request.tenantRef}</td>
                    <td className={styles.num}>{request.unitRef ?? "—"}</td>
                    <td>
                      <Link href={`/admin/requests/${request.id}`}>{request.title}</Link>
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

function countByStatus(): Record<TicketStatus | "total", number> {
  const all = listAll({});
  return {
    total: all.length,
    open: all.filter((request) => request.status === "open").length,
    in_progress: all.filter((request) => request.status === "in_progress").length,
    closed: all.filter((request) => request.status === "closed").length,
  };
}
