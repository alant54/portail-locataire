/**
 * The single definition of "may see the management area".
 *
 * The route gate in `src/app/(admin)/layout.tsx` protects pages, but a server action is
 * reachable by a direct POST without ever rendering a page — so every management action
 * re-checks the session through this function rather than trusting the layout.
 */
import type { SessionLookup } from "../contracts";
import { getCurrentUser } from "../auth/current-user";

export async function sessionIsManager(lookup: SessionLookup = {}): Promise<boolean> {
  return (await getCurrentUser(lookup))?.role === "manager";
}
