/**
 * "Synchronisation" — where the mirror stands and what the last runs did.
 *
 * The cursor is the number that explains everything else: `sync-events?after=<cursor>` is
 * what the next run will ask the ERP, so a cursor of 0 means the next incremental sync
 * would replay the whole stream.
 */
import { db } from "../../../../db/client";
import { readCursor } from "../../../../sync/cursor";
import { listRecentSyncRuns } from "../../../../sync/index";
import { formatDateTime, formatNumber } from "../../../../tickets/format";
import { countMirrorRows } from "../../../../tickets/management-queries";
import styles from "../../../../tickets/ui.module.css";
import { RelaunchButton } from "./relaunch-button";

export const dynamic = "force-dynamic";

export default function SynchronisationPage() {
  const cursor = readCursor(db);
  const runs = listRecentSyncRuns(10);
  const counts = countMirrorRows();
  const mirrored = counts.reduce((total, row) => total + row.rows, 0);

  return (
    <>
      <h1>Synchronisation</h1>
      <p className="lead">État du miroir local de l'ERP et des dernières exécutions.</p>

      <div className="card">
        <h2>État</h2>
        <div className={styles.stat}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Curseur</span>
            <span className={styles.statValue}>{formatNumber(cursor)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Lignes miroir</span>
            <span className={styles.statValue}>{formatNumber(mirrored)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Exécutions</span>
            <span className={styles.statValue}>{formatNumber(runs.length)}</span>
          </div>
        </div>
        <div className={styles.actions} style={{ marginTop: 16, marginBottom: 0 }}>
          <RelaunchButton />
        </div>
        <p className={styles.notice}>
          La synchronisation incrémentale lit <code>sync-events?after={formatNumber(cursor)}</code>{" "}
          et n'applique que les changements plus récents.
        </p>
      </div>

      <div className="card">
        <h2>Dernières exécutions ({runs.length})</h2>
        {runs.length === 0 ? (
          <p className={styles.empty}>
            Aucune exécution enregistrée. Lancez <code>npm run sync:full</code> puis{" "}
            <code>npm run sync</code>, ou utilisez le bouton ci-dessus.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Type</th>
                  <th>Événements</th>
                  <th>Curseur</th>
                  <th>Statut</th>
                  <th>Erreur</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className={styles.num}>{formatDateTime(run.startedAt)}</td>
                    <td className={styles.num}>{formatDateTime(run.finishedAt)}</td>
                    <td className={styles.muted}>
                      {run.kind === "full" ? "Import complet" : "Incrémentale"}
                    </td>
                    <td className={styles.num}>{formatNumber(run.eventsApplied)}</td>
                    <td className={styles.num}>
                      {formatNumber(run.cursorBefore ?? 0)} → {formatNumber(run.cursorAfter ?? 0)}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[run.status]}`}>{run.status}</span>
                    </td>
                    <td className={styles.muted}>{run.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Lignes par table</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Table</th>
                <th>Lignes actives</th>
                <th>Supprimées (soft)</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((row) => (
                <tr key={row.table}>
                  <td>{row.table}</td>
                  <td className={styles.num}>{formatNumber(row.rows)}</td>
                  <td className={`${styles.num} ${styles.muted}`}>{formatNumber(row.deleted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.notice}>
          Les lignes supprimées côté ERP sont masquées, jamais effacées (<code>deleted_at</code>).
        </p>
      </div>
    </>
  );
}
