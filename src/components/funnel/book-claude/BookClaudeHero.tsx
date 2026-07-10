// ─── BookClaudeHero — Hero with 3D cover, badge, CTA ───────

import { ArrowRight, Award, BookOpen, Check, Shield, Star } from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import type { LabelKey } from "./useBookClaudeI18n";

interface BookClaudeHeroProps {
  data: {
    titolo?: string;
    sottotitolo?: string;
    prezzo?: string;
    coverUrl?: string;
  };
  t: (key: LabelKey) => string;
  locale: string;
  productSlug?: string;
  productId?: string;
  checkoutUrl?: string;
}

export function BookClaudeHero({
  data,
  t,
  locale,
  productSlug,
  productId,
  checkoutUrl,
}: BookClaudeHeroProps) {
  const trustBadges = [
    { icon: Check, label: t("instant_download") },
    { icon: Shield, label: t("lifetime_access") },
    { icon: Star, label: t("guarantee_days") },
  ];

  return (
    <section className="relative min-h-[85vh] flex items-center overflow-hidden pb-16 md:pb-0">
      <div className="absolute inset-0 bg-gradient-to-br from-[#FFF8F0] via-white to-[#FFF3EB] opacity-70" />
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#FF6B00]/[0.03] to-transparent" />
      <div className="absolute top-20 right-20 w-80 h-80 rounded-full bg-[#FF6B00]/[0.04] blur-3xl" />
      <div className="absolute bottom-20 left-20 w-[500px] h-[500px] rounded-full bg-[#FF6B00]/[0.03] blur-3xl" />

      <div className="relative w-full max-w-[1200px] mx-auto px-6 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Content */}
          <div className="order-2 lg:order-1 space-y-6 max-w-xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#FF6B00]/10 border border-[#FF6B00]/20 rounded-full">
              <Award className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span className="text-[11px] font-bold text-[#E05E00] uppercase tracking-wider">
                {t("readers")}
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-black tracking-tight leading-[1.05]">
              {data.titolo}
            </h1>

            <p className="text-lg sm:text-xl text-[#4A4A4A] font-medium leading-relaxed">
              {data.sottotitolo}
            </p>

            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-black tracking-tighter">{data.prezzo}</span>
              <span className="text-sm text-[#6B7280] font-medium">{t("one_time")}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <TrackedCtaButton
                href={checkoutUrl}
                productSlug={productSlug ?? ""}
                productId={productId}
                locale={locale}
                className="bg-[#FF6B00] text-white px-10 py-5 rounded-xl font-bold text-base shadow-[0_8px_28px_rgba(255,107,0,0.25)] hover:bg-[#E05E00] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
              >
                {t("buy_now_dash")} {data.prezzo ?? ""}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </TrackedCtaButton>
              <a
                href="#benefits"
                className="bg-white text-[#1A1A1A] border-2 border-[#EAEAEA] px-8 py-5 rounded-xl font-bold hover:bg-[#FAFAFA] transition-all flex items-center justify-center gap-2"
              >
                <BookOpen className="w-5 h-5" />
                {t("view_modules")}
              </a>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#EAEAEA]">
              {trustBadges.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0">
                    <b.icon className="w-3.5 h-3.5 text-[#FF6B00]" />
                  </div>
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.03em] leading-tight">
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: 3D Cover */}
          <div className="order-1 lg:order-2">
            <div className="relative w-full max-w-[380px] mx-auto group perspective-[1500px]">
              <div
                className="relative aspect-[3/4.2] transition-all duration-700 group-hover:-translate-y-2"
                style={{ transform: "rotateY(-8deg) rotateX(4deg)", transformStyle: "preserve-3d" }}
              >
                <div
                  className="absolute -left-4 top-[3%] bottom-[3%] w-8 bg-gradient-to-r from-[#e8e8e8] to-[#fafafa] rounded-l-lg border border-black/5"
                  style={{ transform: "rotateY(85deg) translateZ(-1px)" }}
                />
                <div className="w-full h-full rounded-2xl overflow-hidden border border-black/10 shadow-[0_20px_60px_rgba(255,107,0,0.15)]">
                  {data.coverUrl ? (
                    <img src={data.coverUrl} alt={data.titolo ?? ""} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#FFF3EB] to-white flex items-center justify-center p-8">
                      <BookOpen className="w-12 h-12 text-[#FF6B00]/40 mx-auto" />
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-6 left-[10%] right-[10%] h-6 bg-black/5 blur-xl rounded-full" />
              </div>
              <div className="absolute -top-3 -right-3 bg-[#FF6B00] text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse flex items-center gap-1.5">
                <Award className="w-3 h-3" />
                {t("bestseller")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
