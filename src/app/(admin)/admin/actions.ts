"use server";

/**
 * Server actions for the management screens.
 *
 * The `(admin)` layout gates pages, not POSTs: a server action can be invoked directly,
 * without the layout ever rendering. Every action therefore re-checks the session itself
 * and answers a tenant exactly as the gate does — `notFound()`, never a message that
 * would confirm the action exists.
 *
 * Every export is an async function; the form-state shapes live in `src/tickets/form-state.ts`.
 */
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import type { MessageFormState } from "../../../tickets/form-state";
import { sessionIsManager } from "../../../tickets/guard";
import { STATUSES, type TicketStatus } from "../../../tickets/labels";
import { addComment, setStatus } from "../../../tickets/service";
import { runIncrementalSync } from "../../../sync/index";

function requireManager() {
  if (!sessionIsManager()) notFound();
}

export async function setTicketStatusAction(
  _previous: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  requireManager();

  const ticketId = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "") as TicketStatus;
  if (!STATUSES.includes(status)) return { error: "Statut inconnu." };

  const updated = setStatus(ticketId, status);
  if (!updated) return { error: "Cette demande n'existe pas." };

  revalidatePath("/admin/requests");
  revalidatePath(`/tickets/${ticketId}`);
  return { error: null };
}

export async function addManagerCommentAction(
  _previous: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  requireManager();

  const ticketId = String(formData.get("ticketId") ?? "");
  const body = String(formData.get("body") ?? "");
  if (body.trim().length === 0) return { error: "Écrivez un message avant d'envoyer." };

  const comment = addComment({ ticketId, authorKind: "manager", body });
  if (!comment) return { error: "Cette demande n'existe pas." };

  revalidatePath("/admin/requests");
  revalidatePath(`/tickets/${ticketId}`);
  return { error: null };
}

/**
 * Runs the incremental sync inline and re-renders (PLAN.md C1). A run that fails — no
 * `.env.local` in this worktree, ERP unreachable — is a normal outcome: lane A records it
 * in `sync_runs` with its error, and the screen shows it.
 */
export async function runSyncAction(_previous: MessageFormState): Promise<MessageFormState> {
  requireManager();

  try {
    const summary = await runIncrementalSync();
    revalidatePath("/admin/sync");
    return {
      error:
        summary.status === "ok"
          ? null
          : `La synchronisation a échoué : ${summary.error ?? "erreur inconnue"}`,
    };
  } catch (error) {
    revalidatePath("/admin/sync");
    return { error: `La synchronisation a échoué : ${(error as Error).message}` };
  }
}
