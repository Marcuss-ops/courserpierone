/**
 * instrumentation.ts — Next.js server-side error capture.
 *
 * Auto-discovered by Next.js (15.1+) at `src/instrumentation.ts` (or
 * `instrumentation.ts` at project root). No config in next.config.mjs
 * needed — Next.js picks it up automatically.
 *
 * Why this exists:
 *   - Server Component throws are REDACTED in the client-side `error`
 *     prop (only `error.digest` survives for security).
 *   - To get the real `error.message` + `error.stack`, you have to capture
 *     on the server, before redaction happens.
 *   - `onRequestError` is the official Next.js hook for this. It runs in
 *     the same Node process as the failed render, so calling
 *     `logServerError()` (which talks to Redis directly) is the lowest-
 *     latency, lowest-risk capture mechanism.
 *
 * Reference: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

/**
 * Called once when the server boots. We use it to log a "instrumentation
 * active" message in non-production environments so devs know it's wired.
 * NB: deliberately NOT async — there's nothing to await. (Next.js accepts
 * both `() => void` and `() => Promise<void>` for this hook.)
 */
export function register(): void {
  if (process.env.NODE_ENV !== "production") {
    console.log("[instrumentation] Server-side error capture active");
  }
}

/**
 * Captures every server-side render / route / action / middleware error
 * with full (unredacted) message + stack. This is the ONLY way to see
 * real server error details in production without Vercel runtime logs.
 *
 * Next.js calls this from its internal error boundary, after the digest
 * has been generated but before the error is sent to the client.
 */
export async function onRequestError(
  err: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[]>;
  },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType?: "render" | "route" | "action" | "middleware";
    revalidateReason?: "on-demand" | "stale";
    renderSource?: "react-server-components" | "react-server-components-payload" | "server-rendering";
  }
): Promise<void> {
  // Import lazily so this module doesn't pull Redis into edge runtimes
  // that don't support it. The import is server-side only.
  const { logServerError } = await import("@/lib/logging/server-error-sink");

  // Normalize the unknown error to an Error-like object.
  const e = err instanceof Error ? err : new Error(String(err));
  const digest = (e as Error & { digest?: string }).digest ?? "no-digest";

  // Coerce the user-agent header (Upstash/ioredis expect string|undefined).
  const userAgentHeader = request.headers["user-agent"];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

  // Fire-and-forget — never let logging fail propagate to Next.js.
  await logServerError({
    digest,
    path: request.path,
    message: e.message,
    stack: e.stack,
    source: "server",
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    method: request.method,
    userAgent,
    timestamp: new Date().toISOString(),
  }).catch((writeErr) => {
    console.error("[instrumentation] logServerError failed:", writeErr);
  });
}
