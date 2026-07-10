// ─── Shared types for H612 template sections ──────────────

export interface H612Props {
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
    localeContent?: H612LocaleContent;
  };
  locale?: string;
  productId?: string;
  productSlug?: string;
  checkoutUrl?: string;
}

export interface H612LocaleContent {
  nav?: {
    brand?: string;
    features?: string;
    pricing?: string;
    get_started?: string;
    learn_more?: string;
  };
  hero?: {
    badge?: string;
    cta?: string;
    secondary_cta?: string;
    price_label?: string;
  };
  problem?: { badge?: string };
  story?: { badge?: string };
  lessons?: { badge?: string; title?: string };
  testimonials?: {
    badge?: string;
    items?: { name?: string; role?: string }[];
  };
  offer?: { one_time?: string };
  footer?: {
    rights_reserved?: string;
    privacy?: string;
    terms?: string;
    contact?: string;
  };
  course?: { now_playing?: string; module_label?: string };
  trust?: { title?: string; company_names?: string[] };
  ui?: { labels?: Record<string, string> };
}

export type H612T = (key: string, fallback: string) => string;
