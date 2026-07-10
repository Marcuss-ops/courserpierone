// ─── AmishModules — Grid of module/benefit cards ──────────

import { ShoppingCart, Home, TrendingDown, Wrench, User, Leaf, Zap, CalendarCheck, ArrowRight } from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import type { AmishProps, AmishT } from "./types";

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
  if (modules.length === 0) return null;

  return (
    <section className="relative z-10 py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2
            className="text-4xl md:text-5xl text-gray-900"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
            }}
          >
            {t("modules_title")}
          </h2>
          {t("modules_desc") && (
            <p className="mt-4 text-gray-600">{t("modules_desc")}</p>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {modules.map((m, i) => {
            const Icon = MODULE_ICONS[i % MODULE_ICONS.length];
            return (
              <div
                key={i}
                className="group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: "rgba(255,255,255,0.65)",
                  border: `1px solid ${accent}15`,
                  backdropFilter: "blur(8px)",
                  boxShadow: `0 2px 12px ${accent}08`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    `0 8px 32px ${accent}18`;
                  (e.currentTarget as HTMLElement).style.borderColor =
                    `${accent}30`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    `0 2px 12px ${accent}08`;
                  (e.currentTarget as HTMLElement).style.borderColor =
                    `${accent}15`;
                }}
              >
                <div className="flex gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                    style={{ background: `${accent}14`, color: accent }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-xl">
                      {m.title}
                    </h4>
                    <p className="text-gray-600 text-base mt-1">{m.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
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
            className="inline-flex items-center gap-2 px-8 py-4 text-white rounded-2xl font-semibold transition-all hover:-translate-y-0.5"
          >
            {t("offer_cta") || t("hero_cta_prefix")} {data.prezzo}
            <ArrowRight className="w-5 h-5" />
          </TrackedCtaButton>
        </div>
      </div>
    </section>
  );
}
