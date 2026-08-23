/** French/Swiss display helpers. Server-side only: no client formatting, no hydration
 * mismatch between the server's locale and the browser's. */

const CHF = new Intl.NumberFormat("fr-CH", {
  style: "currency",
  currency: "CHF",
  minimumFractionDigits: 2,
});

export function chf(amount: number | null | undefined): string {
  return CHF.format(amount ?? 0);
}

/** `2023-04-06` → `06.04.2023`. Dates arrive as ISO strings and are shown as written —
 * no `new Date()` round trip, which would shift a date-only value across a timezone. */
export function jour(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [date] = iso.split("T");
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : iso;
}

const LEASE_STATUS: Record<string, string> = {
  active: "actif",
  notice_given: "résilié",
  upcoming: "à venir",
  ended: "terminé",
  terminated: "terminé",
};

const ENTRY_STATUS: Record<string, string> = {
  cleared: "réglé",
  overdue: "en retard",
  partially_paid: "partiellement réglé",
  open: "ouvert",
};

const ENTRY_KIND: Record<string, string> = {
  rent: "Loyer",
  payment: "Paiement",
};

const ROLE: Record<string, string> = {
  primary_payer: "titulaire principal",
  co_tenant: "co-titulaire",
};

const MAINTENANCE_CATEGORY: Record<string, string> = {
  common_area: "parties communes",
  heating: "chauffage",
  elevator: "ascenseur",
  facade: "façade",
  plumbing: "sanitaire",
};

const label = (dictionary: Record<string, string>, value: string | null | undefined): string =>
  value ? (dictionary[value] ?? value.replace(/_/g, " ")) : "—";

export const statutBail = (value: string | null | undefined) => label(LEASE_STATUS, value);
export const statutEcriture = (value: string | null | undefined) => label(ENTRY_STATUS, value);
export const typeEcriture = (value: string | null | undefined) => label(ENTRY_KIND, value);
export const roleBail = (value: string | null | undefined) => label(ROLE, value);
export const categorieEntretien = (value: string | null | undefined) =>
  label(MAINTENANCE_CATEGORY, value);
