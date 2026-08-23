/**
 * The shapes a form action hands back to its form, and their initial values.
 *
 * These live outside the `"use server"` action files on purpose: every export of a
 * `"use server"` module must be an async function, so a constant exported from there
 * reaches the client as `undefined` — with no build error, only a render crash.
 */
import type { ValidationError } from "./labels";

export type CreateFormState = {
  errors: ValidationError[];
  values: { category: string; title: string; body: string };
};

export const EMPTY_CREATE_STATE: CreateFormState = {
  errors: [],
  values: { category: "", title: "", body: "" },
};

export type MessageFormState = { error: string | null };

export const EMPTY_MESSAGE_STATE: MessageFormState = { error: null };
