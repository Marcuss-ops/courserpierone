"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Global footer shown on the public website.
 *
 * Hidden on app routes (dashboard, admin, account, uploader, auth) because
 * those are full-screen app views with their own visual identity (dark warm
 * theme) — a light cream footer below them would clash visually.
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
  currentLocale?: string;
}

export function Footer({ currentLocale: cookieLocale }: FooterProps = {}) {
  const pathname = usePathname();
  const isAppRoute = HIDE_ON_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAppRoute) return null;

  return (
    <footer className="border-t border-black/[0.06] bg-gradient-to-b from-[#FAFAF8] to-[#F5F4F0]">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Main grid: brand + link columns + language */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <Link
              href="/"
              className="inline-block text-lg font-serif italic text-black/80 hover:text-black transition-colors"
            >
              courssy
            </Link>
            <p className="mt-3 text-[13px] text-black/45 leading-relaxed max-w-[180px]">
              Discover courses that change your life.
            </p>
          </div>

          {/* Explore */}
          <div>
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-black/35 mb-3">
              Explore
            </h4>
            <ul className="space-y-2">
              <FooterLinkItem href="/" label="Home" currentPath={pathname} />
              <FooterLinkItem href="/login" label="Sign in" currentPath={pathname} />
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-black/35 mb-3">
              Legal
            </h4>
            <ul className="space-y-2">
              <FooterLinkItem href="/privacy" label="Privacy Policy" currentPath={pathname} />
              <FooterLinkItem href="/terms" label="Terms of Service" currentPath={pathname} />
              <FooterLinkItem href="/refund" label="Refund Policy" currentPath={pathname} />
            </ul>
          </div>

          {/* Language */}
          <div className="col-span-2 sm:col-span-1">
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-black/35 mb-3">
              Language
            </h4>
            <LanguageSwitcher cookieLocale={cookieLocale} />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-5 border-t border-black/[0.05] flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-black/35">
          <span>© 2026 Courssy. All rights reserved.</span>

        </div>
      </div>
    </footer>
  );
}

function FooterLinkItem({
  href,
  label,
  currentPath,
}: {
  href: string;
  label: string;
  currentPath: string;
}) {
  const isCurrent = currentPath === href || currentPath.endsWith(href);
  return (
    <li>
      <Link
        href={href}
        aria-current={isCurrent ? "page" : undefined}
        className="text-[13px] text-black/55 hover:text-black hover:underline underline-offset-3 transition-colors"
      >
        {label}
      </Link>
    </li>
  );
}

function LanguageSwitcher({ cookieLocale }: { cookieLocale?: string }) {
  const pathname = usePathname();
  const fromCookie = cookieLocale && KNOWN_LOCALES.has(cookieLocale) ? cookieLocale : null;
  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";
  const fromUrl = firstSegment && KNOWN_LOCALES.has(firstSegment) ? firstSegment : null;
  const currentLocale = fromCookie ?? fromUrl ?? DEFAULT_LOCALE;

  let restPath: string;
  if (fromUrl) {
    restPath = pathname.slice(firstSegment.length + 1) || "/";
  } else {
    restPath = pathname || "/";
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value;
    if (newLocale === currentLocale) return;
    const target = `/${newLocale}${restPath === "/" ? "" : restPath}`;
    window.location.href = target;
  }

  return (
    <select
      id="footer-locale"
      value={currentLocale}
      onChange={handleChange}
      aria-label="Select language"
      className="bg-white border border-black/10 rounded-lg px-3 py-2 text-[13px] font-medium text-black/70 hover:border-black/25 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 cursor-pointer transition-all w-full"
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.label}
        </option>
      ))}
    </select>
  );
}
