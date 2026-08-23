/** "Nouvelle demande" — the form is a client component so it can show field errors. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "../../../../auth/current-tenant";
import styles from "../../../../tickets/ui.module.css";
import { NewTicketForm } from "./form";

export const dynamic = "force-dynamic";

export default function NouvelleDemandePage() {
  const tenant = getCurrentTenant();
  if (!tenant) notFound();

  return (
    <>
      <h1>Nouvelle demande</h1>
      <p className="lead">
        Décrivez le problème : la gérance la reçoit immédiatement et vous suivez son avancement
        depuis « Mes demandes ».
      </p>

      <div className="card">
        <h2>Votre demande</h2>
        <NewTicketForm />
        <p className={styles.notice}>
          La demande est enregistrée pour votre logement ({tenant.unitRef ?? "—"}, bail{" "}
          {tenant.leaseRef ?? "—"}). Ces références proviennent de votre session.
        </p>
      </div>

      <div className={styles.actions}>
        <Link className={styles.buttonQuiet} href="/tickets">
          Retour à mes demandes
        </Link>
      </div>
    </>
  );
}
