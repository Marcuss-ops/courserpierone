import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Global ignore patterns
  { ignores: ["node_modules", ".next", "out", "dist", "*.config.*"] },

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
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
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
);
