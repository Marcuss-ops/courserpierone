// ─── Shared types for Book-Claude template sections ────────

import type { LabelKey } from "./useBookClaudeI18n";

export interface BookClaudeProps {
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
    lezioni?: { titolo: string; descrizione: string }[];
    ui?: {
      labels: Record<string, string>;
      benefits: { title: string; desc: string }[];
      faq: { q: string; a: string }[];
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

export type { LabelKey };
