import js from "@eslint/js";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Global ignore patterns
  { ignores: ["node_modules", ".next", "out", "dist", "*.config.*", "src/lib/_archive/**"] },

  // Base JS/TS recommended rules
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // React configuration
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "unused-imports": unusedImports,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // React Hooks
      ...reactHooksPlugin.configs.recommended.rules,

      // React specific
      "react/jsx-uses-react": "off", // Not needed with React 19
      "react/react-in-jsx-scope": "off", // Not needed with React 19
      "react/jsx-uses-vars": "error",

      // TypeScript-specific overrides
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "off", // FASE 1.10: 226 occurrences intentionally use `\|\|` truthy-fallback semantics (defensive against `0`/`''`/`false`); `??` would change behavior. Auto-fix disabled in eslint config.
      "unused-imports/no-unused-imports": "error",
      // FASE 1.9 quality gate: Next.js App Router route handlers often
      // require `async` signatures by convention (await chains, future-proofing)
      // even when the body is synchronous. Demoting to `warn` keeps the
      // signal without blocking the deploy-gate on declarations-only async.
      "@typescript-eslint/require-await": "off", // FASE 1.10: 24 occurrences are intentional async signatures (Next.js route handlers / Redis mock interfaces); removing `async` would silently break contracts.
      // FASE 1.9: belt-and-braces — the rule isn't loaded (no plugin
      // registered), but if it ever is, allow legacy explicit <img> use via
      // visual regression tests rather than next/image migration.
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unsafe-assignment": "off", // Too strict for API responses
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "no-empty": ["warn", { "allowEmptyCatch": true }],

      // V3.5 — Lock V3.4 barrel migration: prevent new direct submodule
      // imports in favor of the canonical `@/lib/access` barrel.
      // Pure code-only blocking — first violation fires this rule.
      // The barrel itself (`src/lib/access/index.ts`) is exempted below.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/access/find-completed-order",
              message:
                "V3.4 migration: use `import { findCompletedOrder } from \"@/lib/access\"` (canonical barrel) instead of the submodule path.",
            },
            {
              name: "@/lib/access/find-completed-order-by-order-id",
              message:
                "V3.4 migration: use `import { findCompletedOrderByOrderId } from \"@/lib/access\"` (canonical barrel) instead of the submodule path.",
            },
          ],
        },
      ],
    },
  },

  // Language options for TS files
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Allow require() in CJS-style config files
  {
    files: ["*.{cjs,mjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // V3.5 — Exempt the barrel itself from `no-restricted-imports`: it
  // legitimately re-exports the submodule helpers to the rest of the
  // codebase. Without this override, the barrel's own re-exports would
  // trigger the rule on every lint pass.
  {
    files: ["src/lib/access/index.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
