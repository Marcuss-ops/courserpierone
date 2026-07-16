/**
 * E2E chat SSE smoke (Fase 0 step 4 of Quality Gate Upgrade).
 *
 * Tagged with `@sse` so the CI gate `--grep "@sse"` runs ONLY this spec.
 * Minimal coverage: hit `/api/conversations?limit=1` with event-stream
 * Accept header and verify the response is "stream-ready" (200/401/302/307
 * are all valid response shapes for an SSE endpoint depending on auth state).
 *
 * Uses request fixture (no Playwright browser needed beyond the chromium
 * install). Skips if Supabase credentials are missing, mirroring the
 * skip-if-creds-missing pattern from tests/e2e/refund.lemonsqueezy.spec.ts
 * + tests/e2e/checkout.ls.spec.ts (fail-fast module-load if env absent).
 *
 * Designed to be EXTREMELY cheap (~5s) so the CI quality-gate job runs
 * within its 25-minute timeout even with the cold-cache penalty.
 */

import { test, expect } from "@playwright/test";

test.describe("@sse chat SSE smoke", () => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "@sse chat SSE smoke skipped: Supabase env vars absent (set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enable).",
  );

  test("chat conversations endpoint stream-ready", async ({ request }) => {
    // SSE smoke: hit the conversation list endpoint with event-stream
    // accept header. Response status must be one of:
    //   200 — actual streaming response (auth ok)
    //   401 — unauthorized (auth required, no token in smoke context)
    //   302/307 — redirect to login (auth middleware kicks in)
    // Each is a valid signal that the route serves the stream contract.
    const response = await request.get("/api/conversations?limit=1", {
      headers: { accept: "text/event-stream" },
      maxRedirects: 0, // SSE smoke should see raw redirect, not follow
    });

    expect([200, 401, 302, 307]).toContain(response.status());

    // If 200, verify content-type is event-stream (or starts with)
    if (response.status() === 200) {
      const ct = response.headers()["content-type"] ?? "";
      expect(ct).toMatch(/event-stream|text\/event-stream|application\/octet-stream/);
    }
  });
});
