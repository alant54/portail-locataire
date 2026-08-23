/**
 * Minimal paginated reader used by the Phase 0 scripts.
 *
 * Deliberately not `src/erp/client.ts`: that file is lane A's, with retry, backoff and
 * detail endpoints. Phase 0 only needs enough to pull fixtures once.
 */
import fs from "node:fs";
import type { ErpPage } from "../src/erp/types";

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      if (!out[key]) out[key] = line.slice(i + 1).trim();
    }
  }
  return out;
}

const env = loadEnv();
const BASE = env.ERP_API;
const KEY = env.ERP_PUBLISHABLE_KEY;
if (!BASE || !KEY) throw new Error("ERP_API and ERP_PUBLISHABLE_KEY must be set in .env.local");

export const PAGE_LIMIT = 1000;

export async function fetchPage<T>(
  resource: string,
  offset: number,
  params: Record<string, string> = {},
  limit = PAGE_LIMIT,
): Promise<ErpPage<T>> {
  const query = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) });
  const res = await fetch(`${BASE}/v1/${resource}?${query}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${resource} offset=${offset} -> ${res.status}`);
  return (await res.json()) as ErpPage<T>;
}

/**
 * Page through a collection until `meta.next_offset` is null.
 * `params` may carry the ERP's server-side filters (e.g. `lease_contract_id`).
 */
export async function fetchAll<T>(
  resource: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await fetchPage<T>(resource, offset, params);
    rows.push(...page.data);
    if (page.meta.next_offset === null) return rows;
    offset = page.meta.next_offset;
  }
}
