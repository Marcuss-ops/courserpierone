"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Download, X } from "lucide-react";
import { getUiTranslations } from "@/lib/i18n";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Resolve the active 2-letter language from URL pathname or locale cookie.
 * Falls back to "it" (default brand locale).
 */
function resolveClientLang(pathname: string): string {
  if (typeof window !== "undefined") {
    const cookieMatch = /(?:^|; )locale=([^;]+)/.exec(document.cookie);
    if (cookieMatch?.[1]) {
      return cookieMatch[1].toLowerCase().split("-")[0];
    }
  }
  const firstSegment = pathname.split("/")[1]?.toLowerCase();
  if (firstSegment && /^[a-z]{2}-[a-z]{2}$/.test(firstSegment)) {
    return firstSegment.split("-")[0];
  }
  return "it";
}

/**
 * PWAInstallBanner — Shows a banner to install the app as a PWA.
 * Appears only if the browser supports install and the user hasn't already.
 * Auto-hides after the user interacts (install or close).
 *
 * All strings come from `getUiTranslations(lang)` so a new locale adding
 * a key to ui-translations.ts automatically translates this UI surface.
 */
export function PWAInstallBanner() {
  const pathname = usePathname();
  const lang = useMemo(() => resolveClientLang(pathname), [pathname]);
  const t = getUiTranslations(lang);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true); // eslint-disable-line react-hooks/set-state-in-effect -- TODO: refactor (FASE 1.10)
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    const installedHandler = () => {
      setInstalled(true);
      setShowBanner(false);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    void deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
    }
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowBanner(false);
  };

  if (!showBanner || installed || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto motion-safe:animate-[slide-up_0.3s_ease-out]">
      <div className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg text-white shrink-0 shadow-md"
            style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #444 100%)" }}
          >
            C
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-cream-dark-text">{t.pwaInstallTitle}</h4>
            <p className="text-xs text-cream-dark-text-soft mt-0.5 leading-relaxed">
              {t.pwaInstallBody}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-cream-dark-gold text-cream-dark-bg rounded-xl text-xs font-bold hover:opacity-90 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                {t.pwaInstallCta}
              </button>
              <button
                onClick={handleDismiss}
                className="p-2 text-cream-dark-text-soft hover:text-cream-dark-text transition-colors rounded-xl"
                aria-label={t.pwaCloseAria}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
