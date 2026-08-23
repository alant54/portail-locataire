import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb, DB_PATH } from "../src/db/client.js";

const file = process.argv[2] ?? DB_PATH;
const { sqlite, db } = createDb(file);
migrate(db, { migrationsFolder: "drizzle" });
const tables = sqlite
  .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '__drizzle%' order by name")
  .all() as { name: string }[];
sqlite.close();
console.log(`migrated ${file} — ${tables.length} tables`);
