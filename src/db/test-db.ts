/**
 * One throwaway database per test suite.
 *
 * Never touches `data/app.db`: three worktrees run `npm test` at the same time and
 * a shared file would make their failures look like logic bugs. Each call migrates
 * a fresh file under the OS temp dir and deletes it on close.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb } from "./client.js";

export type TestDb = ReturnType<typeof createDb> & { dir: string; close: () => void };

export async function createTestDb(options: { seed?: boolean } = {}): Promise<TestDb> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-test-"));
  const handle = createDb(path.join(dir, "test.db"));
  migrate(handle.db, { migrationsFolder: "drizzle" });

  const close = () => {
    handle.sqlite.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };

  if (options.seed) {
    let seedFixtures: (db: typeof handle.db) => unknown;
    // Resolved at run time on purpose: the seeder lands in phase-0 task 3.3 and
    // a static specifier would make `tsc --noEmit` fail until then.
    const specifier = "../../scripts/seed-fixtures.js";
    try {
      ({ seedFixtures } = (await import(specifier)) as {
        seedFixtures: (db: typeof handle.db) => unknown;
      });
    } catch {
      throw new Error(
        "createTestDb({ seed: true }) needs scripts/seed-fixtures.ts (phase-0 task 3.3).",
      );
    }
    await seedFixtures(handle.db);
  }

  return { ...handle, dir, close };
}
