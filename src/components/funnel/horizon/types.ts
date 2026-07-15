// ─── Shared types for Horizon template sections ────────────

export interface HorizonProps {
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
    localeContent?: HorizonLocaleContent;
  };
  locale?: string;
  productId?: string;
  productSlug?: string;
  checkoutUrl?: string;
}

export interface HorizonLocaleContent {
  nav?: {
    brand?: string;
    features?: string;
    pricing?: string;
    testimonials?: string;
    faq?: string;
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
  offer?: { one_time?: string; cta?: string };
  footer?: {
    rights_reserved?: string;
    privacy?: string;
    terms?: string;
    contact?: string;
  };
  faq?: {
    title?: string;
    items?: { q: string; a: string }[];
  };
  pricing?: {
    title?: string;
    free?: {
      name?: string;
      description?: string;
      features?: string[];
      cta?: string;
    };
    pro?: {
      name?: string;
      description?: string;
      features?: string[];
      cta?: string;
      badge?: string;
    };
  };
  ui?: { labels?: Record<string, string> };
}
