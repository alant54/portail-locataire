/**
 * The single write path into the mirror tables — used by both the fixtures seeder
 * and the sync, so a fixture row and a synced row are byte-identical.
 *
 * Rules (see specs/local-data-model):
 *  - conflict on the table's primary key (a UUID `id`, or the composite key of a link table);
 *  - a table that has `source_revision` skips writes carrying an older revision;
 *  - a table without `source_revision` is simply overwritten;
 *  - every write refreshes `synced_at` and clears `deleted_at` (the ERP still has the row).
 */
import { sql, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";

export type MirrorDb = BetterSQLite3Database<Record<string, unknown>>;

/** SQLite's default bound-parameter ceiling is 32766; stay well under it. */
const MAX_PARAMS = 20000;

const q = (name: string) => `"${name}"`;

function primaryKeyColumns(table: SQLiteTable) {
  const config = getTableConfig(table);
  const composite = config.primaryKeys[0];
  const columns = composite ? composite.columns : config.columns.filter((c) => c.primary);
  if (columns.length === 0) throw new Error(`${config.name} has no primary key`);
  return columns;
}

/**
 * Insert or update `rows` in `table`, keyed on the primary key.
 * Returns the number of rows handed over — an older revision is a silent no-op,
 * which is exactly what makes a re-run of the full import idempotent.
 */
export function upsertRows<T extends SQLiteTable>(
  db: MirrorDb,
  table: T,
  rows: Record<string, unknown>[],
): number {
  if (rows.length === 0) return 0;

  const config = getTableConfig(table);
  const tableName = q(config.name);
  const pkNames = new Set(primaryKeyColumns(table).map((c) => c.name));

  // Only write columns the ERP actually gave us; `synced_at` / `deleted_at` are ours.
  const local = new Set(["synced_at", "deleted_at"]);
  const columns = config.columns.filter((c) => !local.has(c.name));
  const columnList = columns.map((c) => q(c.name)).join(", ");

  const updates = columns
    .filter((c) => !pkNames.has(c.name))
    .map((c) => `${q(c.name)} = excluded.${q(c.name)}`);
  updates.push(`"synced_at" = CURRENT_TIMESTAMP`, `"deleted_at" = NULL`);

  const hasRevision = columns.some((c) => c.name === "source_revision");
  const guard = hasRevision
    ? ` WHERE excluded."source_revision" IS NULL OR ${tableName}."source_revision" IS NULL` +
      ` OR excluded."source_revision" >= ${tableName}."source_revision"`
    : "";

  const conflict = [...pkNames].map(q).join(", ");
  const perRow = columns.length;
  const chunkSize = Math.max(1, Math.floor(MAX_PARAMS / perRow));

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const tuples = chunk.map((row) => {
      const values = columns.map((c) => {
        const value = row[c.name];
        // Go through the column's own mapper: raw SQL bypasses drizzle's encoding, and
        // better-sqlite3 refuses to bind a JS boolean (e.g. `address_is_synthetic`).
        const encoded = value === undefined || value === null ? null : c.mapToDriverValue(value);
        return sql`${encoded}`;
      });
      return sql`(${sql.join(values, sql.raw(", "))})`;
    });

    db.run(
      sql`INSERT INTO ${sql.raw(tableName)} (${sql.raw(columnList)}) VALUES ${sql.join(
        tuples,
        sql.raw(", "),
      )} ON CONFLICT (${sql.raw(conflict)}) DO UPDATE SET ${sql.raw(
        updates.join(", "),
      )}${sql.raw(guard)}`,
    );
  }

  return rows.length;
}

/** Mark a mirror row deleted without removing it (sync-event `delete`). */
export function softDeleteRow<T extends SQLiteTable>(db: MirrorDb, table: T, where: SQL): void {
  const config = getTableConfig(table);
  db.run(
    sql`UPDATE ${sql.raw(q(config.name))} SET "deleted_at" = CURRENT_TIMESTAMP WHERE ${where}`,
  );
}
