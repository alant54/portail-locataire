/**
 * The only way this app talks to the ERP.
 *
 * The ERP is read-only (POST/PUT/PATCH/DELETE all answer 405), so this client
 * exposes GET and nothing else — see `client.test.ts`, which asserts the surface
 * carries no write verb. That assertion is the cheap version of checklist #4.
 *
 * Pagination follows `meta.next_offset` and stops only when it is null: a full-size
 * last page still reports a non-null offset, and the request after it comes back
 * empty. Terminating on a short or empty page instead would work today and break
 * the day the ERP returns a page shorter than `limit` in the middle of a walk.
 */
import { env } from "./env.js";
import type { ErpPage, ErpResource, ErpResourceMap } from "./types.js";

/** The ERP caps `limit` at 1000. */
export const PAGE_LIMIT = 1000;

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4; // one try plus three retries
const BASE_BACKOFF_MS = 250;
const TIMEOUT_MS = 30_000;

export type QueryParams = Record<string, string | number | undefined>;

export interface ErpClientOptions {
  baseUrl?: string;
  apiKey?: string;
  /** Injected by the tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected by the tests so retry cases do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ErpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "ErpError";
  }
}

export interface ErpClient {
  /** One page, exactly as the ERP returned it. */
  getPage<R extends ErpResource>(
    resource: R,
    params?: QueryParams,
  ): Promise<ErpPage<ErpResourceMap[R]>>;
  /** Every page of a collection, in order. The caller may stop early (row caps). */
  listAll<R extends ErpResource>(
    resource: R,
    params?: QueryParams,
  ): AsyncGenerator<ErpResourceMap[R][], void, undefined>;
  /** Detail endpoint — takes an `external_ref`, never a UUID. */
  getOne<R extends ErpResource>(
    resource: R,
    externalRef: string,
  ): Promise<ErpResourceMap[R] | null>;
}

export function createErpClient(options: ErpClientOptions = {}): ErpClient {
  const baseUrl = (options.baseUrl ?? env("ERP_API"))?.replace(/\/+$/, "");
  const apiKey = options.apiKey ?? env("ERP_PUBLISHABLE_KEY");
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  if (!baseUrl || !apiKey) {
    throw new Error("ERP_API and ERP_PUBLISHABLE_KEY must be set (.env.local)");
  }

  function url(path: string, params: QueryParams = {}): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const suffix = query.size > 0 ? `?${query}` : "";
    return `${baseUrl}/v1/${path}${suffix}`;
  }

  /** GET with backoff on 429/5xx. Any other non-2xx is final. */
  async function get(target: string): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await doFetch(target, {
          headers: { apikey: apiKey!, Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) return res;
        if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) {
          throw new ErpError(`GET ${target} -> ${res.status}`, res.status, target);
        }
        lastError = new ErpError(`GET ${target} -> ${res.status}`, res.status, target);
      } catch (error) {
        // A transport error (timeout, reset) is retryable; an ErpError already
        // decided above whether it was.
        if (error instanceof ErpError && !RETRY_STATUSES.has(error.status)) throw error;
        if (attempt === MAX_ATTEMPTS) throw error;
        lastError = error;
      }
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async function getPage<R extends ErpResource>(
    resource: R,
    params: QueryParams = {},
  ): Promise<ErpPage<ErpResourceMap[R]>> {
    const res = await get(url(resource, { limit: PAGE_LIMIT, ...params }));
    return (await res.json()) as ErpPage<ErpResourceMap[R]>;
  }

  async function* listAll<R extends ErpResource>(
    resource: R,
    params: QueryParams = {},
  ): AsyncGenerator<ErpResourceMap[R][], void, undefined> {
    let offset = params.offset === undefined ? 0 : Number(params.offset);
    for (;;) {
      const page = await getPage(resource, { ...params, offset });
      if (page.data.length > 0) yield page.data;
      if (page.meta.next_offset === null) return;
      offset = page.meta.next_offset;
    }
  }

  async function getOne<R extends ErpResource>(
    resource: R,
    externalRef: string,
  ): Promise<ErpResourceMap[R] | null> {
    try {
      const res = await get(url(`${resource}/${encodeURIComponent(externalRef)}`));
      const body = (await res.json()) as ErpResourceMap[R] | { data?: ErpResourceMap[R] };
      // The detail endpoints return the bare row; tolerate a `{data}` envelope too.
      return (body as { data?: ErpResourceMap[R] }).data ?? (body as ErpResourceMap[R]);
    } catch (error) {
      if (error instanceof ErpError && error.status === 404) return null;
      throw error;
    }
  }

  return { getPage, listAll, getOne };
}

/** Built on first use so importing this module never requires the ERP keys. */
let shared: ErpClient | undefined;
export function erp(): ErpClient {
  return (shared ??= createErpClient());
}
