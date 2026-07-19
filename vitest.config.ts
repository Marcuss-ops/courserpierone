import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Pure unit tests — no DOM needed
    environment: "node",
    // Global setup runs BEFORE any test file imports its
    // SUT — this is where browser-only polyfills are registered
    // so jsdom-mode tests mount cleanly.
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      // Quality-script unit tests (DoD, hotspot-score, deps, etc.).
      // Kept separate from src/ so quality-gate tooling doesn't pollute
      // domain-code coverage stats.
      "scripts/quality/**/*.test.ts",
    ],
    exclude: ["node_modules"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
