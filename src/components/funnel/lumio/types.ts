// ─── Shared types for Lumio template sections ──────────────

export interface LumioProps {
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
    localeContent?: LumioLocaleContent;
  };
  locale?: string;
  productId?: string;
  productSlug?: string;
  checkoutUrl?: string;
}

export interface LumioLocaleContent {
  nav?: {
    brand?: string;
    features?: string;
    pricing?: string;
    testimonials?: string;
    get_started?: string;
    learn_more?: string;
  };
  hero?: {
    cta?: string;
    secondary_cta?: string;
    price_label?: string;
  };
  testimonials?: {
    badge?: string;
    title?: string;
    items?: { name?: string; role?: string }[];
  };
  lessons?: {
    badge?: string;
    title?: string;
  };
  footer?: {
    rights_reserved?: string;
    privacy?: string;
    terms?: string;
    contact?: string;
  };
  problem?: { badge?: string };
  story?: { badge?: string };
  trust?: { title?: string; company_names?: string[] };
  ui?: { labels?: Record<string, string> };
}

export type LumioT = (key: string, fallback: string) => string;
