// ─── Shared types for Amish template sections ─────────────

export interface AmishProps {
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
    accentColor?: string;
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
      // Optional: maps LocaleContent.testimonials.items into Unicode shape.
      // Shape mirrors what amish/index.tsx expects in the `.map()` lambda.
      testimonials?: { items?: { name?: string; role?: string; avatar?: string; text?: string }[] };
    };
  };
  locale?: string;
  productId?: string;
  productSlug?: string;
  checkoutUrl?: string;
}

export type AmishT = (key: string) => string;

export type AmishLocalizeCurrency = (val: string) => string;
