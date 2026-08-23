"use server";

/**
 * Server actions for the tenant side of the ticket domain.
 *
 * A server action is reachable by a direct POST, not only through our own form, so the
 * session is resolved here on every call and the tenant's references are read from it —
 * never from the submitted `FormData`. The only field the form is trusted with is the
 * ticket id, and the service scopes that read by `tenantRef` anyway, so a foreign id
 * behaves exactly like a nonexistent one.
 *
 * Every export here must be an async function: that is the rule for a `"use server"`
 * module, which is why the form-state shapes live in `src/tickets/form-state.ts`.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "../../../auth/current-tenant";
import type { CreateFormState, MessageFormState } from "../../../tickets/form-state";
import { addComment, createTicket } from "../../../tickets/service";

export async function createTicketAction(
  _previous: CreateFormState,
  formData: FormData,
): Promise<CreateFormState> {
  const values = {
    category: String(formData.get("category") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
  };

  const tenant = getCurrentTenant();
  if (!tenant) {
    return {
      errors: [
        { field: "title", message: "Votre session a expiré. Reconnectez-vous pour envoyer la demande." },
      ],
      values,
    };
  }

  const result = createTicket(tenant, values);
  if (!result.ok) return { errors: result.errors, values };

  revalidatePath("/tickets");
  // Outside any try/catch on purpose: `redirect()` works by throwing.
  redirect(`/tickets/${result.ticket.id}`);
}

export async function addTenantCommentAction(
  _previous: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const tenant = getCurrentTenant();
  if (!tenant) return { error: "Votre session a expiré. Reconnectez-vous pour commenter." };

  const ticketId = String(formData.get("ticketId") ?? "");
  const body = String(formData.get("body") ?? "");
  if (body.trim().length === 0) return { error: "Écrivez un message avant d'envoyer." };

  const comment = addComment({
    ticketId,
    authorKind: "tenant",
    body,
    tenantRef: tenant.tenantRef,
  });
  if (!comment) {
    return { error: "Cette demande est clôturée ou n'existe pas : le message n'a pas été envoyé." };
  }

  revalidatePath(`/tickets/${ticketId}`);
  return { error: null };
}
