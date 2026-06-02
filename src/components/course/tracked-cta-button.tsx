"use client";

import { useState, useMemo } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { trackCheckoutOpen } from "./analytics-tracker";

function detectUserCurrency(): string {
  try {
    const locale = navigator.language;
    // Mappa regioni comuni a valute
    const regionMap: Record<string, string> = {
      US: "USD", GB: "GBP", EU: "EUR", DE: "EUR", FR: "EUR",
      IT: "EUR", ES: "EUR", PT: "EUR", CA: "CAD", AU: "AUD",
      JP: "JPY", CH: "CHF", BR: "BRL", MX: "MXN", NL: "EUR",
      BE: "EUR", AT: "EUR", IE: "EUR", FI: "EUR", GR: "EUR",
      PL: "PLN", SE: "SEK", NO: "NOK", DK: "DKK",
    };
    const parts = locale.split("-");
    const region = parts.length > 1 ? parts[1].toUpperCase() : parts[0].toUpperCase();
    return regionMap[region] ?? "EUR";    } catch (e) {
      console.warn("[Currency] Failed to detect currency:", e);
      return "EUR";
    }
}

interface TrackedCtaButtonProps {
  href?: string;
  productSlug: string;
  productId?: string;
  locale?: string;
  children: React.ReactNode;
  className?: string;
}

export function TrackedCtaButton({
  href,
  productSlug,
  productId,
  locale = "it",
  children,
  className,
}: TrackedCtaButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userCurrency = useMemo(() => detectUserCurrency(), []);

  const handleClick = async (e: React.MouseEvent) => {
    trackCheckoutOpen(productSlug, { locale });
    setError(null);

    if (productId) {
      e.preventDefault();
      setLoading(true);
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, locale, currency: userCurrency }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError(data.error ?? "Checkout non disponibile");
          setLoading(false);
        }
      } catch (e) {
        console.warn("[Checkout] Failed to create checkout:", e);
        setError("Errore di connessione. Riprova.");
        setLoading(false);
      }
      return;
    }

    // If no productId, use href as fallback
    if (!href) {
      e.preventDefault();
    }
  };

  if (productId) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={handleClick}
          disabled={loading}
          className={className}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            children
          )}
          {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
        </button>
        {error && (
          <p className="text-[10px] text-red-400 font-medium animate-fadeIn">{error}</p>
        )}
      </div>
    );
  }

  return (
    <a
      href={href ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
    >
      {children}
      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
    </a>
  );
}
