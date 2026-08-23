"use client";

/**
 * The two management controls on a request: move its status, and answer the tenant.
 * Both post to server actions that re-check the manager session themselves.
 */
import { useActionState } from "react";
import { EMPTY_MESSAGE_STATE } from "../../../../../tickets/form-state";
import { STATUSES, STATUS_LABELS, type TicketStatus } from "../../../../../tickets/labels";
import styles from "../../../../../tickets/ui.module.css";
import { addManagerCommentAction, setTicketStatusAction } from "../../actions";

export function StatusControl({
  ticketId,
  current,
}: {
  ticketId: string;
  current: TicketStatus;
}) {
  const [state, formAction, pending] = useActionState(setTicketStatusAction, EMPTY_MESSAGE_STATE);

  return (
    <form action={formAction} className={styles.inline}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <select className={styles.select} name="status" defaultValue={current} aria-label="Statut">
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <button className={styles.button} type="submit" disabled={pending}>
        {pending ? "Mise à jour…" : "Changer le statut"}
      </button>
      {state.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}

export function ManagerComment({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(
    addManagerCommentAction,
    EMPTY_MESSAGE_STATE,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className={styles.field}>
        <span>Message au locataire</span>
        <textarea
          className={styles.textarea}
          name="body"
          maxLength={4000}
          placeholder="Ce qui a été planifié, avec qui, quand…"
        />
      </label>
      {state.error && <p className={styles.error}>{state.error}</p>}
      <button className={styles.button} type="submit" disabled={pending}>
        {pending ? "Envoi…" : "Envoyer au locataire"}
      </button>
    </form>
  );
}
