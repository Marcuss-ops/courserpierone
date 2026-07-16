import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // Entry points: Next.js routes and tests consume domain exports.
  entry: [
    "src/app/**/*.ts",
    "src/app/**/*.tsx",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
  ],
  project: ["src/domains/**/*.ts"],
  ignore: [
    // Generated types
    ".next/**",
    // Config files
    "*.config.{js,mjs,ts}",
    "tsconfig.json",
    // Tests and ambient declarations
    "**/*.test.ts",
    "**/*.d.ts",
  ],
  // We only care about unused exports/types in this gate.
  rules: {
    files: "off",
    dependencies: "off",
    devDependencies: "off",
    unlisted: "off",
    binaries: "off",
    exports: "warn",
    types: "warn",
  },
};

export default config;
