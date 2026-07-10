// ─── BookClaudeStickyCTA — Mobile bottom CTA bar ────────────

import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import type { LabelKey } from "./useBookClaudeI18n";

interface BookClaudeStickyCTAProps {
  data: { prezzo?: string };
  t: (key: LabelKey) => string;
  locale: string;
  productSlug?: string;
  productId?: string;
  checkoutUrl?: string;
}

export function BookClaudeStickyCTA({ data, t, locale, productSlug, productId, checkoutUrl }: BookClaudeStickyCTAProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#EAEAEA] p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-black tracking-tight">{data.prezzo}</div>
          <div className="text-[10px] text-[#6B7280] font-medium">{t("instant_access")}</div>
        </div>
        <TrackedCtaButton href={checkoutUrl} productSlug={productSlug ?? ""} productId={productId} locale={locale}
          className="bg-[#FF6B00] text-white px-6 py-3.5 rounded-xl font-bold text-sm shadow-[0_4px_16px_rgba(255,107,0,0.3)] hover:bg-[#E05E00] transition-all flex items-center gap-2 shrink-0">
          {t("buy_now_arrow")}
        </TrackedCtaButton>
      </div>
    </div>
  );
}
