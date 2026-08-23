/**
 * Management home: the three numbers a manager opens the portal for, each linking to the
 * screen that explains it.
 */
import Link from "next/link";
import { db } from "../../../db/client";
import { readCursor } from "../../../sync/cursor";
import { listRecentSyncRuns } from "../../../sync/index";
import { formatDateTime, formatNumber } from "../../../tickets/format";
import { STATUS_LABELS } from "../../../tickets/labels";
import { listRecentLogins } from "../../../tickets/management-queries";
import { listAll } from "../../../tickets/service";
import styles from "../../../tickets/ui.module.css";

export const dynamic = "force-dynamic";

export default function GerancePage() {
  const requests = listAll({});
  const open = requests.filter((request) => request.status === "open").length;
  const inProgress = requests.filter((request) => request.status === "in_progress").length;
  const [lastRun] = listRecentSyncRuns(1);
  const [lastLogin] = listRecentLogins(1);

  return (
    <>
      <h1>Gérance</h1>
      <p className="lead">Vue d'ensemble du portail locataire.</p>

      <div className="card">
        <h2>Demandes</h2>
        <div className={styles.stat}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{STATUS_LABELS.open}</span>
            <span className={styles.statValue}>{formatNumber(open)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{STATUS_LABELS.in_progress}</span>
            <span className={styles.statValue}>{formatNumber(inProgress)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total</span>
            <span className={styles.statValue}>{formatNumber(requests.length)}</span>
          </div>
        </div>
        <div className={styles.actions} style={{ marginTop: 16, marginBottom: 0 }}>
          <Link className={styles.buttonQuiet} href="/admin/requests">
            Ouvrir l'inbox
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>Dernière connexion</h2>
        {lastLogin ? (
          <p>
            {lastLogin.email ?? "compte inconnu"} · {formatDateTime(lastLogin.at)} ·{" "}
            <span
              className={`${styles.badge} ${
                lastLogin.outcome === "success" ? styles.ok : styles.failed
              }`}
            >
              {lastLogin.outcome === "success" ? "Réussie" : "Échouée"}
            </span>
          </p>
        ) : (
          <p className={styles.empty}>Aucune connexion enregistrée.</p>
        )}
        <div className={styles.actions} style={{ marginTop: 12, marginBottom: 0 }}>
          <Link className={styles.buttonQuiet} href="/admin/logins">
            Voir les connexions
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>Synchronisation</h2>
        <p>
          Curseur <strong className={styles.num}>{formatNumber(readCursor(db))}</strong>
          {lastRun
            ? ` · dernière exécution ${formatDateTime(lastRun.startedAt)} (${lastRun.status})`
            : " · aucune exécution enregistrée"}
        </p>
        <div className={styles.actions} style={{ marginTop: 12, marginBottom: 0 }}>
          <Link className={styles.buttonQuiet} href="/admin/sync">
            Voir la synchronisation
          </Link>
        </div>
      </div>
    </>
  );
}
