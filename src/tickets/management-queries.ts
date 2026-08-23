/**
 * Reads for the management screens — the counterpart of lane B's `tenant-queries.ts`.
 *
 * Nothing here is scoped to a tenant: these queries only ever run behind the manager gate
 * in `src/app/(admin)/layout.tsx`, and they exist so the screens hold no SQL of their own.
 */
import { desc, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { db as appDb } from "../db/client";
import { loginEvents, users } from "../db/schema";
import type { MirrorDb } from "../db/upsert";
import { MIRRORED } from "../sync/registry";

export type LoginRow = {
  id: string;
  at: string;
  outcome: "success" | "failure";
  email: string | null;
  role: "tenant" | "manager" | null;
  tenantRef: string | null;
  displayName: string | null;
  ip: string | null;
};

/**
 * The latest attempts, successes and failures alike. `login_events.email` is kept even
 * when `user_id` is null — an attempt on an address that owns no account is exactly what
 * a manager wants to see — so the account email is a fallback, not the source.
 */
export function listRecentLogins(limit = 50, database: MirrorDb = appDb): LoginRow[] {
  return database
    .select({
      id: loginEvents.id,
      at: loginEvents.at,
      outcome: loginEvents.outcome,
      email: sql<string | null>`coalesce(${loginEvents.email}, ${users.email})`,
      role: users.role,
      tenantRef: users.tenantRef,
      displayName: users.displayName,
      ip: loginEvents.ip,
    })
    .from(loginEvents)
    .leftJoin(users, sql`${loginEvents.userId} = ${users.id}`)
    .orderBy(desc(loginEvents.at), desc(sql`${loginEvents.id}`))
    .limit(limit)
    .all() as LoginRow[];
}

export type AccountLogin = {
  email: string;
  role: "tenant" | "manager";
  tenantRef: string | null;
  displayName: string | null;
  lastSuccessAt: string | null;
  failures: number;
};

/**
 * One row per account: when it last got in, and how many attempts failed. Accounts that
 * have never connected are listed too — that is half the point of the screen.
 */
export function listAccountsWithLastLogin(database: MirrorDb = appDb): AccountLogin[] {
  return database
    .select({
      email: users.email,
      role: users.role,
      tenantRef: users.tenantRef,
      displayName: users.displayName,
      lastSuccessAt: sql<
        string | null
      >`max(case when ${loginEvents.outcome} = 'success' then ${loginEvents.at} end)`,
      failures: sql<number>`sum(case when ${loginEvents.outcome} = 'failure' then 1 else 0 end)`,
    })
    .from(users)
    .leftJoin(loginEvents, sql`${loginEvents.userId} = ${users.id}`)
    .groupBy(users.id)
    .orderBy(sql`max(case when ${loginEvents.outcome} = 'success' then ${loginEvents.at} end) desc`)
    .all() as AccountLogin[];
}

export type TableCount = { table: string; rows: number; deleted: number };

/**
 * Live rows per mirror table, plus what a soft delete has hidden.
 *
 * `deleted_at` is our own column and exists on every mirror table; `archived_at` is the
 * ERP's and exists on only 7 of the 15, so it is deliberately not part of this count —
 * a helper that assumed it would break on the other 8.
 */
export function countMirrorRows(database: MirrorDb = appDb): TableCount[] {
  return MIRRORED.map((collection) => {
    const name = getTableConfig(collection.table).name;
    const row = database.get<{ rows: number; deleted: number }>(
      sql`select count(*) filter (where deleted_at is null) as rows,
                 count(*) filter (where deleted_at is not null) as deleted
          from ${sql.identifier(name)}`,
    );
    return { table: name, rows: row?.rows ?? 0, deleted: row?.deleted ?? 0 };
  });
}
