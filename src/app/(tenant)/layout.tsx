/**
 * OWNER: lane B (auth + tenant product).
 *
 * Pass-through for now. Lane B adds the session gate here: an anonymous or expired
 * session is redirected to /login, and the resolved tenant is what every page below
 * reads from. Lane C must not edit this file — the tenant tickets pages live under
 * (tenant)/tickets/ and inherit this gate for free.
 */
import type { ReactNode } from "react";

export default function TenantLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
