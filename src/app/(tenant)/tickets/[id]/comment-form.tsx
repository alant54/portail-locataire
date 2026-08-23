"use client";

/**
 * The tenant's reply box. `ticketId` travels in the form, and the action re-scopes it by
 * the session's tenant before writing — a tampered id resolves to nothing.
 */
import { useActionState } from "react";
import styles from "../../../../tickets/ui.module.css";
import { EMPTY_MESSAGE_STATE } from "../../../../tickets/form-state";
import { addTenantCommentAction } from "../actions";

export function CommentForm({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(
    addTenantCommentAction,
    EMPTY_MESSAGE_STATE,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className={styles.field}>
        <span>Votre message</span>
        <textarea
          className={styles.textarea}
          name="body"
          maxLength={4000}
          placeholder="Précision, disponibilité pour un rendez-vous…"
        />
      </label>
      {state.error && <p className={styles.error}>{state.error}</p>}
      <button className={styles.button} type="submit" disabled={pending}>
        {pending ? "Envoi…" : "Envoyer"}
      </button>
    </form>
  );
}
