/**
 * Password hashing with Node's built-in `scrypt` — no dependency, so the frozen
 * `package.json` stays untouched (design.md).
 *
 * Stored format: `scrypt$<N>$<saltHex>$<keyHex>`. The parameters travel with the hash so
 * a later cost bump can re-hash on next login without a migration.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const COST = 16384;
const KEY_LENGTH = 32;

export function hashPassword(password: string, cost = COST): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LENGTH, { N: cost });
  return `scrypt$${cost}$${salt.toString("hex")}$${key.toString("hex")}`;
}

/**
 * Constant-time compare. A malformed or unknown-scheme hash verifies to `false` rather
 * than throwing: a corrupted row must read as "wrong password", never as a 500 that
 * tells the caller the account exists.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, costText, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !costText || !saltHex || !keyHex) return false;
  const cost = Number(costText);
  if (!Number.isInteger(cost) || cost <= 0) return false;

  const expected = Buffer.from(keyHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, { N: cost });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
