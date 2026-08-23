/**
 * One request, management side: the whole timeline, the status control and the reply box.
 * This is where the round-trip closes — what a manager writes here is what the tenant
 * reads on their own detail page.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "../../../../../tickets/format";
import { CATEGORY_LABELS, STATUS_LABELS, type Category } from "../../../../../tickets/labels";
import { getForManager } from "../../../../../tickets/service";
import styles from "../../../../../tickets/ui.module.css";
import { ManagerComment, StatusControl } from "./manage-forms";

export const dynamic = "force-dynamic";

export default async function DemandeGerancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = getForManager(id);
  if (!found) notFound();

  const { ticket, timeline } = found;

  return (
    <>
      <h1>{ticket.title}</h1>
      <p className="lead">
        {ticket.tenantRef} · logement {ticket.unitRef ?? "—"} · bail {ticket.leaseRef ?? "—"} ·{" "}
        {CATEGORY_LABELS[ticket.category as Category] ?? ticket.category} · ouverte le{" "}
        {formatDateTime(ticket.createdAt)}
      </p>

      <div className="card">
        <h2>Statut</h2>
        <div className={styles.inline}>
          <span className={`${styles.badge} ${styles[ticket.status]}`}>
            {STATUS_LABELS[ticket.status]}
          </span>
          <StatusControl ticketId={ticket.id} current={ticket.status} />
        </div>
      </div>

      <div className="card">
        <h2>Demande du locataire</h2>
        <p className={styles.entryBody}>{ticket.body}</p>
      </div>

      <div className="card">
        <h2>Historique</h2>
        {timeline.length === 0 ? (
          <p className={styles.empty}>Rien depuis l'ouverture.</p>
        ) : (
          <ul className={styles.timeline}>
            {timeline.map((entry) => (
              <li className={styles.entry} key={entry.id}>
                <div className={styles.entryHead}>
                  <span className={styles.author}>
                    {entry.authorKind === "manager" ? "Gérance" : "Locataire"}
                  </span>
                  <span className={styles.num}>{formatDateTime(entry.createdAt)}</span>
                </div>
                <p className={entry.kind === "status" ? styles.statusEntry : styles.entryBody}>
                  {entry.kind === "status" ? `Statut : ${entry.body}` : entry.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Répondre au locataire</h2>
        <ManagerComment ticketId={ticket.id} />
      </div>

      <div className={styles.actions}>
        <Link className={styles.buttonQuiet} href="/admin/requests">
          Retour aux demandes
        </Link>
      </div>
    </>
  );
}
