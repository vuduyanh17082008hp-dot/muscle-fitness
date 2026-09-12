import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // See test/server-only-stub.ts — `server-only` has no effect
      // outside Next.js's own bundler, and isn't even an installed
      // package; this lets Vitest resolve files that import it.
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    // "app/**" added alongside the existing "lib/**" so API route
    // handlers (e.g. app/api/recovery/checkin/route.ts) can have
    // dedicated tests colocated with the route, without moving any
    // existing lib/ test.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
  },
});
