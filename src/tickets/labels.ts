/**
 * The vocabulary of the ticket domain: statuses, categories, their French labels and
 * the input rules — everything the forms need and nothing that touches the database.
 *
 * Split out of `service.ts` on purpose: a client component that imported a label from
 * the service would drag `db/client` — and with it the native `better-sqlite3` binding —
 * into the browser bundle, which fails to build.
 */

export type TicketStatus = "open" | "in_progress" | "closed";

/** The categories the form offers. French, like the rest of the UI. */
export const CATEGORIES = ["plomberie", "chauffage", "cles", "electricite", "autre"] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUSES: TicketStatus[] = ["open", "in_progress", "closed"];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Ouverte",
  in_progress: "En cours",
  closed: "Clôturée",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  plomberie: "Plomberie",
  chauffage: "Chauffage",
  cles: "Clés / accès",
  electricite: "Électricité",
  autre: "Autre",
};

export type CreateTicketInput = { category: string; title: string; body: string };
export type ValidationError = { field: "category" | "title" | "body"; message: string };

const TITLE_MAX = 120;
const BODY_MAX = 4000;

/**
 * Validates what the tenant typed. Returns the cleaned values, or one problem per
 * field — the form re-renders with these messages instead of throwing.
 */
export function validateTicketInput(
  input: CreateTicketInput,
):
  | { ok: true; value: { category: Category; title: string; body: string } }
  | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const category = (input.category ?? "").trim() as Category;
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();

  if (!CATEGORIES.includes(category)) {
    errors.push({ field: "category", message: "Choisissez une catégorie." });
  }
  if (title.length === 0) errors.push({ field: "title", message: "Le titre est obligatoire." });
  else if (title.length > TITLE_MAX) {
    errors.push({
      field: "title",
      message: `Le titre ne peut pas dépasser ${TITLE_MAX} caractères.`,
    });
  }
  if (body.length === 0) errors.push({ field: "body", message: "La description est obligatoire." });
  else if (body.length > BODY_MAX) {
    errors.push({
      field: "body",
      message: `La description ne peut pas dépasser ${BODY_MAX} caractères.`,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { category, title, body } };
}

