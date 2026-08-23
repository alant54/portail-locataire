"use client";

/**
 * The request form. A client component only so that `useActionState` can render the
 * validation messages the server action returns and keep what the tenant typed; the
 * validation itself runs server-side, in the ticket service.
 */
import { useActionState } from "react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type ValidationError,
} from "../../../../tickets/labels";
import styles from "../../../../tickets/ui.module.css";
import { EMPTY_CREATE_STATE } from "../../../../tickets/form-state";
import { createTicketAction } from "../actions";

function messageFor(errors: ValidationError[], field: ValidationError["field"]) {
  return errors.find((error) => error.field === field)?.message;
}

export function NewTicketForm() {
  const [state, formAction, pending] = useActionState(createTicketAction, EMPTY_CREATE_STATE);
  const { errors, values } = state;

  return (
    <form action={formAction}>
      <label className={styles.field}>
        <span>Catégorie</span>
        <select
          className={styles.select}
          name="category"
          defaultValue={values.category}
          aria-invalid={messageFor(errors, "category") ? true : undefined}
        >
          <option value="">Choisir…</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        {messageFor(errors, "category") && (
          <p className={styles.error}>{messageFor(errors, "category")}</p>
        )}
      </label>

      <label className={styles.field}>
        <span>Objet</span>
        <input
          className={styles.input}
          type="text"
          name="title"
          maxLength={120}
          defaultValue={values.title}
          placeholder="Fuite sous l'évier"
          aria-invalid={messageFor(errors, "title") ? true : undefined}
        />
        {messageFor(errors, "title") && (
          <p className={styles.error}>{messageFor(errors, "title")}</p>
        )}
      </label>

      <label className={styles.field}>
        <span>Description</span>
        <textarea
          className={styles.textarea}
          name="body"
          maxLength={4000}
          defaultValue={values.body}
          placeholder="Depuis quand, où exactement, ce que vous avez déjà tenté…"
          aria-invalid={messageFor(errors, "body") ? true : undefined}
        />
        {messageFor(errors, "body") && <p className={styles.error}>{messageFor(errors, "body")}</p>}
      </label>

      <button className={styles.button} type="submit" disabled={pending}>
        {pending ? "Envoi…" : "Envoyer la demande"}
      </button>
    </form>
  );
}
