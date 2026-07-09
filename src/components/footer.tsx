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
 * The current locale is passed as a prop from the server-rendered root
 * layout (which reads the httpOnly `locale` cookie). This is necessary
 * because the URL doesn't always include a locale prefix (e.g. on
 * /privacy, /terms, /refund, /, /login) — the switcher would otherwise
 * always show "Italiano" as active on those pages.
 *
 * Includes a compact language switcher (9 languages). The cookie is
 * httpOnly (set by middleware), so we can't set it from JS — switching
 * navigates to /{newLocale}/{restPath} and the middleware picks up the
 * locale, sets the cookie, and redirects to the proper path.
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

const KNOWN_LOCALES: ReadonlySet<string> = new Set(LANGUAGES.map((l) => l.code));
const DEFAULT_LOCALE = "it-it";

interface FooterProps {
  /** Current locale code (e.g. "it-it", "en-us"), read from the cookie by the server layout. */
  currentLocale?: string;
}

export function Footer({ currentLocale: cookieLocale }: FooterProps = {}) {
  const pathname = usePathname();
  const isAppRoute = HIDE_ON_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAppRoute) return null;

  return (
    <footer className="border-t border-black/[0.08] bg-[#FAFAF8]">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-5 text-sm text-black/60 font-light">
        {/* Top row: copyright + language switcher */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <small className="text-[13px]">© 2026 Courssy</small>
          <LanguageSwitcher cookieLocale={cookieLocale} />
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
  // Match exact path OR a localized variant like /en-us/privacy
  const isCurrent = currentPath === href || currentPath.endsWith(href);
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

function LanguageSwitcher({ cookieLocale }: { cookieLocale?: string }) {
  const pathname = usePathname();
  // Prefer the cookie (read server-side, covers all routes including /privacy / /).
  // Fall back to URL detection if no cookie is set yet.
  const fromCookie = cookieLocale && KNOWN_LOCALES.has(cookieLocale) ? cookieLocale : null;
  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";
  const fromUrl = firstSegment && KNOWN_LOCALES.has(firstSegment) ? firstSegment : null;
  const currentLocale = fromCookie ?? fromUrl ?? DEFAULT_LOCALE;

  // Rest of the path (without locale prefix). Defaults to "/" for the homepage.
  let restPath: string;
  if (fromUrl) {
    // URL has a locale prefix: /{locale}/{rest}
    restPath = pathname.slice(firstSegment.length + 1) || "/";
  } else {
    // No locale prefix in URL (e.g. /privacy or /). Use full pathname.
    restPath = pathname || "/";
  }

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
