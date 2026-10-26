import { defineConfig } from "vitest/config";
import path from "node:path";

// Deliberately separate from vite.config.ts — that one pulls in TanStack
// Start/Nitro SSR plugins that have no business in a plain unit-test run.
// Just enough config for tests to resolve the "@/*" alias.
export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      // Only the modules that actually have tests today — widen this as
      // more of src/ gets covered rather than reporting a misleadingly low
      // number for routes/components that were never meant to be unit-tested.
      include: [
        "src/lib/auth.ts",
        "src/lib/login-rate-limit.ts",
        "src/lib/highscore-store.ts",
        "src/lib/calc-history-store.ts",
        "src/lib/workout-store.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
