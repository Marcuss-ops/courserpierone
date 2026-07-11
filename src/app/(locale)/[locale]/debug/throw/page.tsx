// ─── TEMPORARY E2E TEST ROUTE ──────────────────────────────
// Added to verify the self-hosted error logging pipeline (commit 1b16a56).
// This file is intended to be REMOVED in the next commit after E2E verification.
//
// Access: GET /debug/throw?secret=test
//   - Without secret: renders a placeholder (no error)
//   - With secret:    throws a Server Component error → triggers both
//                     instrumentation.ts (server log) and useLogError
//                     (client log via /api/log-error)
//
// The throw is in a Server Component (page.tsx, not route.ts) because:
//   - API route throws bubble to JSON 500, not the React error page
//   - Page throws bubble to error.tsx, which renders the digest AND
//     fires the useLogError client hook
// ────────────────────────────────────────────────────────────

import Link from "next/link";

// Force dynamic so Next.js does not pre-render or cache this route
// (a pre-rendered throw would break the build).
export const dynamic = "force-dynamic";

export default async function DebugThrowPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>;
}) {
  const { secret } = await searchParams;

  // Gate: require ?secret=test so random bots / share-link previews don't
  // accidentally trigger errors in production.
  if (secret !== "test") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-gray-900">Debug throw route</h1>
          <p className="text-sm text-gray-600">
            Append <code className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">?secret=test</code> to trigger a test error.
          </p>
          <p className="text-xs text-gray-400">
            This is a temporary route for E2E verification of the error logging pipeline. It will be removed shortly.
          </p>
          <Link href="/" className="text-xs text-blue-600 hover:underline">
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  // Unique message per request so the dedup window (60s) does not suppress
  // repeated test runs. The timestamp in the message also makes it easy to
  // grep for in Redis.
  const stamp = new Date().toISOString();
  throw new Error(`E2E Test: Server Component Crash @ ${stamp}`);
}
