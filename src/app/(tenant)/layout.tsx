/**
 * OWNER: lane B (auth + tenant product).
 *
 * The session gate for every tenant page, including lane C's `(tenant)/tickets/` which
 * inherits it for free. There is deliberately no `middleware.ts` doing the same job
 * (design.md): middleware runs on another runtime, cannot open the database to check that
 * the session row still exists, and would be a second copy of this rule waiting to drift.
 *
 * A manager is signed in but has no tenant data to show, so they are sent to the
 * management area rather than to a dashboard that would have nothing in it.
 */
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../auth/current-user";

export default async function TenantLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "tenant") redirect("/admin");
  return <>{children}</>;
}
