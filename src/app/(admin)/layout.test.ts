/**
 * The management gate (specs/management-screens).
 *
 * The gate is one function, so this test calls it directly with each kind of session
 * instead of booting a server: what must be proven is that everything except a manager
 * is refused, and refused with a 404 rather than a redirect — a redirect to a login page
 * would already disclose that the area exists.
 */
import { expect, test, vi } from "vitest";
import type { SessionUser } from "../../contracts";

const currentUser = vi.hoisted(() => ({ value: null as SessionUser | null }));
vi.mock("../../auth/current-user", () => ({ getCurrentUser: () => currentUser.value }));

const { default: AdminLayout } = await import("./layout");

const manager: SessionUser = {
  userId: "u-1",
  email: "gerance@example.ch",
  role: "manager",
  tenantRef: null,
};
const tenant: SessionUser = {
  userId: "u-2",
  email: "locataire@example.ch",
  role: "tenant",
  tenantRef: "TEN-00005",
};

/** What `notFound()` throws, and what a redirect would have thrown instead. */
function outcomeOf(user: SessionUser | null): "rendered" | "not-found" | string {
  currentUser.value = user;
  try {
    AdminLayout({ children: null });
    return "rendered";
  } catch (error) {
    const digest = String((error as { digest?: string }).digest ?? error);
    if (digest.includes("NEXT_HTTP_ERROR_FALLBACK;404")) return "not-found";
    return digest;
  }
}

test("a manager reaches the management area", () => {
  expect(outcomeOf(manager)).toBe("rendered");
});

test("a signed-in tenant gets 404, not a redirect", () => {
  expect(outcomeOf(tenant)).toBe("not-found");
});

test("an anonymous or expired session gets 404", () => {
  expect(outcomeOf(null)).toBe("not-found");
});

test("a role the schema does not know is refused too", () => {
  // Defensive: the gate admits `manager` rather than refusing `tenant`, so a future
  // role (auditor, concierge…) is locked out by default instead of let in.
  expect(outcomeOf({ ...tenant, role: "auditor" as SessionUser["role"] })).toBe("not-found");
});
