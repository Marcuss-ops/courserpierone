"use client";

import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWAInstallBanner — Mostra un banner per installare l'app come PWA.
 * Appare solo se il browser supporta l'installazione e l'utente non ha già installato.
 * Si auto-nasconde dopo che l'utente interagisce (installa o chiude).
 */
export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Verifica se già installato
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
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

  // Non mostrare se già installato, dismissed, o nessun prompt disponibile
  if (!showBanner || installed || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto motion-safe:animate-[slide-up_0.3s_ease-out]">
      <div className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="flex items-start gap-4">
          {/* App icon */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg text-white shrink-0 shadow-md"
            style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #444 100%)" }}
          >
            C
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-cream-dark-text">Installa l&apos;app</h4>
            <p className="text-xs text-cream-dark-text-soft mt-0.5 leading-relaxed">
              Aggiungi Courssy alla schermata home per un accesso rapido ai tuoi corsi.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-cream-dark-gold text-cream-dark-bg rounded-xl text-xs font-bold hover:opacity-90 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Installa
              </button>
              <button
                onClick={handleDismiss}
                className="p-2 text-cream-dark-text-soft hover:text-cream-dark-text transition-colors rounded-xl"
                aria-label="Chiudi"
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
