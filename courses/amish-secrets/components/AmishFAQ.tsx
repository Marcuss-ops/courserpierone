// ─── AmishFAQ — FAQ accordion section (thin wrapper) ───────

import { ArrowRight } from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import { SharedFAQ } from "@/components/funnel/shared/SharedFAQ";
import type { AmishT } from "./types";

interface AmishFAQProps {
  faqItems: { q: string; a: string }[];
  t: AmishT;
  accent: string;
  locale: string;
  productSlug?: string;
  productId?: string;
  checkoutUrl?: string;
}

export function AmishFAQ({
  faqItems,
  t,
  accent,
  locale,
  productSlug,
  productId,
  checkoutUrl,
}: AmishFAQProps) {
  return (
    <SharedFAQ
      items={faqItems}
      title={t("faq_title")}
      accentColor={accent}
      cta={
        <TrackedCtaButton
          href={checkoutUrl}
          productSlug={productSlug ?? ""}
          productId={productId}
          locale={locale}
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`,
            boxShadow: `0 6px 28px ${accent}38`,
          }}
          className="inline-flex items-center gap-2 px-7 py-4 text-white rounded-2xl font-semibold transition-all hover:-translate-y-0.5"
        >
          {t("final_cta_text") || t("offer_cta")}
          <ArrowRight className="w-5 h-5" />
        </TrackedCtaButton>
      }
    />
  );
}
