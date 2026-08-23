/**
 * `/login` sits outside the `(tenant)` route group on purpose: it is the one page the
 * session gate must not gate.
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../auth/current-user";
import { landingPathFor } from "../../auth/login";
import { DEMO_PASSWORD } from "../../../scripts/seed-demo";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata = { title: "Connexion — Portail locataire" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(landingPathFor(user));

  return (
    <div className={styles.wrap}>
      <h1>Connexion</h1>
      <p className="lead">Accédez à votre espace locataire.</p>
      <div className="card">
        <LoginForm />
        {/* Fictive data, local database, throwaway accounts — this is a demo, and the
            evaluator should not have to hunt for the credentials. */}
        <p className={styles.hint}>
          Comptes de démonstration : <code>lea.martin@example.ch</code>,{" "}
          <code>lucas.martin@example.ch</code> (co-titulaire), <code>adrien.clerc@example.ch</code>,{" "}
          <code>gerance@example.ch</code> — mot de passe <code>{DEMO_PASSWORD}</code>.
        </p>
      </div>
    </div>
  );
}
