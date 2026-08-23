/**
 * Display helpers shared by the tenant and management screens.
 *
 * The time zone is pinned to Europe/Zurich rather than left to the runtime: the data is
 * Vaud property management, and a server rendering in UTC would otherwise show a request
 * opened at 00:30 as the previous day.
 */
const DATE_TIME = new Intl.DateTimeFormat("fr-CH", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Zurich",
});

const DATE = new Intl.DateTimeFormat("fr-CH", {
  dateStyle: "short",
  timeZone: "Europe/Zurich",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? "—" : DATE_TIME.format(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? "—" : DATE.format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-CH").format(value);
}
