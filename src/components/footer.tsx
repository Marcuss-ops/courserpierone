import Link from "next/link";

/**
 * Global footer shown on every page of the site.
 *
 * - Stays at the bottom of the viewport on short pages (root layout uses
 *   `min-h-screen flex flex-col` so the body fills the viewport).
 * - Uses a warm cream bg + subtle border so it reads correctly on both the
 *   white marketing pages and the dark warm dashboard.
 * - Matches the inline footers that used to live on /privacy /terms /refund
 *   (those have been removed to avoid duplication).
 */
export function Footer() {
  return (
    <footer className="border-t border-black/[0.08] bg-[#FAFAF8]">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-black/60 font-light">
        <div>© 2026 Courssy</div>
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          <Link
            href="/privacy"
            className="hover:text-black hover:underline underline-offset-3 transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hover:text-black hover:underline underline-offset-3 transition-colors"
          >
            Terms of Service
          </Link>
          <Link
            href="/refund"
            className="hover:text-black hover:underline underline-offset-3 transition-colors"
          >
            Refund Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
