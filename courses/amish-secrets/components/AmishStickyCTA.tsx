// ─── AmishStickyCTA — Mobile bottom CTA bar (thin wrapper) ──

import { SharedCTA } from "@/components/funnel/shared/SharedCTA";
import type { AmishProps, AmishT } from "./types";

interface AmishStickyCTAProps {
  data: AmishProps["data"];
  t: AmishT;
  accent: string;
  locale: string;
  productSlug?: string;
  productId?: string;
  checkoutUrl?: string;
}

export function AmishStickyCTA({
  data,
  t,
  accent,
  locale,
  productSlug,
  productId,
  checkoutUrl,
}: AmishStickyCTAProps) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        background: "rgba(255,253,249,0.95)",
        backdropFilter: "blur(12px)",
        borderTop: `1px solid ${accent}20`,
        padding: "12px 16px",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
        <div>
          <div className="text-xl font-bold" style={{ color: accent }}>
            {data.prezzo}
          </div>
          <div className="text-[10px] text-gray-400 font-medium">
            {t("hero_no_sub")}
          </div>
        </div>
        <SharedCTA
          href={checkoutUrl}
          productSlug={productSlug ?? ""}
          productId={productId}
          locale={locale}
          accentColor={accent}
          className="px-6 py-3.5 font-bold text-sm"
        >
          {t("hero_cta_prefix")} {data.prezzo}
        </SharedCTA>
      </div>
    </div>
  );
}
