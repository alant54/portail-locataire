import { expect, test } from "vitest";
import { createErpClient, ErpError } from "./client";

const page = (data: unknown[], next: number | null) =>
  new Response(JSON.stringify({ data, meta: { resource: "parties", limit: 1000, offset: 0, next_offset: next } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const client = (fetchImpl: typeof fetch) =>
  createErpClient({
    baseUrl: "https://erp.test",
    apiKey: "k",
    fetchImpl,
    sleep: async () => {},
  });

test("listAll walks pages and stops on the trailing empty page", async () => {
  const seen: string[] = [];
  // Two full pages then an empty one: the second page still reports a non-null
  // next_offset, which is exactly the case a "stop when short" loop gets wrong.
  const responses = [page([{ id: "a" }], 1), page([{ id: "b" }], 2), page([], null)];
  const erp = client(async (input) => {
    seen.push(String(input));
    return responses.shift()!;
  });

  const rows = [];
  for await (const batch of erp.listAll("parties")) rows.push(...batch);

  expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  expect(seen).toHaveLength(3);
  expect(seen[0]).toContain("offset=0");
  expect(seen[2]).toContain("offset=2");
});

test("a 503 is retried and then succeeds", async () => {
  let calls = 0;
  const erp = client(async () => {
    calls++;
    if (calls === 1) return new Response("busy", { status: 503 });
    return page([{ id: "a" }], null);
  });

  const rows = [];
  for await (const batch of erp.listAll("parties")) rows.push(...batch);

  expect(calls).toBe(2);
  expect(rows).toHaveLength(1);
});

test("a 400 is final — no retry", async () => {
  let calls = 0;
  const erp = client(async () => {
    calls++;
    return new Response("nope", { status: 400 });
  });

  await expect(erp.getPage("parties")).rejects.toBeInstanceOf(ErpError);
  expect(calls).toBe(1);
});

test("getOne uses the detail endpoint and maps 404 to null", async () => {
  const seen: string[] = [];
  const erp = client(async (input) => {
    seen.push(String(input));
    return seen.length === 1
      ? new Response(JSON.stringify({ id: "u", external_ref: "TEN-00005" }), { status: 200 })
      : new Response("missing", { status: 404 });
  });

  expect(await erp.getOne("parties", "TEN-00005")).toMatchObject({ external_ref: "TEN-00005" });
  expect(seen[0]).toBe("https://erp.test/v1/parties/TEN-00005");
  expect(await erp.getOne("parties", "TEN-99999")).toBeNull();
});

test("both auth headers are sent on every request", async () => {
  let headers: Headers | undefined;
  const erp = client(async (_input, init) => {
    headers = new Headers(init?.headers);
    return page([], null);
  });

  await erp.getPage("parties");
  expect(headers?.get("apikey")).toBe("k");
  expect(headers?.get("authorization")).toBe("Bearer k");
});

test("the client surface exposes no write verb", () => {
  const erp = client(async () => page([], null));
  const surface = Object.keys(erp);

  expect(surface.sort()).toEqual(["getOne", "getPage", "listAll"]);
  for (const name of surface) {
    expect(name).not.toMatch(/post|put|patch|delete|write|create|update|remove/i);
  }
});
