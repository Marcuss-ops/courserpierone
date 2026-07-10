// ─── TemplateBookClaude — Thin orchestrator ──────────────────
// Composes section components from ./book-claude/ subfolder.

import LanguageSelector from "@/components/funnel/language-selector";
import { SharedFooter } from "@/components/funnel/shared/SharedFooter";
import type { BookClaudeProps } from "./types";
import {
  createBookClaudeT,
  createLocalizeCurrency,
} from "./useBookClaudeI18n";
import { BookClaudeHero } from "./BookClaudeHero";
import { BookClaudeWhoFor } from "./BookClaudeWhoFor";
import { BookClaudeStory } from "./BookClaudeStory";
import { BookClaudeAuthor } from "./BookClaudeAuthor";
import { BookClaudeModules } from "./BookClaudeModules";
import { BookClaudeTestimonial } from "./BookClaudeTestimonial";
import { BookClaudeOffer } from "./BookClaudeOffer";
import { BookClaudeFAQ } from "./BookClaudeFAQ";
import { BookClaudeFinalCTA } from "./BookClaudeFinalCTA";
import { BookClaudeStickyCTA } from "./BookClaudeStickyCTA";

export default function TemplateBookClaude({
  data,
  locale = "it",
  productId,
  productSlug,
  checkoutUrl,
}: BookClaudeProps) {
  const labels = data.ui?.labels ?? {};
  const lcLabels = data.localeContent?.ui?.labels ?? {};
  const benefits =
    data.localeContent?.modules?.items ?? data.ui?.benefits ?? [];
  const faqItems =
    data.localeContent?.faq?.items ?? data.ui?.faq ?? [];

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
  const t = createBookClaudeT(lcLabels, labels, localizeCurrency);

  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans selection:bg-[#FF6B00]/20 antialiased">
      {/* Sticky Mobile CTA */}
      <BookClaudeStickyCTA
        data={data}
        t={t}
        locale={locale}
        productSlug={productSlug}
        productId={productId}
        checkoutUrl={checkoutUrl}
      />

      {/* Language Selector */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSelector
          currentLocale={locale ?? "en"}
          productSlug={productSlug ?? ""}
        />
      </div>

      {/* Sections */}
      <BookClaudeHero
        data={data}
        t={t}
        locale={locale}
        productSlug={productSlug}
        productId={productId}
        checkoutUrl={checkoutUrl}
      />
      <BookClaudeWhoFor t={t} />
      <BookClaudeStory t={t} />
      <BookClaudeAuthor t={t} />
      <BookClaudeModules benefits={benefits} t={t} />
      <BookClaudeTestimonial t={t} />
      <BookClaudeOffer
        data={data}
        t={t}
        locale={locale}
        productSlug={productSlug}
        productId={productId}
        checkoutUrl={checkoutUrl}
      />
      <BookClaudeFAQ items={faqItems} t={t} />
      <BookClaudeFinalCTA
        data={data}
        t={t}
        locale={locale}
        productSlug={productSlug}
        productId={productId}
        checkoutUrl={checkoutUrl}
      />

      {/* Footer */}
      <footer className="py-8 border-t border-[#EAEAEA] bg-white">
        <div className="max-w-[1120px] mx-auto px-6">
          <div className="mb-8 p-4 bg-[#FAFAFA] rounded-2xl border border-[#EAEAEA]">
            <p className="text-[11px] text-[#6B7280] leading-relaxed">
              {t("legal_note")}
            </p>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-[#6B7280] font-medium">
            <div>
              &copy; {new Date().getFullYear()} {t("brand_name") || "Courssy"}
              {" "}&mdash; {t("rights_reserved")}
            </div>
            <div className="flex items-center gap-6">
              <div className="relative">
                <LanguageSelector
                  currentLocale={locale ?? "en"}
                  productSlug={productSlug ?? ""}
                />
              </div>
              <a href="/privacy" className="hover:text-[#1A1A1A] transition-colors">
                {t("privacy")}
              </a>
              <a href="/terms" className="hover:text-[#1A1A1A] transition-colors">
                {t("terms")}
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile spacer for sticky CTA */}
      <div className="h-20 md:h-0" />
    </div>
  );
}
