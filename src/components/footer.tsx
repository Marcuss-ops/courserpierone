"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Global footer shown on the public website.
 *
 * Hidden on app routes (dashboard, admin, account, uploader, auth) because
 * those are full-screen app views with their own visual identity (dark warm
 * theme) — a light cream footer below them would clash visually.
 *
 * Server components in the app router can't use `usePathname` directly, so
 * this is a small client component. The hydration cost is negligible.
 */
const HIDE_ON_PREFIXES = ["/dashboard", "/admin", "/account", "/uploader", "/auth", "/debug-locale"];

export function Footer() {
  const pathname = usePathname();
  const isAppRoute = HIDE_ON_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAppRoute) return null;

  return (
    <footer className="border-t border-black/[0.08] bg-[#FAFAF8]">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-black/60 font-light">
        <small className="text-[13px]">© 2026 Courssy</small>
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          <FooterLink href="/privacy" label="Privacy Policy" currentPath={pathname} />
          <FooterLink href="/terms" label="Terms of Service" currentPath={pathname} />
          <FooterLink href="/refund" label="Refund Policy" currentPath={pathname} />
        </nav>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  label,
  currentPath,
}: {
  href: string;
  label: string;
  currentPath: string | null;
}) {
  const isCurrent = currentPath === href;
  return (
    <Link
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      className="hover:text-black hover:underline underline-offset-3 transition-colors"
    >
      {label}
    </Link>
  );
}
