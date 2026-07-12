/**
 * Validate that a callback/next URL is a safe relative path.
 * Prevents open-redirect attacks to external domains.
 *
 * Allowed:
 * - Known root paths: /dashboard, /login, /auth/callback, /admin, /
 * - Locale-prefixed app routes: /it-it/product/portal, /en/product/download, ...
 */
export function isSafeCallbackUrl(url: string): boolean {
  if (!url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) {
    return false;
  }

  const knownRootPaths = /^\/(?:dashboard|login|auth\/callback|admin)?$/;
  const localePrefixedPath = /^\/[a-z]{2}(?:-[a-zA-Z0-9]+)?\//;

  return knownRootPaths.test(url) || localePrefixedPath.test(url);
}
