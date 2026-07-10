// ─── AmishFAQ — FAQ accordion section ──────────────────────

import { useState } from "react";
import { ChevronDown, ArrowRight } from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import type { AmishProps, AmishT } from "./types";

interface AmishFAQProps {
  faqItems: { q: string; a: string }[];
  data: AmishProps["data"];
  t: AmishT;
  accent: string;
  locale: string;
  productSlug?: string;
  productId?: string;
  checkoutUrl?: string;
}

export function AmishFAQ({
  faqItems,
  data,
  t,
  accent,
  locale,
  productSlug,
  productId,
  checkoutUrl,
}: AmishFAQProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  if (faqItems.length === 0) return null;

  return (
    <section className="relative z-10 py-20 lg:py-28">
      <div className="max-w-3xl mx-auto px-6">
        <h2
          className="text-4xl md:text-5xl text-center mb-12 text-gray-900"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
          }}
        >
          {t("faq_title")}
        </h2>
        <div className="space-y-3">
          {faqItems.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl overflow-hidden transition-colors"
              style={{
                background: "rgba(255,255,255,0.65)",
                border: `1px solid ${openFaq === i ? accent + "30" : accent + "12"}`,
                backdropFilter: "blur(8px)",
              }}
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left flex justify-between items-center px-6 py-5"
              >
                <span className="font-bold text-lg pr-4 text-gray-900">
                  {faq.q}
                </span>
                <ChevronDown
                  className="w-5 h-5 shrink-0 transition-transform duration-300"
                  style={{
                    color: accent,
                    transform:
                      openFaq === i ? "rotate(180deg)" : "none",
                  }}
                />
              </button>
              <div
                className={`grid transition-all duration-300 ${
                  openFaq === i
                    ? "grid-rows-[1fr]"
                    : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-6 pb-5 text-gray-600 text-base leading-relaxed">
                    {faq.a}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
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
              {t("final_cta_text") || t("offer_cta")}            <ArrowRight className="w-5 h-5" />
          </TrackedCtaButton>
        </div>
      </div>
    </section>
  );
}
