"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe } from "lucide-react";

/**
 * Global footer shown on the public website.
 *
 * Hidden on app routes (dashboard, admin, account, uploader, auth) because
 * those are full-screen app views with their own visual identity (dark warm
 * theme) — a light cream footer below them would clash visually.
 *
 * Includes a compact language switcher (9 languages). The cookie is httpOnly
 * (set by middleware), so we can't set it from JS — switching navigates to
 * /{newLocale}/{restPath} and the middleware picks up the locale, sets the
 * cookie, and redirects to the proper path.
 */
const HIDE_ON_PREFIXES = ["/dashboard", "/admin", "/account", "/uploader", "/auth", "/debug-locale"];

const LANGUAGES = [
  { code: "it-it", label: "Italiano", flag: "🇮🇹" },
  { code: "en-us", label: "English", flag: "🇬🇧" },
  { code: "es-es", label: "Español", flag: "🇪🇸" },
  { code: "fr-fr", label: "Français", flag: "🇫🇷" },
  { code: "de-de", label: "Deutsch", flag: "🇩🇪" },
  { code: "pt-br", label: "Português", flag: "🇵🇹" },
  { code: "ja-jp", label: "日本語", flag: "🇯🇵" },
  { code: "ar-sa", label: "العربية", flag: "🇸🇦" },
  { code: "zh-cn", label: "中文", flag: "🇨🇳" },
] as const;

const KNOWN_LOCALES = new Set(LANGUAGES.map((l) => l.code));

export function Footer() {
  const pathname = usePathname();
  const isAppRoute = HIDE_ON_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAppRoute) return null;

  return (
    <footer className="border-t border-black/[0.08] bg-[#FAFAF8]">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-5 text-sm text-black/60 font-light">
        {/* Top row: copyright + language switcher */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <small className="text-[13px]">© 2026 Courssy</small>
          <LanguageSwitcher />
        </div>

        {/* Bottom row: legal links */}
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]"
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
  currentPath: string;
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

function LanguageSwitcher() {
  const pathname = usePathname();
  // Detect current locale from the first URL segment
  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";
  const currentLocale = KNOWN_LOCALES.has(firstSegment) ? firstSegment : "it-it";
  // Rest of the path (without locale prefix). Defaults to "/" for the homepage.
  const restPath = firstSegment && KNOWN_LOCALES.has(firstSegment)
    ? pathname.slice(firstSegment.length + 1) || "/"
    : pathname || "/";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value;
    if (newLocale === currentLocale) return;
    // Navigate to /{newLocale}/{restPath}. The middleware will set the httpOnly cookie.
    const target = `/${newLocale}${restPath === "/" ? "" : restPath}`;
    window.location.href = target;
  }

  return (
    <div className="flex items-center gap-2 text-[13px]">
      <label htmlFor="footer-locale" className="flex items-center gap-1.5 text-black/50">
        <Globe className="w-3.5 h-3.5" aria-hidden />
        <span className="sr-only">Language</span>
      </label>
      <select
        id="footer-locale"
        value={currentLocale}
        onChange={handleChange}
        className="bg-white border border-black/10 rounded-md px-2 py-1 text-[12px] font-medium text-black/70 hover:border-black/25 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/25 cursor-pointer transition-colors"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
