// ─── BookClaudeOffer — Pricing/offer section ────────────────

import { Check, Clock, Shield, Zap } from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import type { LabelKey } from "./useBookClaudeI18n";

interface BookClaudeOfferProps {
  data: { prezzo?: string };
  t: (key: LabelKey) => string;
  locale: string;
  productSlug?: string;
  productId?: string;
  checkoutUrl?: string;
}

export function BookClaudeOffer({ data, t, locale, productSlug, productId, checkoutUrl }: BookClaudeOfferProps) {
  const includeItems = [
    t("inc_course_full"), t("inc_ebook"), t("inc_checklist2"),
    t("inc_excel2"), t("inc_access_updates"), t("inc_bonus_shopping"),
  ];
  return (
    <section className="py-20 lg:py-24 px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#FFF8F0] via-white to-[#FFF3EB]" />
      <div className="relative z-10 max-w-[900px] mx-auto">
        <div className="text-center mb-12">
          <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">{t("section_offer")}</span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">{t("invest_yourself")}</h2>
        </div>
        <div className="max-w-[520px] mx-auto">
          <div className="relative bg-white rounded-3xl border-2 border-[#FF6B00]/20 shadow-[0_8px_40px_rgba(255,107,0,0.08)] p-8 lg:p-10">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-5 py-1.5 bg-[#FF6B00] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-lg whitespace-nowrap">
              <Zap className="w-3.5 h-3.5" />{t("launch_offer")}
            </div>
            <div className="mt-6 text-center">
              <p className="text-sm font-bold text-[#6B7280] uppercase tracking-widest mb-4">{t("complete_package")}</p>
              <div className="space-y-1 mb-3">
                <div className="text-sm text-[#6B7280] line-through">{t("course_value")}</div>
                <div className="text-sm text-[#6B7280] line-through">{t("bonus_value")}</div>
                <div className="w-16 h-0.5 bg-[#FF6B00]/30 mx-auto my-3" />
              </div>
              <div className="flex items-baseline justify-center gap-1"><span className="text-6xl font-black tracking-tighter">{data.prezzo}</span></div>
              <p className="mt-1 text-sm text-[#6B7280] font-medium">{t("one_time")}</p>
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-[#FFF3EB] rounded-full border border-[#FF6B00]/10">
                <Clock className="w-3.5 h-3.5 text-[#FF6B00]" />
                <span className="text-[11px] font-bold text-[#E05E00] uppercase tracking-wider">{t("launch_price")}</span>
              </div>
              <ul className="mt-6 space-y-3 text-left max-w-sm mx-auto">
                {includeItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0 mt-0.5"><Check className="w-3 h-3 text-[#FF6B00]" strokeWidth={3} /></div>
                    <span className="text-sm text-[#4A4A4A]">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <TrackedCtaButton href={checkoutUrl} productSlug={productSlug ?? ""} productId={productId} locale={locale}
                  className="w-full bg-[#FF6B00] hover:bg-[#E05E00] text-white py-5 rounded-2xl font-black text-base uppercase tracking-widest transition-all shadow-[0_8px_32px_rgba(255,107,0,0.3)] hover:-translate-y-0.5 flex items-center justify-center gap-2">
                  {t("unlock_now")} — {data.prezzo ?? ""}
                </TrackedCtaButton>
              </div>
              <div className="mt-6 bg-[#FFF3EB] rounded-2xl p-5 border border-[#FF6B00]/15">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-[#059669]" />
                  <span className="font-black text-sm uppercase tracking-wider">{t("guarantee_title")}</span>
                </div>
                <p className="text-xs text-[#6B7280] leading-relaxed">{t("guarantee_text")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
