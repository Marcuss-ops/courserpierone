"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

interface ThemeToggleProps {
  /**
   * Visual variant matching the surrounding chrome:
   *   - "dark" : rendered inside cream-dark-* surfaces (course top-nav).
   *              Uses cream-dark-* tokens for borders/bg/text.
   *   - "light": rendered inside cream-* / white surfaces (footer, login).
   *              Uses black/10 borders + text-black/* tokens.
   * Default "dark" preserves the existing CourseTopNav aesthetic.
   */
  variant?: "dark" | "light";
}

/**
 * ThemeToggle — sun ↔ moon button. Used in CourseTopNav (variant="dark")
 * and Footer (variant="light"). Same component, two chrome styles.
 *
 * Hydration-safe: the `mounted` flag prevents rendering before
 * next-themes has reconciled the saved theme from localStorage. Without
 * this, the first paint could show the wrong icon for users who have
 * dark mode persisted.
 */
export function ThemeToggle({ variant = "dark" }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Pre-mount placeholder keeps layout stable; same size as the button
  // (w-9 h-9) so the surrounding flex doesn't shift on hydration.
  if (!mounted) {
    return <span className="w-9 h-9" aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";

  const darkVariantClasses = isDark
    ? "bg-cream-dark-gold/10 border-cream-dark-gold/30 text-cream-dark-gold hover:border-cream-dark-gold/40"
    : "bg-cream-dark-surface border-cream-dark-border text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30";

  const lightVariantClasses = isDark
    ? "bg-black/10 border-black/15 text-black hover:border-black/30"
    : "bg-white border-black/10 text-black/70 hover:text-black hover:border-black/20";

  const variantClasses =
    variant === "light" ? lightVariantClasses : darkVariantClasses;

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      className={`relative w-9 h-9 rounded-xl border transition-all flex items-center justify-center ${variantClasses}`}
      aria-label={`Switch to ${nextTheme} mode (currently ${isDark ? "dark" : "light"})`}
      title={`Switch to ${nextTheme} mode`}
    >
      {isDark ? (
        <Moon className="w-4 h-4" aria-hidden />
      ) : (
        <Sun className="w-4 h-4" aria-hidden />
      )}
      {/* `sr-only` description for screen readers */}
      <span className="sr-only">Theme toggle</span>
      {/* Theme name retained for debugging — never read in JSX */}
      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars -- diagnostic only */}
      <span data-theme-debug aria-hidden style={{ display: "none" }}>
        {String(theme)}
      </span>
    </button>
  );
}
