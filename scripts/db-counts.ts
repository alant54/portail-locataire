/** `table<TAB>rows` for every mirror table, plus the cursor. Used by check-idempotent.sh. */
import { createDb, DB_PATH } from "../src/db/client";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { IMPORT_ORDER } from "../src/sync/registry";
import { readCursor } from "../src/sync/cursor";

const { sqlite, db } = createDb(process.argv[2] ?? DB_PATH);
for (const collection of IMPORT_ORDER) {
  const table = getTableConfig(collection.table).name;
  const { n } = sqlite.prepare(`select count(*) as n from "${table}"`).get() as { n: number };
  console.log(`${table}\t${n}`);
}
console.log(`sync_cursor\t${readCursor(db)}`);
sqlite.close();
