"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getUiTranslations } from "@/lib/i18n/ui-translations";
import { localeToLanguage } from "@/lib/i18n/locale-resolver";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Global footer shown on the public website.
 *
 * Hidden on app routes (dashboard, admin, account, uploader, auth) because
 * those are full-screen app views with their own visual identity (dark warm
 * theme) — a light cream footer below them would clash visually.
 *
 * Dark mode: every visible class has a `dark:` variant swapping to
 * cream-dark-* tokens. This footer is the canonical "light page" demo
 * surface — when user toggles dark, the cream cream gradient flips to
 * the warm-dark surface and text/border colors migrate accordingly.
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

  const lang = getCurrentLang(pathname, cookieLocale);
  const t = getUiTranslations(lang);

  return (
    <footer className="border-t border-black/[0.06] dark:border-cream-dark-border bg-gradient-to-b from-[#FAFAF8] to-[#F5F4F0] dark:from-cream-dark-bg dark:to-cream-dark-surface transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Main grid: brand + link columns + language */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <Link
              href="/"
              className="inline-block text-lg font-serif italic text-black/80 dark:text-cream-dark-text hover:text-black dark:hover:text-cream-dark-gold transition-colors"
            >
              courssy
            </Link>
            <p className="mt-3 text-[13px] text-black/45 dark:text-cream-dark-text-soft leading-relaxed max-w-[180px]">
              {t.footerTagline}
            </p>
          </div>

          {/* Explore */}
          <div>
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-black/35 dark:text-cream-dark-text-soft mb-3">
              {t.footerExplore}
            </h4>
            <ul className="space-y-2">
              <FooterLinkItem href="/" label={t.footerHome} currentPath={pathname} />
              <FooterLinkItem href="/login" label={t.footerSignIn} currentPath={pathname} />
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-black/35 dark:text-cream-dark-text-soft mb-3">
              {t.footerLegal}
            </h4>
            <ul className="space-y-2">
              <FooterLinkItem href="/privacy" label={t.footerPrivacy} currentPath={pathname} />
              <FooterLinkItem href="/terms" label={t.footerTerms} currentPath={pathname} />
              <FooterLinkItem href="/refund" label={t.footerRefund} currentPath={pathname} />
            </ul>
          </div>

          {/* Language */}
          <div className="col-span-2 sm:col-span-1">
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-black/35 dark:text-cream-dark-text-soft mb-3">
              {t.footerLanguage}
            </h4>
            <LanguageSwitcher cookieLocale={cookieLocale} />
          </div>
        </div>

        {/* Bottom bar — copyright + ThemeToggle */}
        <div className="mt-10 pt-5 border-t border-black/[0.05] dark:border-cream-dark-border flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-black/35 dark:text-cream-dark-text-soft">
          <span>© 2026 Courssy. {t.footerRights}</span>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[11px] uppercase tracking-widest text-black/30 dark:text-cream-dark-text-soft/70">
              Tema
            </span>
            <ThemeToggle variant="light" />
          </div>
        </div>
      </div>
    </footer>
  );
}

function getCurrentLang(pathname: string, cookieLocale?: string): string {
  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";
  if (firstSegment && KNOWN_LOCALES.has(firstSegment)) {
    return localeToLanguage(firstSegment);
  }
  const normalizedCookie = cookieLocale?.toLowerCase();
  if (normalizedCookie && KNOWN_LOCALES.has(normalizedCookie)) {
    return localeToLanguage(normalizedCookie);
  }
  return "it";
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
        className="text-[13px] text-black/55 dark:text-cream-dark-text-soft hover:text-black dark:hover:text-cream-dark-gold hover:underline underline-offset-3 transition-colors"
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
      className="bg-white dark:bg-cream-dark-surface border border-black/10 dark:border-cream-dark-border rounded-lg px-3 py-2 text-[13px] font-medium text-black/70 dark:text-cream-dark-text hover:border-black/25 dark:hover:border-cream-dark-gold/40 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-cream-dark-gold/40 focus:border-amber-300 dark:focus:border-cream-dark-gold cursor-pointer transition-all w-full"
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.label}
        </option>
      ))}
    </select>
  );
}
