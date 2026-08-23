/**
 * "Connexions" — who got in, who tried and failed, and when each account was last seen.
 *
 * Failures matter as much as successes here, which is why the screen reads
 * `login_events.outcome` and falls back to `login_events.email`: an attempt on an address
 * that owns no account has no `user_id` to join on, and is exactly what a manager wants
 * to notice.
 */
import { formatDateTime } from "../../../../tickets/format";
import {
  listAccountsWithLastLogin,
  listRecentLogins,
} from "../../../../tickets/management-queries";
import styles from "../../../../tickets/ui.module.css";

export const dynamic = "force-dynamic";

export default function ConnexionsPage() {
  const events = listRecentLogins(50);
  const accounts = listAccountsWithLastLogin();

  return (
    <>
      <h1>Connexions</h1>
      <p className="lead">Les 50 dernières tentatives, et la dernière connexion par compte.</p>

      <div className="card">
        <h2>Dernières tentatives ({events.length})</h2>
        {events.length === 0 ? (
          <p className={styles.empty}>
            Aucune connexion enregistrée pour l'instant. Les comptes de démonstration arrivent
            avec l'authentification (lane B).
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Compte</th>
                  <th>Rôle</th>
                  <th>Locataire</th>
                  <th>Résultat</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className={styles.num}>{formatDateTime(event.at)}</td>
                    <td>{event.email ?? "—"}</td>
                    <td className={styles.muted}>{event.role ?? "compte inconnu"}</td>
                    <td className={styles.num}>{event.tenantRef ?? "—"}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          event.outcome === "success" ? styles.ok : styles.failed
                        }`}
                      >
                        {event.outcome === "success" ? "Réussie" : "Échouée"}
                      </span>
                    </td>
                    <td className={styles.muted}>{event.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Comptes ({accounts.length})</h2>
        {accounts.length === 0 ? (
          <p className={styles.empty}>Aucun compte n'existe encore.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Compte</th>
                  <th>Rôle</th>
                  <th>Locataire</th>
                  <th>Dernière connexion</th>
                  <th>Échecs</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.email}>
                    <td>{account.displayName ? `${account.displayName} · ` : ""}{account.email}</td>
                    <td className={styles.muted}>{account.role}</td>
                    <td className={styles.num}>{account.tenantRef ?? "—"}</td>
                    <td className={styles.num}>
                      {account.lastSuccessAt ? formatDateTime(account.lastSuccessAt) : "jamais"}
                    </td>
                    <td className={styles.num}>{account.failures ?? 0}</td>
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
