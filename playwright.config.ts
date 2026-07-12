import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// =========================================================================
// Multi-browser matrix policy
// =========================================================================
// Default mode (CI, dev, every PR): Chromium-only. Cheapest sanity
// check that covers the most common WebKit/Firefox-compatible
// codepaths. RUN_FULL_MATRIX not set → just chromium on every push.
//
// Pre-release gate (manual, operator-driven before a release/tag):
// set RUN_FULL_MATRIX=true to opt into Firefox + WebKit alongside
// Chromium. This is the only invocation that exercises the full
// cross-browser matrix.
//
// Usage:
//   # every commit / PR (default):
//   npx playwright test                       # Chromium only
//   npm run test:e2e                          # Chromium only
//
//   # pre-release (manual, gated):
//   RUN_FULL_MATRIX=true npx playwright test
//   RUN_FULL_MATRIX=true npm run test:e2e
//
// Browser-prerequisite setup (one-time, manual — NOT auto-installed
// by `npm install` to keep CI images lean):
//   npx playwright install chromium            # always present
//   npx playwright install firefox             # required before RUN_FULL_MATRIX
//   npx playwright install webkit              # required before RUN_FULL_MATRIX
//
// Linux dev-host caveat: WebKit (and Firefox, less so) require
// system libs (libnss3, libatk-bridge2.0-0, libgtk-3, libgbm,
// libasound2, ...). The project CI images ship with them; fresh dev
// containers do NOT. Without --with-deps, WebKit launch fails with
//
//   Error: Cannot launch WebKit: libnss3.so: cannot open shared object file
//
// Use --with-deps ONCE per dev host to install system libs via
// apt-get (sudo required on standard Linux distros):
//
//   sudo npx playwright install --with-deps firefox webkit    # one-time, Linux
//
// macOS / Windows: --with-deps is a no-op (the apt-get step is
// skipped); only the browser binaries themselves install. CI images
// already ship with the system libs; --with-deps is idempotent for
// them.
//
// CI cost rationale (docs/v1-acceptance-test.md §4 BLOCKER #1):
// running FF and WebKit on every push roughly triples CI cost (3×
// browser-minutes from 3× slower interpretation). Capping to
// pre-release aligns with the user's "no branches / only main /
// frequent push" mode + keeps the deploy-gate (`.github/workflows/
// ci.yml` deploy-gate status) cheap per push.
// =========================================================================
const RUN_FULL_MATRIX = process.env.RUN_FULL_MATRIX === "true";

const matrixProjects = RUN_FULL_MATRIX
  ? [
      {
        name: "firefox",
        use: { ...devices["Desktop Firefox"] },
      },
      {
        name: "webkit",
        use: { ...devices["Desktop Safari"] },
      },
    ]
  : [];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    ...matrixProjects,
  ],
  webServer: {
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 300_000 : 120_000,
  },
  globalSetup: require.resolve("./tests/e2e/global.setup"),
  globalTeardown: require.resolve("./tests/e2e/global.teardown"),
});
