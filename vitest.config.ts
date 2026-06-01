import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Pure unit tests — no DOM needed
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
