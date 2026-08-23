/**
 * `/bail` has no reference to show, so it sends the tenant to their current lease. The
 * detail itself lives at `/bail/[ref]`, which is where the isolation guarantee is tested.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "../../../auth/current-tenant";
import { getLeases } from "../../../db/tenant-queries";
import { roleBail, statutBail } from "../format";
import styles from "../tenant.module.css";

export const metadata = { title: "Mon bail — Portail locataire" };

export default async function BailIndexPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const baux = getLeases(tenant.tenantRef);
  if (baux.length === 1) redirect(`/bail/${baux[0].leaseRef}`);

  return (
    <>
      <h1>Mes baux</h1>
      <p className="lead">
        {baux.length === 0 ? "Aucun bail n'est rattaché à votre compte." : "Choisissez un bail."}
      </p>
      {baux.map((bail) => (
        <div className="card" key={bail.leaseRef}>
          <h2>{bail.leaseRef}</h2>
          <p className={styles.headline}>{bail.unitLabel ?? bail.unitRef ?? "—"}</p>
          <p className={styles.sub}>
            <span className={styles.tag}>{statutBail(bail.status)}</span> · {roleBail(bail.role)}
          </p>
          <p className={styles.actions}>
            <Link href={`/bail/${bail.leaseRef}`}>Voir le détail →</Link>
          </p>
        </div>
      ))}
    </>
  );
}
