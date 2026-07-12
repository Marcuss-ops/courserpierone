"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Globe, ChevronDown, Check, Search } from "lucide-react";
import { getUiTranslations } from "@/lib/i18n/ui-translations";

// ─── Flag emoji from country code ──────────────
function countryToFlag(countryCode: string | undefined): string {
  if (countryCode?.length !== 2) return "🌐";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// ─── All supported locales with metadata ───────
// Source: synchronized with seed-locales.ts
interface LocaleMeta {
  code: string;        // "fr-fr", "pt-br"
  lang: string;        // "fr", "pt"
  countryCode: string; // "FR", "BR"
  nativeName: string;  // "Français", "Português (Brasil)"
  flag: string;        // "🇫🇷", "🇧🇷"
}

function makeLocale(localeCode: string, countryCode: string, nativeName: string): LocaleMeta {
  const lang = localeCode.split("-")[0];
  return {
    code: localeCode,
    lang,
    countryCode,
    nativeName,
    flag: countryToFlag(countryCode),
  };
}

// Grouped by language for compact display: language → [variants]
interface LocaleGroup {
  lang: string;
  languageName: string;
  locales: LocaleMeta[];
  total: number;
}

const LOCALE_GROUPS: LocaleGroup[] = [
  // ── Top 6 major languages (shown directly) ──
  {
    lang: "it", languageName: "Italiano",
    locales: [makeLocale("it-it", "IT", "Italiano")],
    total: 1,
  },
  {
    lang: "en", languageName: "English",
    locales: [
      makeLocale("en-us", "US", "English (US)"),
      makeLocale("en-gb", "GB", "English (UK)"),
      makeLocale("en-ca", "CA", "English (Canada)"),
      makeLocale("en-au", "AU", "English (Australia)"),
      makeLocale("en-nz", "NZ", "English (New Zealand)"),
      makeLocale("en-ie", "IE", "English (Ireland)"),
      makeLocale("en-in", "IN", "English (India)"),
      makeLocale("en-sg", "SG", "English (Singapore)"),
      makeLocale("en-ph", "PH", "English (Philippines)"),
      makeLocale("en-za", "ZA", "English (South Africa)"),
      makeLocale("en-ng", "NG", "English (Nigeria)"),
      makeLocale("en-ke", "KE", "English (Kenya)"),
    ],
    total: 12,
  },
  {
    lang: "fr", languageName: "Français",
    locales: [
      makeLocale("fr-fr", "FR", "Français (France)"),
      makeLocale("fr-ca", "CA", "Français (Canada)"),
      makeLocale("fr-be", "BE", "Français (Belgique)"),
      makeLocale("fr-ch", "CH", "Français (Suisse)"),
      makeLocale("fr-ma", "MA", "Français (Maroc)"),
    ],
    total: 5,
  },
  {
    lang: "de", languageName: "Deutsch",
    locales: [
      makeLocale("de-de", "DE", "Deutsch (Deutschland)"),
      makeLocale("de-at", "AT", "Deutsch (Österreich)"),
      makeLocale("de-ch", "CH", "Deutsch (Schweiz)"),
    ],
    total: 3,
  },
  {
    lang: "es", languageName: "Español",
    locales: [
      makeLocale("es-es", "ES", "Español (España)"),
      makeLocale("es-mx", "MX", "Español (México)"),
      makeLocale("es-ar", "AR", "Español (Argentina)"),
      makeLocale("es-co", "CO", "Español (Colombia)"),
      makeLocale("es-cl", "CL", "Español (Chile)"),
      makeLocale("es-pe", "PE", "Español (Perú)"),
    ],
    total: 6,
  },
  {
    lang: "pt", languageName: "Português",
    locales: [
      makeLocale("pt-br", "BR", "Português (Brasil)"),
      makeLocale("pt-pt", "PT", "Português (Portugal)"),
    ],
    total: 2,
  },
  // ── Other European ──
  {
    lang: "nl", languageName: "Nederlands",
    locales: [
      makeLocale("nl-nl", "NL", "Nederlands (Nederland)"),
      makeLocale("nl-be", "BE", "Nederlands (België)"),
    ],
    total: 2,
  },
  {
    lang: "pl", languageName: "Polski",
    locales: [makeLocale("pl-pl", "PL", "Polski")],
    total: 1,
  },
  {
    lang: "sv", languageName: "Svenska",
    locales: [makeLocale("sv-se", "SE", "Svenska")],
    total: 1,
  },
  {
    lang: "da", languageName: "Dansk",
    locales: [makeLocale("da-dk", "DK", "Dansk")],
    total: 1,
  },
  {
    lang: "nb", languageName: "Norsk Bokmål",
    locales: [makeLocale("nb-no", "NO", "Norsk Bokmål")],
    total: 1,
  },
  {
    lang: "fi", languageName: "Suomi",
    locales: [makeLocale("fi-fi", "FI", "Suomi")],
    total: 1,
  },
  {
    lang: "ro", languageName: "Română",
    locales: [
      makeLocale("ro-ro", "RO", "Română (România)"),
      makeLocale("ro-md", "MD", "Română (Moldova)"),
    ],
    total: 2,
  },
  {
    lang: "cs", languageName: "Čeština",
    locales: [makeLocale("cs-cz", "CZ", "Čeština")],
    total: 1,
  },
  {
    lang: "hu", languageName: "Magyar",
    locales: [makeLocale("hu-hu", "HU", "Magyar")],
    total: 1,
  },
  {
    lang: "el", languageName: "Ελληνικά",
    locales: [makeLocale("el-gr", "GR", "Ελληνικά")],
    total: 1,
  },
  {
    lang: "bg", languageName: "Български",
    locales: [makeLocale("bg-bg", "BG", "Български")],
    total: 1,
  },
  {
    lang: "hr", languageName: "Hrvatski",
    locales: [makeLocale("hr-hr", "HR", "Hrvatski")],
    total: 1,
  },
  {
    lang: "sk", languageName: "Slovenčina",
    locales: [makeLocale("sk-sk", "SK", "Slovenčina")],
    total: 1,
  },
  {
    lang: "sl", languageName: "Slovenščina",
    locales: [makeLocale("sl-si", "SI", "Slovenščina")],
    total: 1,
  },
  {
    lang: "lt", languageName: "Lietuvių",
    locales: [makeLocale("lt-lt", "LT", "Lietuvių")],
    total: 1,
  },
  {
    lang: "lv", languageName: "Latviešu",
    locales: [makeLocale("lv-lv", "LV", "Latviešu")],
    total: 1,
  },
  {
    lang: "et", languageName: "Eesti",
    locales: [makeLocale("et-ee", "EE", "Eesti")],
    total: 1,
  },
  // ── Asian ──
  {
    lang: "ja", languageName: "日本語",
    locales: [makeLocale("ja-jp", "JP", "日本語")],
    total: 1,
  },
  {
    lang: "ko", languageName: "한국어",
    locales: [makeLocale("ko-kr", "KR", "한국어")],
    total: 1,
  },
  {
    lang: "zh", languageName: "中文",
    locales: [
      makeLocale("zh-cn", "CN", "简体中文 (中国)"),
      makeLocale("zh-tw", "TW", "繁體中文 (台灣)"),
      makeLocale("zh-hk", "HK", "繁體中文 (香港)"),
    ],
    total: 3,
  },
  {
    lang: "hi", languageName: "हिन्दी",
    locales: [makeLocale("hi-in", "IN", "हिन्दी")],
    total: 1,
  },
  {
    lang: "ta", languageName: "தமிழ்",
    locales: [makeLocale("ta-in", "IN", "தமிழ்")],
    total: 1,
  },
  {
    lang: "te", languageName: "తెలుగు",
    locales: [makeLocale("te-in", "IN", "తెలుగు")],
    total: 1,
  },
  {
    lang: "mr", languageName: "मराठी",
    locales: [makeLocale("mr-in", "IN", "मराठी")],
    total: 1,
  },
  {
    lang: "tr", languageName: "Türkçe",
    locales: [makeLocale("tr-tr", "TR", "Türkçe")],
    total: 1,
  },
  {
    lang: "th", languageName: "ไทย",
    locales: [makeLocale("th-th", "TH", "ไทย")],
    total: 1,
  },
  {
    lang: "vi", languageName: "Tiếng Việt",
    locales: [makeLocale("vi-vn", "VN", "Tiếng Việt")],
    total: 1,
  },
  {
    lang: "id", languageName: "Bahasa Indonesia",
    locales: [makeLocale("id-id", "ID", "Bahasa Indonesia")],
    total: 1,
  },
  {
    lang: "ms", languageName: "Bahasa Melayu",
    locales: [makeLocale("ms-my", "MY", "Bahasa Melayu")],
    total: 1,
  },
  {
    lang: "ur", languageName: "اردو",
    locales: [makeLocale("ur-pk", "PK", "اردو (پاکستان)")],
    total: 1,
  },
  {
    lang: "bn", languageName: "বাংলা",
    locales: [makeLocale("bn-bd", "BD", "বাংলা (বাংলাদেশ)")],
    total: 1,
  },
  // ── Middle East ──
  {
    lang: "ar", languageName: "العربية",
    locales: [
      makeLocale("ar-ae", "AE", "العربية (الإمارات)"),
      makeLocale("ar-sa", "SA", "العربية (السعودية)"),
      makeLocale("ar-eg", "EG", "العربية (مصر)"),
    ],
    total: 3,
  },
  {
    lang: "he", languageName: "עברית",
    locales: [makeLocale("he-il", "IL", "עברית")],
    total: 1,
  },
  // ── Other ──
  {
    lang: "ru", languageName: "Русский",
    locales: [makeLocale("ru-ru", "RU", "Русский")],
    total: 1,
  },
  {
    lang: "uk", languageName: "Українська",
    locales: [makeLocale("uk-ua", "UA", "Українська")],
    total: 1,
  },
];

// Top locales shown in a compact row at the top
const TOP_LOCALES = ["it-it", "en-us", "fr-fr", "de-de", "es-es", "pt-br", "pt-pt"];

// ─── Flat list for search ─────────────────────────
const ALL_LOCALES_FLAT = LOCALE_GROUPS.flatMap((g) => g.locales);

// Normalize locale code for lookup (also accept 2-letter codes)
function normalize(code: string): string {
  return code.toLowerCase();
}

interface LanguageSelectorProps {
  currentLocale: string;
  productSlug: string;
  className?: string;
  /** If provided, only show languages present in this set (e.g. from config keys like ["it","en","fr"]) */
  availableLangs?: string[];
}

export default function LanguageSelector({
  currentLocale,
  productSlug,
  className = "",
  availableLangs,
}: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const lang = currentLocale.split("-")[0]?.toLowerCase() ?? "en";
  const t = getUiTranslations(lang);

  // Close on outside click + ESC
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAll(false);
        setSearch("");
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setShowAll(false);
        setSearch("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEsc);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  // Focus search when "Show all" opens
  useEffect(() => {
    if (showAll && searchRef.current) {
      searchRef.current.focus();
    }
  }, [showAll]);

  function switchLanguage(code: string) {
    if (code === currentLocale) {
      setOpen(false);
      return;
    }
    document.cookie = `locale=${code}; path=/; max-age=31536000; sameSite=lax`;
    window.location.href = `/${code}/${productSlug}`;
  }

  // Find active locale info
  const activeLocale = ALL_LOCALES_FLAT.find(
    (l) => l.code === normalize(currentLocale)
  );

  // Filtered locales for search
  const filtered = useMemo(() => {
    if (!search) return null;
    const q = search.toLowerCase();
    return ALL_LOCALES_FLAT.filter(
      (l) =>
        l.nativeName.toLowerCase().includes(q) ||
        l.code.includes(q) ||
        l.lang.includes(q) ||
        l.countryCode.toLowerCase().includes(q)
    );
  }, [search]);

  // Filter locale groups by available languages from config
  const filteredGroups = useMemo(() => {
    if (!availableLangs || availableLangs.length === 0) return LOCALE_GROUPS;
    const langSet = new Set(availableLangs);
    return LOCALE_GROUPS.filter((g) => langSet.has(g.lang));
  }, [availableLangs]);

  // Top locales for quick access (filtered by available)
  const topLocales = useMemo(() => {
    const base = availableLangs && availableLangs.length > 0
      ? TOP_LOCALES.filter((code) => availableLangs.includes(code.split("-")[0]))
      : TOP_LOCALES;
    return base.map((code) => ALL_LOCALES_FLAT.find((l) => l.code === code)!).filter(Boolean);
  }, [availableLangs]);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-900 hover:bg-gray-100/80 transition-all"
        aria-label={t.langSelect}
      >
        <Globe className="w-3.5 h-3.5" />
        <span>{activeLocale?.flag ?? "🌐"}</span>
        <span className="hidden sm:inline">{currentLocale}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl py-2 min-w-[280px] z-[100] max-h-[420px] flex flex-col">
          {/* Search bar (only when showAll) */}
          {showAll && (
            <div className="px-3 pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.langSearchPlaceholder}
                  className="w-full bg-transparent text-xs font-medium text-gray-700 placeholder:text-gray-400 outline-none"
                />
              </div>
            </div>
          )}

          {/* Scrollable list */}
          <div className="overflow-y-auto flex-1 py-1">
            {/* Quick-access top locales (when not in search mode) */}
            {!search && !showAll && (
              <div className="grid grid-cols-3 gap-1 px-3 pb-3 border-b border-gray-100 mb-1">
                {topLocales.map((loc) => {
                  const isActive = loc.code === normalize(currentLocale);
                  return (
                    <button
                      key={loc.code}
                      onClick={() => switchLanguage(loc.code)}
                      className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl text-center transition-all ${
                        isActive
                          ? "bg-[#FFF3EB] text-[#FF6B00] ring-1 ring-[#FF6B00]/20"
                          : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                      }`}
                    >
                      <span className="text-lg leading-none">{loc.flag}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider leading-tight">
                        {loc.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search results or all locales */}
            {search ? (
              // ── Search results ──
              filtered && filtered.length > 0 ? (
                filtered.map((loc) => {
                  const isActive = loc.code === normalize(currentLocale);
                  return (
                    <button
                      key={loc.code}
                      onClick={() => switchLanguage(loc.code)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-[#FFF3EB] text-[#FF6B00] font-bold"
                          : "text-gray-600 hover:bg-gray-50 font-medium"
                      }`}
                    >
                      <span className="text-base shrink-0">{loc.flag}</span>
                      <span className="flex-1 truncate">{loc.nativeName}</span>
                      <span className="text-[10px] font-mono text-gray-400 uppercase">{loc.code}</span>
                      {isActive && <Check className="w-3.5 h-3.5 shrink-0 text-[#FF6B00]" />}
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-6 text-center text-xs text-gray-400 font-medium">
                  {t.langNoResults} &ldquo;{search}&rdquo;
                </div>
              )
            ) : showAll ? (
              // ── All locales grouped ──
              filteredGroups.map((group) => {
                const hasActive = group.locales.some((l) => l.code === normalize(currentLocale));
                return (
                  <div key={group.lang} className="mb-1">
                    <div className="flex items-center gap-2 px-4 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        {group.languageName}
                      </span>
                      {group.total > 1 && (
                        <span className="text-[9px] text-gray-300 font-mono">{group.total}</span>
                      )}
                    </div>
                    {group.locales.map((loc) => {
                      const isActive = loc.code === normalize(currentLocale);
                      return (
                        <button
                          key={loc.code}
                          onClick={() => switchLanguage(loc.code)}
                          className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                            isActive
                              ? "bg-[#FFF3EB] text-[#FF6B00] font-bold"
                              : "text-gray-600 hover:bg-gray-50 font-medium"
                          }`}
                        >
                          <span className="text-base shrink-0">{loc.flag}</span>
                          <span className="flex-1 truncate">{loc.nativeName}</span>
                          <span className="text-[10px] font-mono text-gray-400 uppercase">{loc.code}</span>
                          {isActive && <Check className="w-3.5 h-3.5 shrink-0 text-[#FF6B00]" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            ) : (
              // ── Top one-per-language ──
              filteredGroups.map((group) => {
                const primary = group.locales[0];
                const isActive = group.locales.some((l) => l.code === normalize(currentLocale));
                const showVariants = group.locales.length > 1;
                return (
                  <div key={group.lang}>
                    <button
                      onClick={() => switchLanguage(primary.code)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-[#FFF3EB] text-[#FF6B00] font-bold"
                          : "text-gray-600 hover:bg-gray-50 font-medium"
                      }`}
                    >
                      <span className="text-base shrink-0">{primary.flag}</span>
                      <span className="flex-1 truncate">{group.languageName}</span>
                      {showVariants && (
                        <span className="text-[10px] font-mono text-gray-400">
                          +{group.total - 1}
                        </span>
                      )}
                      {isActive && <Check className="w-3.5 h-3.5 shrink-0 text-[#FF6B00]" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer: toggle all/compact */}
          <div className="border-t border-gray-100 pt-1 px-2">
            <button
              onClick={() => {
                setShowAll(!showAll);
                setSearch("");
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {showAll ? (
                <>↑ {t.langShowCompact}</>
              ) : (
                <>↓ {filteredGroups.length > 0 ? t.langAllVariants.replace("{count}", String(filteredGroups.reduce((acc, g) => acc + g.total, 0))) : t.langShowAll}</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
