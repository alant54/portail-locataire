/**
 * The login form's state shape, in its own module because it is imported from both sides
 * of the boundary: a `"use server"` file may only export async functions, and a client
 * component must not import the server module that owns the database handle.
 */
export interface LoginFormState {
  message: string;
}

export const EMPTY_LOGIN_STATE: LoginFormState = { message: "" };
