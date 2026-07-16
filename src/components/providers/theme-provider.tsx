"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * ThemeProvider — thin client-side wrapper around next-themes.
 *
 * Behavior:
 *   - `attribute="class"`  : adds `class="dark"` to <html> when dark mode is on.
 *                            This is what Tailwind's `darkMode: "class"` reads.
 *   - `defaultTheme="system"` + `enableSystem` : first-paint respects OS pref.
 *   - `storageKey="courssy-theme"`            : dedicated localStorage key so the
 *                                               preference doesn't collide with
 *                                               other Next.js projects sharing
 *                                               the same domain (rare but possible).
 *
 * Why a wrapper:
 *   - All next-themes config lives in ONE function-call site (src/app/layout.tsx).
 *     If we ever want to swap `attribute` to `data-theme` or add a Vercel-Analytics
 *     darkmode signal, it's a single-file change.
 *   - ComponentProps<typeof NextThemesProvider> keeps us in sync with the upstream
 *     library's actual prop shape (no manual duplication).
 *
 * `suppressHydrationWarning` lives on <html> in src/app/layout.tsx — it's
 * required because next-themes injects the `class="dark"` BEFORE React
 * hydrates, so without suppressing, React would log a hydration mismatch.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
