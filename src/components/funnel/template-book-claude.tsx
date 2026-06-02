"use client";

import React, { useState } from "react";
import {
  ChevronRight, Check, BookOpen,
  DollarSign, Leaf, Shield, Star, Clock,
  Users, TrendingUp, PiggyBank, Home, Heart,
  Zap, Award, Quote, ThumbsUp, X, Wrench,
  CalendarCheck, Smartphone, CreditCard, Lock
} from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import LanguageSelector from "@/components/funnel/language-selector";

interface BookClaudeProps {
  data: {
    titolo?: string;
    sottotitolo?: string;
    problema?: string;
    storia?: string;
    recensioni?: string;
    cta?: string;
    prezzo?: string;
    coverUrl?: string;
    lezioni?: { titolo: string; descrizione: string }[];
    /** UI translations from DB (labels + benefits + faq) */
    ui?: {
      labels: Record<string, string>;
      benefits: { title: string; desc: string }[];
      faq: { q: string; a: string }[];
    };
  };
  locale?: string;
  productId?: string;
  productSlug?: string;
  checkoutUrl?: string;
}

// ─── Last-resort English fallback labels ────────────
// Source of truth is data.ui.labels from the DB.
// This is only a safety net if the DB entry is missing.
const FALLBACK_LABELS = {
  instant_access: "Instant access",
  buy_now_arrow: "Buy Now →",
  readers: "Readers",
  buy_now_dash: "Buy Now —",
  view_modules: "View Modules",
  ssl_secure: "Secure SSL payment",
  instant_download: "Instant Download",
  lifetime_access: "Lifetime Access",
  guarantee_days: "30-Day Guarantee",
  section_who: "Who Is This For",
  is_this_for_you: "Is This Course For You?",
  perfect_for: "Perfect for you if:",
  p_struggle: "Struggle to make ends meet",
  p_cut_costs: "Cut costs without sacrifice",
  p_consumerism: "Tired of consumerism",
  p_practical: "Want practical methods",
  p_future: "Build financial future",
  not_for: "Not for you if:",
  n_quick: "Get-rich-quick schemes",
  n_habits: "Won't change habits",
  n_quick_fix: "Prefer quick fixes",
  n_implement: "Won't implement",
  n_advice: "Personalized advice",
  section_learn: "What You'll Learn",
  masters_secrets: "The Amish Masters' Secrets",
  modules_desc: "8 practical modules to transform your finances.",
  section_author: "The Author",
  behind_course: "Behind This Course",
  your_name: "Your Name Here",
  researcher_author: "Researcher · Author",
  author_bio: "[Add your story here]",
  section_content: "Course Content",
  what_inside: "What's Inside",
  also_includes: "Also includes:",
  inc_full_ebook: "Full eBook (PDF, ePub, Kindle)",
  inc_checklist: "Printable 30-day checklist",
  inc_excel: "Amish budget Excel sheet",
  inc_shopping: "Weekly shopping list",
  inc_lifetime: "Lifetime member area",
  inc_updates: "Free future updates",
  section_offer: "The Offer",
  invest_yourself: "Invest in Yourself",
  launch_offer: "Launch Offer",
  complete_package: "Complete Package",
  course_value: "Course: $97",
  bonus_value: "Bonus: $27",
  one_time: "One-time payment",
  launch_price: "Launch price — then $37",
  inc_course_full: "Full course",
  inc_ebook: "eBook PDF, ePub, Kindle",
  inc_checklist2: "Printable 30-day checklist",
  inc_excel2: "Amish budget Excel sheet",
  inc_access_updates: "Lifetime access + updates",
  inc_bonus_shopping: "BONUS: Weekly shopping list",
  unlock_now: "Unlock Access Now",
  guarantee_title: "30-Day Guarantee",
  guarantee_text: "Try it for 30 days. If not satisfied, full refund.",
  section_testimonials: "Testimonials",
  reviewer: "Verified Buyer",
  section_faq: "FAQ",
  faq_title: "Frequently Asked Questions",
  offer_valid: "Offer valid this week",
  final_cta: "Start Your Journey Today",
  final_sub: "Join hundreds who transformed their finances.",
  unlock_dash: "Unlock Access —",
  guarantee_badge: "30-Day Guarantee",
  instant_access_badge: "Instant Access",
  lifetime_badge: "Lifetime Updates",
  rights_reserved: "All rights reserved.",
  privacy: "Privacy",
  terms: "Terms",
} as const;

type LabelKey = keyof typeof FALLBACK_LABELS;

// ─── Benefits icons (static — no translation needed) ──
const FEATURE_ICONS = [
  { icon: PiggyBank, color: "#FF6B00" },
  { icon: TrendingUp, color: "#2563EB" },
  { icon: Home, color: "#059669" },
  { icon: Heart, color: "#DC2626" },
  { icon: Leaf, color: "#65A30D" },
  { icon: DollarSign, color: "#D97706" },
  { icon: Users, color: "#7C3AED" },
  { icon: Wrench, color: "#0891B2" },
];

// ─── Component ─────────────────────────────────
export default function TemplateBookClaude({
  data,
  locale = "it",
  productId,
  productSlug,
  checkoutUrl,
}: BookClaudeProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // UI translations arrive from the DB via data.ui.
  // Fallback: labels → key itself (visible debug), benefits → [], faq → []
  const labels = data.ui?.labels ?? {};
  const benefits = data.ui?.benefits ?? [];
  const faqItems = data.ui?.faq ?? [];

  // Don't render sections with empty content
  const hasBenefits = benefits.length > 0;
  const hasFaq = faqItems.length > 0;

  // Simple label lookup: DB → English fallback → key name
  const t = (key: LabelKey): string => labels[key] ?? FALLBACK_LABELS[key] ?? key;

  // ─── RENDER ────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans selection:bg-[#FF6B00]/20 antialiased">
      {/* ================================================================ */}
      {/* STICKY MOBILE CTA BAR */}
      {/* ================================================================ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#EAEAEA] p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-black tracking-tight">{data.prezzo}</div>
            <div className="text-[10px] text-[#6B7280] font-medium">
              {t("instant_access")}
            </div>
          </div>
          <TrackedCtaButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            className="bg-[#FF6B00] text-white px-6 py-3.5 rounded-xl font-bold text-sm shadow-[0_4px_16px_rgba(255,107,0,0.3)] hover:bg-[#E05E00] transition-all flex items-center gap-2 shrink-0"
          >
            {t("buy_now_arrow")}
          </TrackedCtaButton>
        </div>
      </div>

      {/* ── Language Selector (floating top-right) ── */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSelector
          currentLocale={locale ?? "en"}
          productSlug={productSlug ?? ""}
        />
      </div>

      {/* ================================================================ */}
      {/* HERO */}
      {/* ================================================================ */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden pb-16 md:pb-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FFF8F0] via-white to-[#FFF3EB] opacity-60" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#FF6B00]/[0.03] to-transparent" />
        <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-[#FF6B00]/[0.04] blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 rounded-full bg-[#FF6B00]/[0.03] blur-3xl" />

        <div className="relative w-full max-w-[1200px] mx-auto px-6 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* ── Left: Mockup ── */}
            <div className="order-2 lg:order-1">
              <div className="relative w-full max-w-[320px] sm:max-w-[380px] mx-auto group perspective-[1500px]">
                {/* 3D Book Cover */}
                <div className="relative aspect-[3/4.2] transition-all duration-700 group-hover:-translate-y-2"
                     style={{ transform: "rotateY(-8deg) rotateX(4deg)", transformStyle: "preserve-3d" }}>
                  <div className="absolute -left-4 top-[3%] bottom-[3%] w-8 bg-gradient-to-r from-[#e8e8e8] to-[#fafafa] rounded-l-lg border border-black/5"
                       style={{ transform: "rotateY(85deg) translateZ(-1px)" }} />
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
                {/* Badge flottante "Best Seller" */}
                <div className="absolute -top-3 -right-3 bg-[#FF6B00] text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse flex items-center gap-1.5">
                  <Award className="w-3 h-3" />
                  Best Seller
                </div>
              </div>
            </div>

            {/* ── Right: Content ── */}
            <div className="order-1 lg:order-2 space-y-6 max-w-xl">
              {/* Social proof */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-[#FF6B00] text-[#FF6B00]" />
                  ))}
                </div>
                <span className="text-sm font-bold text-[#1A1A1A]">4.8/5</span>
                <span className="text-sm text-[#6B7280]">&mdash; {t("readers")}</span>
              </div>

              {/* Title */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05]">
                {data.titolo}
              </h1>

              {/* Subtitle */}
              <p className="text-lg sm:text-xl text-[#4A4A4A] font-medium leading-relaxed">
                {data.sottotitolo}
              </p>

              {/* Story / Hook */}
              {data.storia && (
                <p className="text-base text-[#6B7280] leading-relaxed border-l-4 border-[#FF6B00]/30 pl-5 italic">
                  &ldquo;{data.storia.split(String.fromCharCode(10))[0] || data.storia}&rdquo;
                </p>
              )}

              {/* CTA + Secondary */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <TrackedCtaButton
                  href={checkoutUrl}
                  productSlug={productSlug ?? ""}
                  productId={productId}
                  locale={locale}
                  className="bg-[#FF6B00] text-white px-10 py-5 rounded-xl font-bold text-lg shadow-[0_8px_28px_rgba(255,107,0,0.25)] hover:bg-[#E05E00] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
                >
                  {t("buy_now_dash")} {data.prezzo ?? ""}
                </TrackedCtaButton>
                <a href="#benefits" className="bg-white text-[#1A1A1A] border-2 border-[#EAEAEA] px-8 py-5 rounded-xl font-bold hover:bg-[#FAFAFA] transition-all flex items-center justify-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  {t("view_modules")}
                </a>
              </div>

              {/* Payment Icons + Secure */}
              <div className="flex items-center gap-4 flex-wrap pt-2">
                <div className="flex items-center gap-2 text-[#6B7280]">
                  {[CreditCard, Smartphone, DollarSign].map((Icon, i) => (
                    <div key={i} className="w-8 h-8 rounded-lg border border-[#EAEAEA] flex items-center justify-center bg-white">
                      <Icon className="w-4 h-4" />
                    </div>
                  ))}
                </div>
                <span className="text-xs text-[#6B7280] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#059669]" />
                  {t("ssl_secure")}
                </span>
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#EAEAEA]">
                {[
                  { icon: Check, label: t("instant_download") },
                  { icon: Shield, label: t("lifetime_access") },
                  { icon: Star, label: t("guarantee_days") },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0">
                      <b.icon className="w-3.5 h-3.5 text-[#FF6B00]" />
                    </div>
                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.03em] leading-tight">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* PER CHI È / NON PER CHI È */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t("section_who")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t("is_this_for_you")}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Per chi è */}
            <div className="bg-white rounded-3xl p-8 lg:p-10 border border-[#EAEAEA] shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#059669]/10 flex items-center justify-center">
                  <ThumbsUp className="w-5 h-5 text-[#059669]" />
                </div>
                <h3 className="text-lg font-black">
                  {t("perfect_for")}
                </h3>
              </div>
              <ul className="space-y-4">
                {[
                  t("p_struggle"),
                  t("p_cut_costs"),
                  t("p_consumerism"),
                  t("p_practical"),
                  t("p_future"),
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-[#059669] shrink-0 mt-0.5" strokeWidth={3} />
                    <span className="text-sm font-medium text-[#4A4A4A]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Non per chi è */}
            <div className="bg-white rounded-3xl p-8 lg:p-10 border border-[#EAEAEA] shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#DC2626]/10 flex items-center justify-center">
                  <X className="w-5 h-5 text-[#DC2626]" />
                </div>
                <h3 className="text-lg font-black">
                  {t("not_for")}
                </h3>
              </div>
              <ul className="space-y-4">
                {[
                  t("n_quick"),
                  t("n_habits"),
                  t("n_quick_fix"),
                  t("n_implement"),
                  t("n_advice"),
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <X className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" strokeWidth={3} />
                    <span className="text-sm font-medium text-[#6B7280]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* WHAT YOU'LL LEARN — 8 Benefits */}
      {/* ================================================================ */}
      {hasBenefits && (
      <section id="benefits" className="py-20 lg:py-24 px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t("section_learn")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t("masters_secrets")}
            </h2>
            <p className="mt-4 text-lg text-[#6B7280] max-w-2xl mx-auto">
              {t("modules_desc")}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {benefits.map((b, i) => {
              const iconConfig = FEATURE_ICONS[i % FEATURE_ICONS.length];
              const Icon = iconConfig.icon;
              return (
                <div
                  key={i}
                  className="group bg-white rounded-2xl p-6 border border-[#EAEAEA] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${iconConfig.color}12` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: iconConfig.color }} />
                  </div>
                  <h3 className="text-base font-bold mb-2">{b.title}</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed flex-1">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {/* ================================================================ */}
      {/* AUTHOR / CREDIBILITÀ (placeholder) */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t("section_author")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t("behind_course")}
            </h2>
          </div>

          <div className="bg-white rounded-3xl p-8 lg:p-12 border border-[#EAEAEA] shadow-sm">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 text-center sm:text-left">
              {/* Foto placeholder */}
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-[#FFF3EB] to-[#FF6B00]/10 flex items-center justify-center shrink-0 border-2 border-[#FF6B00]/20">
                <Users className="w-10 h-10 text-[#FF6B00]/40" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-black mb-2">
                  {t("your_name")}
                </h3>
                <p className="text-sm text-[#FF6B00] font-bold uppercase tracking-wider mb-4">
                  {t("researcher_author")}
                </p>
                <p className="text-sm text-[#6B7280] leading-relaxed">
                  {t("author_bio")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* WHAT'S INSIDE (Chapter Previews) */}
      {/* ================================================================ */}
      {hasBenefits && (
      <section className="py-20 lg:py-24 px-6">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t("section_content")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t("what_inside")}
            </h2>
          </div>

          <div className="space-y-3">
            {benefits.slice(0, 8).map((b, i) => (
              <div key={i} className="flex items-start gap-5 p-5 rounded-2xl border border-[#EAEAEA] hover:bg-[#FAFAFA] transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-[#FFF3EB] flex items-center justify-center shrink-0 font-bold text-[#FF6B00] group-hover:scale-110 transition-transform">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm mb-0.5">{b.title}</h3>
                  <p className="text-sm text-[#6B7280]">{b.desc}</p>
                </div>
                <div className="hidden sm:flex w-7 h-7 rounded-full bg-[#FFF3EB] items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="w-3.5 h-3.5 text-[#FF6B00]" />
                </div>
              </div>
            ))}
          </div>

          {/* What you get */}
          <div className="mt-10 bg-[#FAFAFA] rounded-3xl p-8 border border-[#EAEAEA]">
            <h3 className="font-bold text-lg mb-5">
              {t("also_includes")}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                t("inc_full_ebook"),
                t("inc_checklist"),
                t("inc_excel"),
                t("inc_shopping"),
                t("inc_lifetime"),
                t("inc_updates"),
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-[#FF6B00]" strokeWidth={3} />
                  </div>
                  <span className="text-sm text-[#4A4A4A]">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ================================================================ */}
      {/* PRICING — Value Stack */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FFF8F0] border-y border-[#EAEAEA]">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t("section_offer")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t("invest_yourself")}
            </h2>
          </div>

          <div className="max-w-[520px] mx-auto">
            <div className="relative bg-white rounded-3xl border-2 border-[#FF6B00]/20 shadow-[0_8px_40px_rgba(255,107,0,0.08)] p-8 lg:p-10">
              {/* Badge */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-5 py-1.5 bg-[#FF6B00] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-lg whitespace-nowrap">
                <Zap className="w-3.5 h-3.5" />
                {t("launch_offer")}
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm font-bold text-[#6B7280] uppercase tracking-widest mb-4">
                  {t("complete_package")}
                </p>

                {/* Value Stack */}
                <div className="space-y-1 mb-5">
                  <div className="text-sm text-[#6B7280] line-through">
                    {t("course_value")}
                  </div>
                  <div className="text-sm text-[#6B7280] line-through">
                    {t("bonus_value")}
                  </div>
                  <div className="w-16 h-0.5 bg-[#FF6B00]/30 mx-auto my-3" />
                </div>

                {/* Price */}
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-6xl font-black tracking-tighter">{data.prezzo}</span>
                </div>
                <p className="mt-1 text-sm text-[#6B7280] font-medium">
                  {t("one_time")}
                </p>

                {/* Urgency */}
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-[#FFF3EB] rounded-full border border-[#FF6B00]/10">
                  <Clock className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span className="text-[11px] font-bold text-[#E05E00] uppercase tracking-wider">
                    {t("launch_price")}
                  </span>
                </div>

                {/* What's included */}
                <ul className="mt-6 space-y-3 text-left max-w-sm mx-auto">
                  {[
                    t("inc_course_full"),
                    t("inc_ebook"),
                    t("inc_checklist2"),
                    t("inc_excel2"),
                    t("inc_access_updates"),
                    t("inc_bonus_shopping"),
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-[#FF6B00]" strokeWidth={3} />
                      </div>
                      <span className="text-sm text-[#4A4A4A]">{item}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="mt-7">
                  <TrackedCtaButton
                    href={checkoutUrl}
                    productSlug={productSlug ?? ""}
                    productId={productId}
                    locale={locale}
                    className="w-full bg-[#FF6B00] hover:bg-[#E05E00] text-white py-5 rounded-2xl font-black text-base uppercase tracking-widest transition-all shadow-[0_8px_32px_rgba(255,107,0,0.3)] hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    {t("unlock_now")}
                  </TrackedCtaButton>
                </div>

                {/* Guarantee */}
                <div className="mt-6 bg-[#FFF3EB] rounded-2xl p-5 border border-[#FF6B00]/15">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Shield className="w-5 h-5 text-[#059669]" />
                    <span className="font-black text-sm uppercase tracking-wider">
                      {t("guarantee_title")}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] leading-relaxed">
                    {t("guarantee_text")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* TESTIMONIAL */}
      {/* ================================================================ */}
      {data.recensioni && data.recensioni !== data.storia && (
        <section className="py-20 lg:py-24 bg-white px-6">
          <div className="max-w-[800px] mx-auto text-center">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t("section_testimonials")}
            </span>
            <div className="relative">
              <Quote className="w-10 h-10 text-[#FF6B00]/15 mx-auto mb-4" />
              <blockquote className="text-xl sm:text-2xl font-bold leading-relaxed tracking-tight">
                &ldquo;{data.recensioni}&rdquo;
              </blockquote>
            </div>
            <div className="mt-6 flex items-center justify-center gap-3">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-[#FF6B00] text-[#FF6B00]" />
                ))}
              </div>
            </div>
            <p className="mt-3 text-sm text-[#6B7280]">
              &mdash; {t("reviewer")}
            </p>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* FAQ */}
      {/* ================================================================ */}
      {hasFaq && (
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[700px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t("section_faq")}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              {t("faq_title")}
            </h2>
          </div>

          <div className="space-y-2">
            {faqItems.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#EAEAEA] overflow-hidden transition-shadow hover:shadow-sm">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left"
                >
                  <span className="font-bold text-sm pr-4">{faq.q}</span>
                  <div className={`w-6 h-6 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}>
                    <ChevronRight className="w-3.5 h-3.5 text-[#FF6B00]" />
                  </div>
                </button>
                <div className={`grid transition-all duration-300 ${openFaq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <div className="px-6 pb-4 text-sm text-[#6B7280] leading-relaxed">{faq.a}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ================================================================ */}
      {/* FINAL CTA */}
      {/* ================================================================ */}
      <section className="py-28 lg:py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#0B0B0C]" />
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: `radial-gradient(circle at 30% 20%, #FF6B00 0%, transparent 50%), radial-gradient(circle at 70% 80%, #FF6B00 0%, transparent 50%)` }}
        />

        <div className="relative z-10 max-w-[700px] mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-8">
            <CalendarCheck className="w-4 h-4 text-[#FF6B00]" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {t("offer_valid")}
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1] mb-6">
            {t("final_cta")}
          </h2>

          <p className="text-lg text-gray-400 mb-10 max-w-lg mx-auto">
            {t("final_sub")}
          </p>

          <TrackedCtaButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            className="inline-flex items-center gap-3 bg-[#FF6B00] hover:bg-[#E05E00] text-white px-12 py-5 rounded-2xl font-black text-lg tracking-wide transition-all shadow-[0_8px_32px_rgba(255,107,0,0.35)] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(255,107,0,0.45)]"
          >
            {t("unlock_dash")} {data.prezzo ?? ""}
          </TrackedCtaButton>

          <div className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#059669]" />
              {t("guarantee_badge")}
            </span>
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#FF6B00]" />
              {t("instant_access_badge")}
            </span>
            <span className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#FF6B00]" />
              {t("lifetime_badge")}
            </span>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOOTER */}
      {/* ================================================================ */}
      <footer className="py-8 border-t border-[#EAEAEA] bg-white">
        <div className="max-w-[1120px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-[#6B7280] font-medium">
          <div>&copy; {new Date().getFullYear()} Courssy &mdash; {t("rights_reserved")}</div>
          <div className="flex items-center gap-6">
            <div className="relative">
              <LanguageSelector
                currentLocale={locale ?? "en"}
                productSlug={productSlug ?? ""}
              />
            </div>
            <a href="/privacy" className="hover:text-[#1A1A1A] transition-colors">{t("privacy")}</a>
            <a href="/terms" className="hover:text-[#1A1A1A] transition-colors">{t("terms")}</a>
          </div>
        </div>
      </footer>

      {/* Spacer for sticky mobile CTA */}
      <div className="h-20 md:h-0" />
    </div>
  );
}
