"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * ThemeProvider — thin client-side wrapper around next-themes.
 *
 * Behavior:
 *   - `attribute="class"`  : adds `class="dark"` to <html> when dark mode is on.
 *                            This is what Tailwind's `darkMode: "class"` reads.
 *   - `defaultTheme="system"` + `enableSystem` : first-paint respects OS pref.
 *   - `storageKey="courser-theme"`            : dedicated localStorage key so the
 *                                               preference doesn't collide with
 *                                               other Next.js projects sharing
 *                                               the same domain (rare but possible).
 *
 * Why a wrapper:
 *   - Allows easy swap of `attribute` to `data-theme` later without
 *     changing root-layout code.
 *   - Lets us add a useEffect for sanity-checking that the dark class was
 *     applied (lazy) without polluting layout.tsx.
 *
 * `suppressHydrationWarning` lives on <html> in src/app/layout.tsx — it's
 * required because next-themes injects the `class="dark"` BEFORE React
 * hydrates, so without suppressing, React would log a hydration mismatch.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="courser-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
