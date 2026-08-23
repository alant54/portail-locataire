/**
 * `npm run sync` (incremental) and `npm run sync:full` (full import).
 *
 * Both script names are pre-declared in the frozen `package.json` and point here.
 *
 *   npm run sync:full -- --only rental-units,leases
 *   npm run sync:full -- --max-rows 2000        # overrides SYNC_MAX_ROWS_PER_COLLECTION
 *   npm run sync:full -- --entries=all          # every lease's entries (~26 min)
 *   DATABASE_URL=/tmp/x.db npm run sync:full    # never touch data/app.db in a check
 */
import { createDb, DB_PATH } from "../src/db/client.js";
import type { ErpResource } from "../src/erp/types.js";
import type { EntriesScope } from "../src/sync/full-import.js";
import { runFullImport } from "../src/sync/full-import.js";
import { runIncremental } from "../src/sync/incremental.js";
import { readCursor } from "../src/sync/cursor.js";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

async function main() {
  const full = process.argv.includes("--full");
  const { sqlite, db } = createDb();
  const started = Date.now();

  console.log(`${full ? "Full import" : "Incremental sync"} → ${DB_PATH}`);
  console.log(`  cursor before        ${readCursor(db)}`);

  const summary = full
    ? await runFullImport({
        db,
        only: flag("only")?.split(",").map((s) => s.trim()) as ErpResource[] | undefined,
        maxRowsPerCollection: flag("max-rows") ? Number(flag("max-rows")) : undefined,
        entriesScope: (flag("entries") as EntriesScope | undefined) ?? "demo",
        onProgress: (resource, rows) =>
          console.log(`  ${resource.padEnd(24)} ${String(rows).padStart(7)}`),
      })
    : await runIncremental({
        db,
        onBatch: ({ events, cursor }) => console.log(`  batch ${events} events → cursor ${cursor}`),
      });

  sqlite.close();

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n${summary.kind} ${summary.status} — ${summary.eventsApplied} ${
      full ? "rows" : "events"
    } applied, cursor ${summary.cursorBefore} → ${summary.cursorAfter} (${seconds}s, run ${summary.runId})`,
  );
  if (summary.error) console.error(`  error: ${summary.error}`);
  process.exit(summary.status === "ok" ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
