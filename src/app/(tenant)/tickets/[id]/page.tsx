/**
 * One request: what the tenant asked, what happened since, and where to answer.
 *
 * The read is scoped by the session's `tenantRef`, so another tenant's id yields the
 * same 404 as an id that never existed — the page cannot even tell the difference.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "../../../../auth/current-tenant";
import { formatDateTime } from "../../../../tickets/format";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  getForTenant,
  type Category,
} from "../../../../tickets/service";
import styles from "../../../../tickets/ui.module.css";
import { CommentForm } from "./comment-form";

export const dynamic = "force-dynamic";

export default async function DemandeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = getCurrentTenant();
  if (!tenant) notFound();

  const found = getForTenant(tenant.tenantRef, id);
  if (!found) notFound();

  const { ticket, timeline } = found;
  const closed = ticket.status === "closed";

  return (
    <>
      <h1>{ticket.title}</h1>
      <p className="lead">
        Demande ouverte le {formatDateTime(ticket.createdAt)} ·{" "}
        {CATEGORY_LABELS[ticket.category as Category] ?? ticket.category} ·{" "}
        <span className={`${styles.badge} ${styles[ticket.status]}`}>
          {STATUS_LABELS[ticket.status]}
        </span>
      </p>

      <div className="card">
        <h2>Votre description</h2>
        <p className={styles.entryBody}>{ticket.body}</p>
        <p className={styles.notice}>
          Logement {ticket.unitRef ?? "—"} · bail {ticket.leaseRef ?? "—"}
        </p>
      </div>

      <div className="card">
        <h2>Suivi</h2>
        {timeline.length === 0 ? (
          <p className={styles.empty}>
            Pas encore de réponse de la gérance. Vous serez informé ici de chaque changement.
          </p>
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
                <p
                  className={entry.kind === "status" ? styles.statusEntry : styles.entryBody}
                >
                  {entry.kind === "status" ? `Statut : ${entry.body}` : entry.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Répondre</h2>
        {closed ? (
          <p className={styles.empty}>
            Cette demande est clôturée. Ouvrez une nouvelle demande si le problème revient.
          </p>
        ) : (
          <CommentForm ticketId={ticket.id} />
        )}
      </div>

      <div className={styles.actions}>
        <Link className={styles.buttonQuiet} href="/tickets">
          Retour à mes demandes
        </Link>
      </div>
    </>
  );
}
