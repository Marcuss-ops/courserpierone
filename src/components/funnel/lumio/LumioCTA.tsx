// ─── LumioCTA — Thin wrapper ──────────────────────────────

import { SharedPricingSection } from "@/components/funnel/shared/SharedPricingSection";
import type { LumioLocaleContent, LumioT } from "./types";

interface LumioCTAProps {
  data: { cta?: string; prezzo?: string };
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioCTA({ data, lc, t }: LumioCTAProps) {
  return (
    <SharedPricingSection
      title={data.cta || lc?.hero?.cta || t("start_today", "Inizia Oggi")}
      description={
        data.prezzo
          ? `Prezzo: ${data.prezzo}`
          : lc?.hero?.price_label || t("price_special", "Prezzo speciale di lancio")
      }
      ctaLabel={data.cta || lc?.hero?.cta || t("buy_now", "Acquista Ora")}
      variant="dark"
    />
  );
}
