// ─── AmishModules — Thin wrapper ───────────────────────────

import { ArrowRight } from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import { SharedModules } from "@/components/funnel/shared/SharedModules";
import type { AmishProps, AmishT } from "./types";
import {
  ShoppingCart, Home, TrendingDown, Wrench, User, Leaf, Zap, CalendarCheck,
} from "lucide-react";

const MODULE_ICONS = [
  ShoppingCart, Home, TrendingDown, Wrench, User, Leaf, Zap, CalendarCheck,
];

interface AmishModulesProps {
  modules: { title: string; desc: string }[];
  data: AmishProps["data"];
  t: AmishT;
  accent: string;
  locale: string;
  productSlug?: string;
  productId?: string;
  checkoutUrl?: string;
}

export function AmishModules({
  modules,
  data,
  t,
  accent,
  locale,
  productSlug,
  productId,
  checkoutUrl,
}: AmishModulesProps) {
  return (
    <SharedModules
      items={modules.map((m, i) => ({ ...m, icon: MODULE_ICONS[i % MODULE_ICONS.length] }))}
      title={t("modules_title")}
      description={t("modules_desc")}
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
          className="inline-flex items-center gap-2 px-8 py-4 text-white rounded-2xl font-semibold transition-all hover:-translate-y-0.5"
        >
          {t("offer_cta") || t("hero_cta_prefix")} {data.prezzo}
          <ArrowRight className="w-5 h-5" />
        </TrackedCtaButton>
      }
    />
  );
}
