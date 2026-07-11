"use client";

/**
 * useLogError — Fire-and-forget client-side error reporter for error.tsx.
 *
 * Used in error boundary components to ping /api/log-error so the next time
 * an error ID appears in production, you can correlate it with the actual
 * server-side stack trace captured by instrumentation.ts (matched by digest).
 *
 * What gets sent:
 *   - error.digest         → always available (Next.js redacts message/stack
 *                             only for Server Component throws; Client
 *                             Component errors come through unredacted)
 *   - error.message        → real for client-thrown errors, generic for server
 *   - error.stack          → real for client-thrown errors, generic for server
 *   - pathname             → which page the user was on
 *   - timestamp            → ISO 8601
 *
 * What does NOT get sent:
 *   - Anything PII. We do not log user input, headers, or cookies.
 *
 * Failure mode: if /api/log-error is down or the secret is missing, the
 * hook silently does nothing. Logging failure must NEVER make the error
 * page worse than it already is.
 */

import { useEffect } from "react";

interface ErrorWithDigest extends Error {
  digest?: string;
}

export function useLogError(
  error: ErrorWithDigest | null | undefined,
  pathname: string | null
): void {
  useEffect(() => {
    if (!error) return;

    const secret = process.env.NEXT_PUBLIC_LOG_ERROR_SECRET;
    if (!secret) {
      // Not configured — silent skip. The user can still rely on Vercel
      // runtime logs (server-side) which are always on.
      return;
    }

    const payload = {
      digest: error.digest,
      message: error.message,
      stack: error.stack,
      path: pathname ?? "(unknown)",
      source: "client" as const,
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget. We intentionally do NOT await, do NOT throw, and
    // do NOT add any UI feedback. The error page already shows a digest;
    // logging is best-effort observability, not a user-facing feature.
    fetch("/api/log-error", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Log-Secret": secret,
      },
      body: JSON.stringify(payload),
      // Keepalive helps the request survive page navigations from "reset".
      keepalive: true,
    }).catch(() => {
      // Silent. Don't pollute the console for the user.
    });
    // Re-run on digest/path change, not on every error reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error?.digest, pathname]);
}
