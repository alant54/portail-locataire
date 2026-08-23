import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb, DB_PATH } from "../src/db/client.js";

const file = process.argv[2] ?? DB_PATH;
const { sqlite, db } = createDb(file);
migrate(db, { migrationsFolder: "drizzle" });

// The cursor is a singleton the sync updates in place, so the row has to exist
// before lane A's first run. Kept here rather than in a generated Drizzle
// migration: `db:generate` derives those from schema.ts and would drop a hand
// edit on the next regeneration.
sqlite.prepare("INSERT OR IGNORE INTO sync_cursor (id, last_change_id) VALUES (1, 0)").run();
const tables = sqlite
  .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '__drizzle%' order by name")
  .all() as { name: string }[];
sqlite.close();
console.log(`migrated ${file} — ${tables.length} tables`);
