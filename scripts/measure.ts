import { fetchAll } from "./erp-fetch";
import { ERP_RESOURCES } from "../src/erp/types";

const sizes: Record<string, number> = {};
for (const r of ERP_RESOURCES) {
  const t = Date.now();
  const rows = await fetchAll<unknown>(r);
  sizes[r] = rows.length;
  console.log(`${r.padEnd(26)} ${String(rows.length).padStart(7)} rows  ${Date.now() - t} ms`);
}
console.log(JSON.stringify(sizes));
