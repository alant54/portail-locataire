/**
 * OWNER: lane C (tickets + management screens).
 *
 * Pass-through for now. Lane C adds the manager gate here: anything but a session
 * whose user has `role = manager` gets a 404 (not a redirect — a tenant should not
 * learn that /admin exists). Lane B must not edit this file; it gates (tenant) only.
 */
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
