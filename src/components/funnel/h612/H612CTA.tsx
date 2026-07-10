// ─── H612CTA — Thin wrapper ───────────────────────────────

import { SharedPricingSection } from "@/components/funnel/shared/SharedPricingSection";
import type { H612LocaleContent, H612T } from "./types";

interface H612CTAProps {
  data: { cta?: string; prezzo?: string };
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612CTA({ data, lc, t }: H612CTAProps) {
  return (
    <SharedPricingSection
      title={data.cta || lc?.hero?.cta || t("start_today", "Inizia Oggi")}
      description={
        data.prezzo
          ? `${t("price", "Prezzo")}: ${data.prezzo}`
          : lc?.hero?.price_label || t("price_special", "Offerta speciale di lancio")
      }
      ctaLabel={data.cta || lc?.hero?.cta || t("buy_now", "Acquista Ora")}
      variant="orbs"
    />
  );
}
