import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// =========================================================================
// Cross-browser matrix — DEFAULT ON (V1 acceptance criterion 7)
// =========================================================================
// Default mode (CI, dev, every PR): all 3 desktop browsers — Chromium,
// Firefox, WebKit — exercise the full cross-browser matrix on every
// push. Satisfies V1 acceptance criterion 7 directly from CI
// (docs/v1-acceptance-test.md §1 row 7 + §4 BLOCKER #1).
//
// Opt-OUT (emergency / debug only): set RUN_FULL_MATRIX=false to run
// chromium-only — useful when debugging a single-browser issue
// without paying for the full matrix, or when a Firefox/WebKit
// binary is missing in a sandbox. NOT the V1 path.
//
// Usage:
//   # every commit / PR (V1 default):
//   npx playwright test                            # all 3 browsers
//   npm run test:e2e                               # all 3 browsers
//   npm run test:e2e -- --project=firefox          # single browser
//   npm run test:e2e -- --project=webkit           # single browser
//
//   # opt-OUT (debug / emergency — chromium only):
//   RUN_FULL_MATRIX=false npx playwright test
//   RUN_FULL_MATRIX=false npm run test:e2e
//
// Browser-prerequisite setup (one-time per dev host — NOT
// auto-installed by `npm install` to keep CI images lean, but
// REQUIRED for default-on e2e):
//   npx playwright install chromium               # always present
//   npx playwright install firefox                # required (default-on)
//   npx playwright install webkit                 # required (default-on)
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
// CI cost note: running FF + WebKit alongside Chromium roughly
// triples browser-minutes (slower launch + render). Accepted as the
// V1 default-on trade — the criterion 7 gate is more valuable than
// the marginal CI cost for a single repo + deduped e2e suite.
// Future optimization (track in FUTURE.md): per-browser test
// sharding OR profile-gated matrix (smoke vs full) to reduce cost
// without losing cross-browser coverage on the pre-release gate.
// =========================================================================
const RUN_FULL_MATRIX = process.env.RUN_FULL_MATRIX !== "false";

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
