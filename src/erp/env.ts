/**
 * Reads a variable from the process environment, falling back to `.env.local`.
 *
 * `tsx scripts/*.ts` does not load dotenv files, and `package.json` is frozen, so we
 * cannot add `dotenv`. Only the handful of keys the sync asks for are ever read.
 */
import fs from "node:fs";

const cache = new Map<string, string | undefined>();

function fromFile(key: string): string | undefined {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trimStart();
      if (!trimmed.includes("=") || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (trimmed.slice(0, i).trim() !== key) continue;
      const value = trimmed.slice(i + 1).trim();
      if (value) return value;
    }
  }
  return undefined;
}

export function env(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!cache.has(key)) cache.set(key, fromFile(key));
  return cache.get(key);
}

/** A positive integer, or undefined when unset/empty/invalid ("no cap"). */
export function envInt(key: string): number | undefined {
  const raw = env(key);
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
