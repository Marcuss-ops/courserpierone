// ─── TemplateAmish — Thin orchestrator ────────────────────
// Composes section components from ./amish/ subfolder.
// Original 600+ line file → ~80 line orchestrator.

import React from "react";
import LanguageSelector from "@/components/funnel/language-selector";
import type { AmishProps } from "./types";
import {
  createAmishT,
  createLocalizeCurrency,
  resolveProductTitle,
  resolveAmishUiLabels,
} from "./useAmishI18n";
import { AmishTopBar } from "./AmishTopBar";
import { AmishHero } from "./AmishHero";
import { AmishProblem } from "./AmishProblem";
import { AmishAuthor } from "./AmishAuthor";
import { AmishTransformation } from "./AmishTransformation";
import { AmishModules } from "./AmishModules";
import { AmishTestimonials } from "./AmishTestimonials";
import { AmishWhatsIncluded } from "./AmishWhatsIncluded";
import { AmishOffer } from "./AmishOffer";
import { AmishFAQ } from "./AmishFAQ";
import { AmishFooter } from "./AmishFooter";
import { AmishStickyCTA } from "./AmishStickyCTA";

export default function TemplateAmish({
  data,
  locale = "en",
  productId,
  productSlug,
  checkoutUrl,
}: AmishProps) {
  // ── Accent color ──
  const accent = data.accentColor ?? "#C9840D";

  // ── I18n helpers ──
  const uiLabels = resolveAmishUiLabels(
    data.ui?.labels ?? {},
    data.localeContent?.ui?.labels ?? {},
  );
  const rawT = createAmishT(uiLabels, locale);
  const baseAmount = data.baseAmount ?? 19;
  const currentAmount = data.currentAmount ?? 19;
  const currencySymbol = data.currencySymbol ?? "€";
  const currency = data.currency ?? "EUR";
  const localizeCurrency = createLocalizeCurrency(
    baseAmount,
    currentAmount,
    currencySymbol,
    currency,
  );
  const t = (key: string): string => localizeCurrency(rawT(key));

  // ── Product title ──
  const productTitle = resolveProductTitle(
    locale,
    data.languages,
    data.titolo,
  );

  // ── Structured data ──
  const lc = data.localeContent as
    | {
        modules?: { items?: { title: string; desc: string }[] };
        faq?: { items?: { q: string; a: string }[] };
        testimonials?: { items?: { name?: string; role?: string; avatar?: string; text?: string }[] };
      }
    | undefined;
  const modules =
    lc?.modules?.items?.length ? lc.modules.items : data.ui?.benefits ?? [];
  const faqItems =
    lc?.faq?.items?.length ? lc.faq.items : data.ui?.faq ?? [];
  const testimonials =
    data.testimonials?.length
      ? data.testimonials          : lc?.testimonials?.items?.map((tst: { name?: string; role?: string; avatar?: string; text?: string }) => ({
            name: tst.name ?? "",
            location: tst.role ?? "",
            avatar: tst.avatar ?? "",
            text: tst.text ?? "",
          })) ??
        data.ui?.testimonials ??
        [];

  // ── CSS vars ──
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
        background:
          "linear-gradient(160deg, #FFFDF9 0%, #FFF8EE 40%, #FFFBF5 100%)",
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

      {/* ── Ambient blobs ── */}
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
          availableLangs={
            data.languages ? Object.keys(data.languages) : undefined
          }
        />
      </div>

      {/* ── Sticky Mobile CTA ── */}
      <AmishStickyCTA
        data={data}
        t={t}
        accent={accent}
        locale={locale}
        productSlug={productSlug}
        productId={productId}
        checkoutUrl={checkoutUrl}
      />

      {/* ── Sections ── */}
      <AmishTopBar t={t} />

      <AmishHero
        data={data}
        t={t}
        productTitle={productTitle}
        locale={locale}
        productSlug={productSlug}
        productId={productId}
        checkoutUrl={checkoutUrl}
        accent={accent}
      />

      <AmishProblem t={t} accent={accent} />

      <AmishAuthor data={data} t={t} accent={accent} />

      <AmishTransformation t={t} accent={accent} />

      <AmishModules
        modules={modules}
        data={data}
        t={t}
        accent={accent}
        locale={locale}
        productSlug={productSlug}
        productId={productId}
        checkoutUrl={checkoutUrl}
      />

      <AmishTestimonials
        testimonials={testimonials}
        t={t}
        accent={accent}
      />

      <AmishWhatsIncluded data={data} t={t} accent={accent} />

      <AmishOffer
        data={data}
        t={t}
        productTitle={productTitle}
        accent={accent}
        locale={locale}
        productSlug={productSlug}
        productId={productId}
        checkoutUrl={checkoutUrl}
      />

      <AmishFAQ
        faqItems={faqItems}
        t={t}
        accent={accent}
        locale={locale}
        productSlug={productSlug}
        productId={productId}
        checkoutUrl={checkoutUrl}
      />

      <AmishFooter t={t} productTitle={productTitle} accent={accent} />

      {/* Mobile spacer for sticky CTA */}
      <div className="h-20 md:h-0" />
    </div>
  );
}
