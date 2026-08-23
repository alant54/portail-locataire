"use client";

/**
 * "Relancer la synchro" — runs the incremental sync inline and re-renders the page.
 *
 * A failed run is a normal outcome, not a crash: in a worktree without `.env.local` the
 * ERP is simply unreachable, and the run is recorded as failed with its error, which is
 * what the table below the button shows.
 */
import { useActionState } from "react";
import { EMPTY_MESSAGE_STATE } from "../../../../tickets/form-state";
import styles from "../../../../tickets/ui.module.css";
import { runSyncAction } from "../actions";

export function RelaunchButton() {
  const [state, formAction, pending] = useActionState(runSyncAction, EMPTY_MESSAGE_STATE);

  return (
    <form action={formAction}>
      <button className={styles.button} type="submit" disabled={pending}>
        {pending ? "Synchronisation en cours…" : "Relancer la synchro"}
      </button>
      {state.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
