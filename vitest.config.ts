import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Each file gets its own process, which is also what proves the
    // per-suite database isolation in src/db/test-db.ts.
    pool: "forks",
    globals: false,
  },
});
