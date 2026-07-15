// ─── AmishHero — Hero section with badge, title, CTAs ─────

import { ArrowRight, Shield, Lock, Check, Star, BookOpen } from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import type { AmishProps, AmishT } from "./types";

interface AmishHeroProps {
  data: AmishProps["data"];
  t: AmishT;
  productTitle: string;
  locale: string;
  productSlug?: string;
  productId?: string;
  checkoutUrl?: string;
  accent: string;
}

export function AmishHero({
  data,
  t,
  productTitle,
  locale,
  productSlug,
  productId,
  checkoutUrl,
  accent,
}: AmishHeroProps) {
  return (
    <header className="relative z-10 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 pt-14 lg:pt-24 pb-20 relative">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          {/* Left: copy */}
          <div>
            {/* Badge */}
            {t("hero_badge") && (
              <div
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-7 border"
                style={{
                  background: `${accent}14`,
                  borderColor: `${accent}28`,
                  color: accent,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: accent }}
                />
                {t("hero_badge")}
              </div>
            )}

            <h1
              className="text-[44px] leading-[1.05] md:text-6xl lg:text-[68px] font-semibold"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                color: "#1A1208",
              }}
            >
              {productTitle}
            </h1>

            {t("hero_subtitle") && (
              <p className="mt-6 text-lg leading-relaxed text-gray-600 max-w-xl">
                {t("hero_subtitle")}
              </p>
            )}

            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <TrackedCtaButton
                href={checkoutUrl}
                productSlug={productSlug ?? ""}
                productId={productId}
                locale={locale}
                style={{
                  background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`,
                  boxShadow: `0 6px 28px ${accent}38`,
                }}
                className="inline-flex justify-center items-center gap-2 px-8 py-4 text-white font-semibold rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-xl"
              >
                {t("hero_cta_prefix")} {data.prezzo}
                <ArrowRight className="w-5 h-5" />
              </TrackedCtaButton>
              {t("hero_secure") && (
                <div className="flex items-center gap-2 text-sm text-gray-500 px-2">
                  <Shield className="w-4 h-4" style={{ color: accent }} />
                  {t("hero_secure")}
                </div>
              )}
            </div>

            {/* Stars + readers */}
            <div className="mt-7 flex items-center gap-3">
              <div className="flex" style={{ color: accent }}>
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <p className="text-sm text-gray-600">
                {t("hero_readers") && <strong>{t("hero_readers")}</strong>}{" "}
                {t("hero_verified") && (
                  <span className="text-xs text-gray-400">
                    {t("hero_verified")}
                  </span>
                )}
              </p>
            </div>

            {/* Trust badges */}
            <div className="mt-8 flex flex-wrap gap-5 opacity-70">
              {t("hero_trust_ssl") && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <Lock className="w-3.5 h-3.5" style={{ color: accent }} />
                  {t("hero_trust_ssl")}
                </div>
              )}
              {t("hero_trust_guarantee") && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <Check className="w-3.5 h-3.5" style={{ color: accent }} />
                  {t("hero_trust_guarantee")}
                </div>
              )}
            </div>
          </div>

          {/* Right: cover image */}
          <div className="relative">
            <div
              className="relative rounded-[28px] overflow-hidden"
              style={{
                boxShadow: `0 20px 60px ${accent}20, 0 4px 20px rgba(0,0,0,0.08)`,
              }}
            >
              {data.coverUrl ? (
                <img
                  src={data.coverUrl}
                  alt={productTitle}
                  className="w-full h-[480px] object-cover"
                />
              ) : (
                <div
                  className="w-full h-[480px] flex items-center justify-center"
                  style={{
                    background: `linear-gradient(160deg, ${accent}18 0%, ${accent}08 100%)`,
                  }}
                >
                  <BookOpen className="w-20 h-20" style={{ color: `${accent}50` }} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              {/* Floating card */}
              <div
                className="absolute bottom-5 left-5 right-5 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3"
                style={{
                  background: "rgba(255,253,249,0.92)",
                  border: "1px solid rgba(255,255,255,0.6)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${accent}18` }}
                >
                  <Shield className="w-5 h-5" style={{ color: accent }} />
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-gray-900 leading-tight">
                    {t("hero_no_sub")}
                  </p>
                  <p className="text-gray-500 text-xs">
                    {t("hero_no_sub_desc")}
                  </p>
                </div>
              </div>
            </div>
            {/* Glow behind image */}
            <div
              className="absolute -inset-8 -z-10 blur-[60px] rounded-full"
              style={{ background: `${accent}12` }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
