"use client";

import { useEffect, useState } from "react";

interface LanguageAlertProps {
  currentLocale: string;
  productSlug: string;
  availableLangs: string[];
  accentColor?: string;
}

const BANNER_TRANSLATIONS: Record<string, { text: string; action: string }> = {
  it: { text: "Questo sito è disponibile in Italiano.", action: "Passa all'Italiano" },
  en: { text: "This site is available in English.", action: "Switch to English" },
  fr: { text: "Ce site est disponible en Français.", action: "Passer au Français" },
  de: { text: "Diese Website ist auf Deutsch verfügbar.", action: "Auf Deutsch wechseln" },
  es: { text: "Este sitio está disponible en Español.", action: "Cambiar a Español" },
  pt: { text: "Este site está disponível em Português.", action: "Mudar para Português" },
  ru: { text: "Этот сайт доступен на Русском языке.", action: "Перейти на Русский" },
  ar: { text: "هذا الموقع متوفر باللغة العربية.", action: "التغيير إلى العربية" },
  ja: { text: "このサイトは日本語でご利用いただけます。", action: "日本語に切り替える" },
  nl: { text: "Deze website is beschikbaar in het Nederlands.", action: "Omschakelen naar het Nederlands" },
  pl: { text: "Ta strona jest dostępna w języku Polskim.", action: "Przełącz na język Polski" },
};

export default function LanguageAlert({
  currentLocale,
  productSlug,
  availableLangs,
  accentColor = "#C9840D",
}: LanguageAlertProps) {
  const [showAlert, setShowAlert] = useState(false);
  const [detectedLang, setDetectedLang] = useState("");

  useEffect(() => {
    try {
      const browserLang = navigator.language.split("-")[0]?.toLowerCase();
      const currentLang = currentLocale.split("-")[0]?.toLowerCase();
      const dismissed = sessionStorage.getItem(`lang-alert-dismissed-${productSlug}`);

      if (
        browserLang &&
        currentLang &&
        browserLang !== currentLang &&
        availableLangs.includes(browserLang) &&
        !dismissed
      ) {
        setDetectedLang(browserLang); // eslint-disable-line react-hooks/set-state-in-effect -- TODO: refactor (FASE 1.10)
        setShowAlert(true);
      }
    } catch (e) {
      console.warn("Failed to detect language discrepancy", e);
    }
  }, [currentLocale, productSlug, availableLangs]);

  if (!showAlert) return null;

  const translation = BANNER_TRANSLATIONS[detectedLang] ?? {
    text: "This page is available in your language.",
    action: "Switch language",
  };

  const handleSwitch = () => {
    document.cookie = `locale=${detectedLang}; path=/; max-age=31536000; sameSite=lax`;
    window.location.href = `/${detectedLang}/${productSlug}`;
  };

  const handleDismiss = () => {
    sessionStorage.setItem(`lang-alert-dismissed-${productSlug}`, "1");
    setShowAlert(false);
  };

  return (
    <div
      className="relative z-50 text-white px-4 py-3 text-xs font-bold flex items-center justify-between shadow-md transition-all animate-fadeIn"
      style={{
        background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}E6 100%)`,
      }}
    >
      <div className="flex-1 text-center">
        <span>{translation.text} </span>
        <button
          onClick={handleSwitch}
          className="underline font-extrabold ml-1 hover:opacity-90 cursor-pointer transition-opacity"
        >
          {translation.action}
        </button>
      </div>
      <button
        onClick={handleDismiss}
        className="text-white/80 hover:text-white font-extrabold ml-4 text-sm cursor-pointer"
        aria-label="Dismiss language alert"
      >
        ✕
      </button>
    </div>
  );
}
