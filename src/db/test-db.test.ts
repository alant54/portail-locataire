import { afterAll, beforeAll, expect, test } from "vitest";
import { createTestDb, type TestDb } from "./test-db";
import { tickets } from "./schema";

let h: TestDb;
beforeAll(async () => { h = await createTestDb(); });
afterAll(() => h.close());

test("suite gets a migrated database of its own, not data/app.db", () => {
  const names = h.sqlite
    .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '__drizzle%'")
    .all() as { name: string }[];
  expect(names.length).toBe(22);
  expect(h.dir).not.toContain("data/app.db");
});

test("suite A writes one ticket and sees only its own", () => {
  h.db.insert(tickets).values({
    id: "t-suite-a", tenantRef: "TEN-00001", category: "plomberie",
    title: "A", body: "A", status: "open",
  }).run();
  expect(h.db.select().from(tickets).all()).toHaveLength(1);
});
