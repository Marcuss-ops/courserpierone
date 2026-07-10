// ─── BookClaudeFinalCTA — Dark final CTA section ────────────

import { Award, CalendarCheck, Shield, Zap } from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import type { LabelKey } from "./useBookClaudeI18n";

interface BookClaudeFinalCTAProps {
  data: { prezzo?: string };
  t: (key: LabelKey) => string;
  locale: string;
  productSlug?: string;
  productId?: string;
  checkoutUrl?: string;
}

export function BookClaudeFinalCTA({ data, t, locale, productSlug, productId, checkoutUrl }: BookClaudeFinalCTAProps) {
  return (
    <section className="py-28 lg:py-32 px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#0B0B0C]" />
      <div className="absolute inset-0 opacity-20"
        style={{ backgroundImage: "radial-gradient(circle at 30% 20%, #FF6B00 0%, transparent 50%), radial-gradient(circle at 70% 80%, #FF6B00 0%, transparent 50%)" }} />
      <div className="relative z-10 max-w-[700px] mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-8">
          <CalendarCheck className="w-4 h-4 text-[#FF6B00]" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t("offer_valid")}</span>
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1] mb-6">{t("final_cta")}</h2>
        <p className="text-lg text-gray-400 mb-10 max-w-lg mx-auto">{t("final_sub")}</p>
        <TrackedCtaButton href={checkoutUrl} productSlug={productSlug ?? ""} productId={productId} locale={locale}
          className="inline-flex items-center gap-3 bg-[#FF6B00] hover:bg-[#E05E00] text-white px-12 py-5 rounded-2xl font-black text-lg tracking-wide transition-all shadow-[0_8px_32px_rgba(255,107,0,0.35)] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(255,107,0,0.45)]">
          {t("unlock_dash")} {data.prezzo ?? ""}
        </TrackedCtaButton>
        <div className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-[#059669]" />{t("guarantee_badge")}</span>
          <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-[#FF6B00]" />{t("instant_access_badge")}</span>
          <span className="flex items-center gap-2"><Award className="w-4 h-4 text-[#FF6B00]" />{t("lifetime_badge")}</span>
        </div>
      </div>
    </section>
  );
}
