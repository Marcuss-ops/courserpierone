"use client";

import React, { useState } from "react";
import {
  ChevronDown, Check, Shield, Star, Clock, Lock,
  Leaf, Zap, ShoppingCart, CreditCard, BookOpen,
  Wrench, CalendarCheck, TrendingDown, Home, User,
  ArrowRight,
} from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import LanguageSelector from "@/components/funnel/language-selector";

// ─── Design Token: accent pulled from config or default ────────────
// The entire page uses ONE unified orange gradient palette.
// No section has a different color — only shades of the accent.

// ─── Props ────────────────────────────────────────────────────────
interface AmishProps {
  data: {
    titolo?: string;
    sottotitolo?: string;
    problema?: string;
    storia?: string;
    recensioni?: string;
    cta?: string;
    prezzo?: string;
    currency?: string;
    currentAmount?: number;
    baseAmount?: number;
    currencySymbol?: string;
    coverUrl?: string;
    author?: string;
    accentColor?: string; // hex, e.g. "#C9840D" — white-label override
    authorImageUrl?: string;
    storyImages?: string[];
    languages?: Record<string, { title: string }>;
    testimonials?: { name: string; location: string; avatar: string; text: string }[];
    lezioni?: { titolo: string; descrizione: string }[];
    ui?: {
      labels: Record<string, string>;
      benefits: { title: string; desc: string }[];
      faq: { q: string; a: string }[];
      testimonials?: { name: string; location: string; avatar: string; text: string }[];
    };
    localeContent?: {
      ui?: { labels?: Record<string, string> };
      modules?: { items?: { title: string; desc: string }[] };
      faq?: { items?: { q: string; a: string }[] };
    };
  };
  locale?: string;
  productId?: string;
  productSlug?: string;
  checkoutUrl?: string;
}

const FALLBACKS: Record<string, Record<string, string>> = {
  en: {
    footer_email: "support@courssy.com",
    footer_privacy: "Privacy Policy",
    footer_terms: "Terms of Service",
    footer_refund: "Refund Policy: 30-day money-back guarantee.",
    footer_rights: "All rights reserved.",
  },
  it: {
    footer_email: "support@courssy.com",
    footer_privacy: "Privacy Policy",
    footer_terms: "Termini di Servizio",
    footer_refund: "Politica di Rimborso: Garanzia soddisatti o rimborsati di 30 giorni.",
    footer_rights: "Tutti i diritti riservati.",
  },
  es: {
    footer_email: "support@courssy.com",
    footer_privacy: "Política de Privacidad",
    footer_terms: "Términos de Servicio",
    footer_refund: "Política de Reembolso: Garantía de devolución de 30 días.",
    footer_rights: "Todos los derechos reservados.",
  },
  fr: {
    footer_email: "support@courssy.com",
    footer_privacy: "Politique de Confidentialité",
    footer_terms: "Conditions d'Utilisation",
    footer_refund: "Politique de Remboursement : Garantie satisfait ou remboursé de 30 jours.",
    footer_rights: "Tous droits réservés.",
  },
  de: {
    footer_email: "support@courssy.com",
    footer_privacy: "Datenschutzerklärung",
    footer_terms: "Nutzungsbedingungen",
    footer_refund: "Rückerstattungsrichtlinie: 30-Tage-Geld-zurück-Garantie.",
    footer_rights: "Alle Rechte vorbehalten.",
  }
};

const MODULE_ICONS = [ShoppingCart, Home, TrendingDown, Wrench, User, Leaf, Zap, CalendarCheck];

// ─── Component ────────────────────────────────────────────────────
export default function TemplateAmish({
  data,
  locale = "en",
  productId,
  productSlug,
  checkoutUrl,
}: AmishProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ── Accent color — white-label override via config ──────────────
  const accent = data.accentColor ?? "#C9840D";

  const uiLabels: Record<string, string> = {
    ...(data.ui?.labels ?? {}),
    ...(data.localeContent?.ui?.labels ?? {}),
  };

  const baseAmount = data.baseAmount ?? 19;
  const currentAmount = data.currentAmount ?? 19;
  const currencySymbol = data.currencySymbol ?? "€";
  const currency = data.currency ?? "EUR";

  const localizeCurrency = (val: string): string => {
    if (!val) return "";
    const ratio = baseAmount > 0 ? (currentAmount / baseAmount) : 1;
    return val.replace(/(?:[€$£¥₽]|[A-Z]{3})\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:[€$£¥₽]|[A-Z]{3})/g, (match, p1, p2) => {
      const rawVal = p1 || p2;
      if (!rawVal) return match;
      const parsedVal = parseFloat(rawVal.replace(",", "."));
      if (isNaN(parsedVal)) return match;
      const converted = Math.round(parsedVal * ratio);
      const isSuffix = ["RUB", "₽", "PLN", "zł", "SEK", "NOK", "DKK", "kr"].includes(currency) || match.trim().endsWith(match.replace(/[\d\s.,]/g, ""));
      return isSuffix ? `${converted} ${currencySymbol}` : `${currencySymbol}${converted}`;
    });
  };

  const t = (key: string): string => {
    const langKey = locale.split("-")[0]?.toLowerCase() || "en";
    const defaultLabels = FALLBACKS[langKey] ?? FALLBACKS["en"];
    let val = uiLabels[key] ?? "";
    if (!val && defaultLabels[key]) {
      val = defaultLabels[key];
    }
    return localizeCurrency(val);
  };

  // ── Product title ─────────────────────────────────────────────
  const lang = (locale ?? "en").split("-")[0];
  const LOCALE_TITLE_MAP: Record<string, string> = {};
  if (data.languages) {
    for (const [localeKey, localeData] of Object.entries(data.languages)) {
      if (localeData?.title) LOCALE_TITLE_MAP[localeKey] = localeData.title;
    }
  }
  const PRODUCT_TITLE =
    LOCALE_TITLE_MAP[lang] ?? LOCALE_TITLE_MAP["en"] ?? data.titolo ?? "";

  // ── Structured data ───────────────────────────────────────────
  const lc = data.localeContent as any;
  const modules =
    lc?.modules?.items?.length ? lc.modules.items : data.ui?.benefits ?? [];
  const faqItems =
    lc?.faq?.items?.length ? lc.faq.items : data.ui?.faq ?? [];
  const testimonials =
    data.testimonials?.length
      ? data.testimonials
      : lc?.testimonials?.items?.map((tst: any) => ({
          name: tst.name,
          location: tst.role ?? "",
          avatar: tst.avatar ?? "",
          text: tst.text,
        })) ??
        data.ui?.testimonials ??
        [];

  const hasModules = modules.length > 0;
  const hasFaq = faqItems.length > 0;
  const hasTestimonials = testimonials.length > 0;

  // ── CSS vars injected inline so accent is white-label-swappable ─
  const cssVars = {
    "--accent": accent,
    "--accent-light": `${accent}18`,
    "--accent-mid": `${accent}30`,
    "--accent-border": `${accent}25`,
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen antialiased"
      style={{
        ...cssVars,
        fontFamily: "'Inter', system-ui, sans-serif",
        // Unified gradient background: very subtle warm-to-white
        background: "linear-gradient(160deg, #FFFDF9 0%, #FFF8EE 40%, #FFFBF5 100%)",
        color: "#2C2016",
      }}
    >
      {/* ── Grain texture overlay ── */}
      <div
        className="pointer-events-none fixed inset-0 z-[1] opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ── Ambient blobs — one unified palette ── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute rounded-full blur-[160px] animate-pulse"
          style={{
            width: 700, height: 700,
            background: `radial-gradient(circle, ${accent}12 0%, transparent 70%)`,
            top: -200, right: -200,
            animationDuration: "10s",
          }}
        />
        <div
          className="absolute rounded-full blur-[180px] animate-pulse"
          style={{
            width: 500, height: 500,
            background: `radial-gradient(circle, ${accent}09 0%, transparent 70%)`,
            bottom: -150, left: -150,
            animationDuration: "14s",
            animationDelay: "3s",
          }}
        />
        <div
          className="absolute rounded-full blur-[120px] animate-pulse"
          style={{
            width: 400, height: 400,
            background: `radial-gradient(circle, ${accent}08 0%, transparent 70%)`,
            top: "40%", left: "30%",
            animationDuration: "18s",
            animationDelay: "6s",
          }}
        />
      </div>

      {/* ── Language Selector ── */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSelector
          currentLocale={locale ?? "en"}
          productSlug={productSlug ?? ""}
          availableLangs={data.languages ? Object.keys(data.languages) : undefined}
        />
      </div>

      {/* ── Sticky Mobile CTA ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          background: "rgba(255,253,249,0.95)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(201,132,13,0.12)",
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
          <TrackedCtaButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            style={{
              background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`,
              boxShadow: `0 4px 20px ${accent}40`,
            }}
            className="text-white px-6 py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center gap-2"
          >
            {t("hero_cta_prefix")} {data.prezzo}
            <ArrowRight className="w-4 h-4" />
          </TrackedCtaButton>
        </div>
      </div>

      {/* ================================================================ */}
      {/* TOP BAR */}
      {/* ================================================================ */}
      {t("top_bar") && (
        <div
          className="relative z-10 text-center text-sm py-3 px-4"
          style={{
            background: `linear-gradient(90deg, ${accent}E8 0%, ${accent} 50%, ${accent}E8 100%)`,
            color: "#fff",
          }}
        >
          <p className="font-semibold tracking-wide">{t("top_bar")}</p>
        </div>
      )}

      {/* ================================================================ */}
      {/* HERO */}
      {/* ================================================================ */}
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
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "#1A1208" }}
              >
                {PRODUCT_TITLE}
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
                    <span className="text-xs text-gray-400">{t("hero_verified")}</span>
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
                {t("hero_trust_stripe") && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                    <CreditCard className="w-3.5 h-3.5" style={{ color: accent }} />
                    {t("hero_trust_stripe")}
                  </div>
                )}
                {t("hero_trust_paypal") && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                    <CreditCard className="w-3.5 h-3.5" style={{ color: accent }} />
                    {t("hero_trust_paypal")}
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
                style={{ boxShadow: `0 20px 60px ${accent}20, 0 4px 20px rgba(0,0,0,0.08)` }}
              >
                {data.coverUrl ? (
                  <img
                    src={data.coverUrl}
                    alt={PRODUCT_TITLE}
                    className="w-full h-[480px] object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-[480px] flex items-center justify-center"
                    style={{ background: `linear-gradient(160deg, ${accent}18 0%, ${accent}08 100%)` }}
                  >
                    <BookOpen className="w-20 h-20" style={{ color: `${accent}50` }} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                {/* Floating card */}
                <div
                  className="absolute bottom-5 left-5 right-5 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3"
                  style={{ background: "rgba(255,253,249,0.92)", border: "1px solid rgba(255,255,255,0.6)" }}
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
                    <p className="text-gray-500 text-xs">{t("hero_no_sub_desc")}</p>
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

      {/* ================================================================ */}
      {/* PROBLEM SECTION */}
      {/* ================================================================ */}
      {t("problem_title") && (
        <section className="relative z-10 py-20 lg:py-28">
          <div className="max-w-5xl mx-auto px-6">
            <h2
              className="text-4xl md:text-5xl text-center mb-14"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "#1A1208" }}
            >
              {t("problem_title")}
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: <TrendingDown className="w-6 h-6" />, title: t("problem_1_title"), text: t("problem_1_text") },
                { icon: <Zap className="w-6 h-6" />, title: t("problem_2_title"), text: t("problem_2_text") },
                { icon: <Clock className="w-6 h-6" />, title: t("problem_3_title"), text: t("problem_3_text") },
              ]
                .filter((item) => item.title || item.text)
                .map((item, i) => (
                  <div
                    key={i}
                    className="rounded-2xl p-7"
                    style={{
                      background: "rgba(255,255,255,0.7)",
                      border: `1px solid ${accent}18`,
                      backdropFilter: "blur(8px)",
                      boxShadow: `0 4px 24px ${accent}0A`,
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                      style={{ background: `${accent}15`, color: accent }}
                    >
                      {item.icon}
                    </div>
                    <h3 className="font-bold text-lg mb-2 text-gray-900">{item.title}</h3>
                    <p className="text-gray-600 text-base leading-relaxed">{item.text}</p>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* AUTHOR / STORY */}
      {/* ================================================================ */}
      {(t("author_title") || t("author_bio_1")) && (
        <section className="relative z-10 py-20 lg:py-28">
          <div className="max-w-5xl mx-auto px-6">
            <div
              className="rounded-[32px] p-8 md:p-14 grid md:grid-cols-[220px_1fr] gap-10 items-start"
              style={{
                background: "rgba(255,255,255,0.66)",
                border: `1px solid ${accent}18`,
                backdropFilter: "blur(10px)",
                boxShadow: `0 8px 40px ${accent}0C`,
              }}
            >
              {/* Author avatar */}
              <div className="text-center md:text-left">
                <div
                  className="w-40 h-40 mx-auto md:mx-0 rounded-2xl overflow-hidden animate-fade-in"
                  style={{ border: `2px solid ${accent}25`, background: `${accent}0A` }}
                >
                  {data.authorImageUrl ? (
                    <img
                      src={data.authorImageUrl}
                      alt={data.author ?? ""}
                      className="w-full h-full object-cover"
                    />
                  ) : data.coverUrl ? (
                    <img
                      src={data.coverUrl}
                      alt={data.author ?? ""}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-16 h-16" style={{ color: `${accent}40` }} />
                    </div>
                  )}
                </div>
                <p
                  className="mt-4 text-2xl font-semibold text-gray-900"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  {data.author}
                </p>
                {t("author_role") && (
                  <p className="text-base font-semibold mt-1" style={{ color: accent }}>
                    {t("author_role")}
                  </p>
                )}
              </div>

              {/* Bio */}
              <div>
                {t("author_title") && (
                  <h2
                    className="text-3xl md:text-4xl mb-5 text-gray-900 font-semibold"
                    style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                  >
                    {t("author_title")}
                  </h2>
                )}
                <div className="space-y-4 text-gray-600 text-base leading-relaxed">
                  {[t("author_bio_1"), t("author_bio_2"), t("author_bio_3")]
                    .filter(Boolean)
                    .map((bio, i) => (
                      <p key={i}>{bio}</p>
                    ))}
                </div>
              </div>

              {/* Story Images Gallery */}
              {data.storyImages && data.storyImages.length > 0 && (
                <div className="md:col-span-2 mt-8 pt-8 border-t" style={{ borderColor: `${accent}18` }}>
                  <p className="text-xs uppercase tracking-widest mb-4 font-bold" style={{ color: accent }}>
                    {t("story_gallery_title") || "I Momenti della Storia"}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {data.storyImages.map((img, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300" style={{ border: `1px solid ${accent}15` }}>
                          <img src={img} alt={t(`caption_${idx + 1}`) || ""} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                        </div>
                        {t(`caption_${idx + 1}`) && (
                          <p className="text-xs text-gray-500 italic text-center">
                            {t(`caption_${idx + 1}`)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* TRANSFORMATION */}
      {/* ================================================================ */}
      {t("transform_title") && (
        <section className="relative z-10 py-16">
          <div className="max-w-4xl mx-auto px-6">
            <div
              className="rounded-[28px] p-8 md:p-12"
              style={{
                background: `linear-gradient(135deg, ${accent}0D 0%, ${accent}06 100%)`,
                border: `1px solid ${accent}20`,
              }}
            >
              <h3
                className="text-3xl md:text-4xl text-center mb-10 text-gray-900"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {t("transform_title")}
              </h3>
              <div className="grid md:grid-cols-2 gap-10">
                {/* Before */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-400 mb-4 font-bold">
                    {t("transform_before_label")}
                  </p>
                  <ul className="space-y-3">
                    {[t("transform_before_1"), t("transform_before_2"), t("transform_before_3")]
                      .filter(Boolean)
                      .map((item, i) => (
                        <li key={i} className="flex gap-3 text-gray-600">
                          <span className="text-red-400 font-bold mt-0.5 shrink-0">×</span>
                          <span>{item}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                {/* After */}
                <div
                  className="md:pl-10 md:border-l"
                  style={{ borderColor: `${accent}25` }}
                >
                  <p
                    className="text-xs uppercase tracking-widest mb-4 font-bold"
                    style={{ color: accent }}
                  >
                    {t("transform_after_label")}
                  </p>
                  <ul className="space-y-3">
                    {[t("transform_after_1"), t("transform_after_2"), t("transform_after_3")]
                      .filter(Boolean)
                      .map((item, i) => (
                        <li key={i} className="flex gap-3 text-gray-700 font-medium">
                          <span className="font-bold mt-0.5 shrink-0" style={{ color: accent }}>
                            ✓
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
              {t("transform_disclaimer") && (
                <p className="text-center text-xs text-gray-400 mt-8">
                  {t("transform_disclaimer")}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* MODULES */}
      {/* ================================================================ */}
      {hasModules && (
        <section className="relative z-10 py-20 lg:py-28">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2
                className="text-4xl md:text-5xl text-gray-900"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {t("modules_title")}
              </h2>
              {t("modules_desc") && (
                <p className="mt-4 text-gray-600">{t("modules_desc")}</p>
              )}
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              {modules.map((m: any, i: number) => {
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
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${accent}18`;
                      (e.currentTarget as HTMLElement).style.borderColor = `${accent}30`;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 12px ${accent}08`;
                      (e.currentTarget as HTMLElement).style.borderColor = `${accent}15`;
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
                        <h4 className="font-bold text-gray-900 text-xl">{m.title}</h4>
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
      )}

      {/* ================================================================ */}
      {/* TESTIMONIALS */}
      {/* ================================================================ */}
      {hasTestimonials && (
        <section className="relative z-10 py-20 lg:py-28">
          <div className="max-w-6xl mx-auto px-6">
            <h2
              className="text-4xl md:text-5xl text-center mb-3 text-gray-900"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              {t("testimonials_title")}
            </h2>
            {t("testimonials_subtitle") && (
              <p className="text-center text-gray-400 mb-12 text-sm">
                {t("testimonials_subtitle")}
              </p>
            )}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((tst: any, i: number) => (
                <div
                  key={i}
                  className="rounded-2xl p-6"
                  style={{
                    background: "rgba(255,255,255,0.65)",
                    border: `1px solid ${accent}15`,
                    backdropFilter: "blur(8px)",
                    boxShadow: `0 4px 20px ${accent}08`,
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    {tst.avatar ? (
                      <img
                        src={tst.avatar}
                        alt=""
                        className="w-11 h-11 rounded-full object-cover"
                        style={{ boxShadow: `0 0 0 2px ${accent}30` }}
                      />
                    ) : (
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-sm"
                        style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}AA 100%)` }}
                      >
                        {tst.name?.[0] ?? "?"}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{tst.name}</p>
                      <p className="text-xs font-medium" style={{ color: accent }}>
                        {tst.location}
                      </p>
                    </div>
                  </div>
                  <div className="flex mb-3" style={{ color: accent }}>
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </div>
                  <p className="text-base leading-relaxed text-gray-600">
                    &ldquo;{tst.text}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* WHAT'S INCLUDED */}
      {/* ================================================================ */}
      {t("whats_included_title") && (
        <section className="relative z-10 py-20 lg:py-28">
          <div className="max-w-5xl mx-auto px-6 grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <h2
                className="text-4xl md:text-5xl mb-8 text-gray-900"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {t("whats_included_title")}
              </h2>
              <ul className="space-y-4">
                {[1, 2, 3, 4, 5, 6].map((n) => {
                  const item = t(`whats_included_${n}`);
                  return item ? (
                    <li key={n} className="flex gap-3 text-gray-700 text-base">
                      <Check
                        className="w-5 h-5 shrink-0 mt-0.5"
                        strokeWidth={2.5}
                        style={{ color: accent }}
                      />
                      <span>{item}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
            <div className="relative">
              <div
                className="absolute -inset-6 blur-[50px] rounded-full -z-10"
                style={{ background: `${accent}10` }}
              />
              {data.coverUrl ? (
                <img
                  src={data.coverUrl}
                  alt=""
                  className="relative rounded-[28px] w-full h-[420px] object-cover"
                  style={{
                    border: `1px solid ${accent}18`,
                    boxShadow: `0 16px 50px ${accent}18`,
                  }}
                />
              ) : (
                <div
                  className="relative rounded-[28px] w-full h-[420px] flex items-center justify-center"
                  style={{
                    background: `linear-gradient(160deg, ${accent}12 0%, ${accent}06 100%)`,
                    border: `1px solid ${accent}20`,
                  }}
                >
                  <BookOpen className="w-16 h-16" style={{ color: `${accent}40` }} />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* OFFER / PRICING */}
      {/* ================================================================ */}
      <section className="relative z-10 py-20 lg:py-28">
        {/* Dark gradient section background */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: `linear-gradient(160deg, #1A1208 0%, #251A0C 50%, #1A1208 100%)`,
          }}
        />
        {/* Accent glows */}
        <div
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 800px 400px at 20% 50%, ${accent}18 0%, transparent 70%), radial-gradient(ellipse 600px 400px at 80% 50%, ${accent}12 0%, transparent 70%)`,
          }}
        />

        <div className="max-w-2xl mx-auto px-6">
          <div
            className="rounded-[32px] p-8 md:p-14 text-center"
            style={{
              background: "rgba(255,250,240,0.06)",
              backdropFilter: "blur(12px)",
              border: `1px solid ${accent}30`,
              boxShadow: `0 24px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
            }}
          >
            {t("offer_badge") && (
              <p
                className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest mb-5 uppercase"
                style={{ background: `${accent}22`, color: accent }}
              >
                {t("offer_badge")}
              </p>
            )}

            <h2
              className="text-4xl md:text-5xl text-white"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              {PRODUCT_TITLE}
              {t("offer_title") && <> &mdash; {t("offer_title")}</>}
            </h2>

            <div className="mt-8 flex items-center justify-center gap-5">
              {t("offer_original_price") && (
                <span className="text-2xl line-through text-white/30">
                  {t("offer_original_price")}
                </span>
              )}
              <span
                className="text-6xl font-semibold"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: accent }}
              >
                {data.prezzo}
              </span>
            </div>

            {t("offer_one_time") && (
              <p className="mt-2 text-white/60">{t("offer_one_time")}</p>
            )}
            {t("offer_launch_note") && (
              <p className="mt-1 text-sm font-medium" style={{ color: accent }}>
                {t("offer_launch_note")}
              </p>
            )}

            <TrackedCtaButton
              href={checkoutUrl}
              productSlug={productSlug ?? ""}
              productId={productId}
              locale={locale}
              style={{
                background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`,
                boxShadow: `0 8px 40px ${accent}50`,
              }}
              className="mt-10 inline-flex w-full justify-center items-center gap-2 px-8 py-5 text-white font-semibold rounded-2xl text-lg transition-all hover:-translate-y-0.5"
            >
              {t("offer_cta")} {data.prezzo}
              <ArrowRight className="w-5 h-5" />
            </TrackedCtaButton>

            <div className="mt-5 flex items-center justify-center gap-4 text-xs text-white/40">
              {t("offer_stripe_paypal") && (
                <span className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" style={{ color: accent }} />
                  {t("offer_stripe_paypal")}
                </span>
              )}
              {t("offer_invoice") && (
                <>
                  <span>&bull;</span>
                  <span>{t("offer_invoice")}</span>
                </>
              )}
            </div>

            {/* Guarantee */}
            {t("guarantee_title") && (
              <div
                className="mt-10 text-left rounded-2xl p-6"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${accent}20`,
                }}
              >
                <div className="flex gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${accent}20`, color: accent }}
                  >
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{t("guarantee_title")}</p>
                    <p className="text-sm text-white/55 mt-1 leading-relaxed">
                      {t("guarantee_text")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FAQ */}
      {/* ================================================================ */}
      {hasFaq && (
        <section className="relative z-10 py-20 lg:py-28">
          <div className="max-w-3xl mx-auto px-6">
            <h2
              className="text-4xl md:text-5xl text-center mb-12 text-gray-900"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              {t("faq_title")}
            </h2>
            <div className="space-y-3">
              {faqItems.map((faq: any, i: number) => (
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
                    <span className="font-bold text-lg pr-4 text-gray-900">{faq.q}</span>
                    <ChevronDown
                      className="w-5 h-5 shrink-0 transition-transform duration-300"
                      style={{ color: accent, transform: openFaq === i ? "rotate(180deg)" : "none" }}
                    />
                  </button>
                  <div
                    className={`grid transition-all duration-300 ${
                      openFaq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
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
                {t("final_cta_text") || t("offer_cta")}
                <ArrowRight className="w-5 h-5" />
              </TrackedCtaButton>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* FOOTER */}
      {/* ================================================================ */}
      <footer
        className="relative z-10 py-12 text-sm text-gray-400"
        style={{ borderTop: `1px solid ${accent}12` }}
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div>
              <p className="font-semibold text-gray-700">{PRODUCT_TITLE}</p>
              <p className="mt-1">{t("footer_rights")}</p>
            </div>
            <div className="text-xs leading-relaxed space-y-1">
              <p>
                Email:{" "}
                <a href={`mailto:${t("footer_email")}`} style={{ color: accent }} className="underline">
                  {t("footer_email")}
                </a>
              </p>
              <p className="flex flex-wrap gap-3">
                {t("footer_privacy") && (
                  <a href="/privacy" className="hover:text-gray-700 transition-colors">
                    {t("footer_privacy")}
                  </a>
                )}
                {t("footer_terms") && (
                  <a href="/terms" className="hover:text-gray-700 transition-colors">
                    {t("footer_terms")}
                  </a>
                )}
                {t("footer_refund") && (
                  <span className="text-gray-500">
                    • {t("footer_refund")}
                  </span>
                )}
                {t("footer_cookies") && (
                  <a href="#" className="hover:text-gray-700 transition-colors">
                    {t("footer_cookies")}
                  </a>
                )}
                {t("footer_withdrawal") && (
                  <a href="#" className="hover:text-gray-700 transition-colors">
                    {t("footer_withdrawal")}
                  </a>
                )}
              </p>
            </div>
          </div>
          {t("footer_legal_note") && (
            <p className="mt-8 text-[11px] text-gray-300 max-w-3xl">
              {t("footer_legal_note")}
            </p>
          )}
        </div>
      </footer>

      {/* Mobile spacer for sticky CTA */}
      <div className="h-20 md:h-0" />
    </div>
  );
}
