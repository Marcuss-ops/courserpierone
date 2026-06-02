"use client";

import React, { useState, useRef, useEffect } from "react";
import { Globe, ChevronDown, Check } from "lucide-react";

// ─── Supported languages ───────────────────────
const LANGUAGES: { code: string; label: Record<string, string> }[] = [
  { code: "it", label: { it: "Italiano", en: "Italian", fr: "Italien", de: "Italienisch", es: "Italiano", pt: "Italiano" } },
  { code: "en", label: { it: "Inglese", en: "English", fr: "Anglais", de: "Englisch", es: "Inglés", pt: "Inglês" } },
  { code: "fr", label: { it: "Francese", en: "French", fr: "Français", de: "Französisch", es: "Francés", pt: "Francês" } },
  { code: "de", label: { it: "Tedesco", en: "German", fr: "Allemand", de: "Deutsch", es: "Alemán", pt: "Alemão" } },
  { code: "es", label: { it: "Spagnolo", en: "Spanish", fr: "Espagnol", de: "Spanisch", es: "Español", pt: "Espanhol" } },
  { code: "pt", label: { it: "Portoghese", en: "Portuguese", fr: "Portugais", de: "Portugiesisch", es: "Portugués", pt: "Português" } },
  { code: "nl", label: { it: "Olandese", en: "Dutch", fr: "Néerlandais", de: "Niederländisch", es: "Neerlandés", pt: "Neerlandês" } },
  { code: "pl", label: { it: "Polacco", en: "Polish", fr: "Polonais", de: "Polnisch", es: "Polaco", pt: "Polonês" } },
  { code: "sv", label: { it: "Svedese", en: "Swedish", fr: "Suédois", de: "Schwedisch", es: "Sueco", pt: "Sueco" } },
  { code: "da", label: { it: "Danese", en: "Danish", fr: "Danois", de: "Dänisch", es: "Danés", pt: "Dinamarquês" } },
  { code: "no", label: { it: "Norvegese", en: "Norwegian", fr: "Norvégien", de: "Norwegisch", es: "Noruego", pt: "Norueguês" } },
  { code: "fi", label: { it: "Finlandese", en: "Finnish", fr: "Finnois", de: "Finnisch", es: "Finlandés", pt: "Finlandês" } },
  { code: "ro", label: { it: "Rumeno", en: "Romanian", fr: "Roumain", de: "Rumänisch", es: "Rumano", pt: "Romeno" } },
  { code: "cs", label: { it: "Ceco", en: "Czech", fr: "Tchèque", de: "Tschechisch", es: "Checo", pt: "Tcheco" } },
  { code: "hu", label: { it: "Ungherese", en: "Hungarian", fr: "Hongrois", de: "Ungarisch", es: "Húngaro", pt: "Húngaro" } },
  { code: "el", label: { it: "Greco", en: "Greek", fr: "Grec", de: "Griechisch", es: "Griego", pt: "Grego" } },
  { code: "ja", label: { it: "Giapponese", en: "Japanese", fr: "Japonais", de: "Japanisch", es: "Japonés", pt: "Japonês" } },
  { code: "ko", label: { it: "Coreano", en: "Korean", fr: "Coréen", de: "Koreanisch", es: "Coreano", pt: "Coreano" } },
  { code: "zh", label: { it: "Cinese", en: "Chinese", fr: "Chinois", de: "Chinesisch", es: "Chino", pt: "Chinês" } },
  { code: "ar", label: { it: "Arabo", en: "Arabic", fr: "Arabe", de: "Arabisch", es: "Árabe", pt: "Árabe" } },
  { code: "hi", label: { it: "Hindi", en: "Hindi", fr: "Hindi", de: "Hindi", es: "Hindi", pt: "Hindi" } },
  { code: "tr", label: { it: "Turco", en: "Turkish", fr: "Turc", de: "Türkisch", es: "Turco", pt: "Turco" } },
  { code: "th", label: { it: "Tailandese", en: "Thai", fr: "Thaï", de: "Thailändisch", es: "Tailandés", pt: "Tailandês" } },
  { code: "vi", label: { it: "Vietnamita", en: "Vietnamese", fr: "Vietnamien", de: "Vietnamesisch", es: "Vietnamita", pt: "Vietnamita" } },
  { code: "id", label: { it: "Indonesiano", en: "Indonesian", fr: "Indonésien", de: "Indonesisch", es: "Indonesio", pt: "Indonésio" } },
  { code: "ms", label: { it: "Malese", en: "Malay", fr: "Malais", de: "Malaiisch", es: "Malayo", pt: "Malaio" } },
  { code: "ru", label: { it: "Russo", en: "Russian", fr: "Russe", de: "Russisch", es: "Ruso", pt: "Russo" } },
];

// Top languages shown directly in the selector
const TOP_LANGUAGES = ["it", "en", "fr", "de", "es", "pt"];

interface LanguageSelectorProps {
  currentLocale: string;
  productSlug: string;
  className?: string;
}

function getLabel(locale: string, lang: string): string {
  const langData = LANGUAGES.find((l) => l.code === lang);
  if (!langData) return lang.toUpperCase();
  // Try exact locale match, then English, then first available
  return langData.label[locale] ?? langData.label["en"] ?? lang.toUpperCase();
}

export default function LanguageSelector({
  currentLocale,
  productSlug,
  className = "",
}: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAll(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function switchLanguage(code: string) {
    if (code === currentLocale) {
      setOpen(false);
      return;
    }
    // Set cookie for persistence
    document.cookie = `locale=${code}; path=/; max-age=31536000; sameSite=lax`;
    // Navigate to new language version
    window.location.href = `/${code}/${productSlug}`;
  }

  const visibleLangs = showAll ? LANGUAGES : LANGUAGES.filter((l) => TOP_LANGUAGES.includes(l.code));
  const currentName = getLabel(currentLocale, currentLocale);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-900 hover:bg-gray-100/80 transition-all"
        aria-label="Select language"
      >
        <Globe className="w-3.5 h-3.5" />
        <span>{currentLocale}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[170px] z-[100] max-h-[320px] overflow-y-auto">
          {visibleLangs.map((lang) => {
            const isActive = lang.code === currentLocale;
            return (
              <button
                key={lang.code}
                onClick={() => switchLanguage(lang.code)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-[#FFF3EB] text-[#FF6B00] font-bold"
                    : "text-[#4A4A4A] hover:bg-gray-50 font-medium"
                }`}
              >
                <span className="w-5 text-center text-xs font-bold uppercase opacity-50 shrink-0">{lang.code}</span>
                <span className="flex-1">{getLabel(currentLocale, lang.code)}</span>
                {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}

          {/* Toggle show all / show less */}
          {LANGUAGES.length > TOP_LANGUAGES.length && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-400 hover:text-gray-600 border-t border-gray-100 mt-1 pt-2 transition-colors"
            >
              {showAll ? "↑ Show less" : `↓ All ${LANGUAGES.length} languages`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
