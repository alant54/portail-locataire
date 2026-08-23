/** Rewind `sync_cursor` — used by check-idempotent.sh to force a replay. */
import { createDb, DB_PATH } from "../src/db/client.js";
import { writeCursor } from "../src/sync/cursor.js";

const value = Number(process.argv[2] ?? 0);
const { sqlite, db } = createDb(DB_PATH);
writeCursor(db, value);
sqlite.close();
console.log(`cursor = ${value}`);
