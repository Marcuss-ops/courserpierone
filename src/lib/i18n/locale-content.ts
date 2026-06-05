/**
 * LocaleContent — Singolo file JSON per lingua.
 *
 * Ogni prodotto/sito ha un set di file /data/{slug}/{locale}.json
 * che contengono OGNI singola stringa visibile nelle landing page.
 * ZERO hardcoded nei template.
 */

export interface LocaleContent {
  /** Codice lingua (es. "it", "en", "fr", "de") */
  locale: string;

  /** Metadati SEO */
  seo: {
    title: string;
    description: string;
    ogImage?: string;
  };

  /** Navigazione principale */
  nav: {
    brand: string;
    features: string;
    pricing: string;
    testimonials: string;
    faq: string;
    contact: string;
    get_started: string;
    learn_more: string;
    member_area: string;
    back_to_landing: string;
  };

  /** Hero section */
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    cta: string;
    secondary_cta: string;
    price_label: string;
    one_time_payment: string;
  };

  /** Sezione problema */
  problem: {
    badge: string;
    title: string;
    text: string;
  };

  /** Sezione storia */
  story: {
    badge: string;
    title: string;
    image_captions: string[];
    quote: string;
  };

  /** Sezione autore */
  author: {
    badge: string;
    title: string;
    name: string;
    role: string;
    bio: string;
    tags: string[];
  };

  /** Moduli / Benefici */
  modules: {
    badge: string;
    title: string;
    description: string;
    items: { title: string; desc: string }[];
  };

  /** Include anche (cosa include il corso) */
  includes: {
    title: string;
    items: string[];
  };

  /** Testimonianze */
  testimonials: {
    badge: string;
    title: string;
    items: {
      text: string;
      name: string;
      role: string;
    }[];
  };

  /** Offerta / Prezzo */
  offer: {
    badge: string;
    title: string;
    complete_package: string;
    course_value: string;
    bonus_value: string;
    price_text: string;
    one_time: string;
    launch_price: string;
    cta: string;
    guarantee_title: string;
    guarantee_text: string;
    includes: string[];
  };

  /** FAQ */
  faq: {
    badge: string;
    title: string;
    offer_valid: string;
    items: { q: string; a: string }[];
  };

  /** Final CTA */
  final_cta: {
    title: string;
    subtitle: string;
    badge: string;
  };

  /** Footer */
  footer: {
    rights_reserved: string;
    privacy: string;
    terms: string;
    legal_note: string;
    badges: {
      guarantee: string;
      instant_access: string;
      lifetime_updates: string;
    };
  };

  /** Trust / Social proof */
  trust: {
    title: string;
    readers_count: string;
    company_names: string[];
  };

  /** UI labels — piccole stringhe sparse */
  ui: {
    labels: Record<string, string>;
  };

  /** Sezione "Per chi è / Non per chi è" */
  audience: {
    badge: string;
    title: string;
    perfect_for: string;
    perfect_items: string[];
    not_for: string;
    not_items: string[];
  };

  /** Area corsi / lezioni */
  course: {
    back_to_course: string;
    module_label: string;
    now_playing: string;
    page_label: string;
    reading_progress: string;
    download_pdf: string;
    chapter: string;
    prev_lesson: string;
    next_lesson: string;
  };

  /** Sezione lezioni */
  lessons: {
    badge: string;
    title: string;
    items: { title: string; desc: string }[];
  };

  /** Area studente / Portal */
  portal: {
    access_badge: string;
    welcome_text: string;
    video_title: string;
    video_desc: string;
    lessons_count_label: string;
    start_label: string;
    ebook_title: string;
    ebook_desc: string;
    format_label: string;
    read_label: string;
    extra_title: string;
    extra_desc: string;
    coming_soon: string;
    onboarded_toast: string;
  };
}

/**
 * Crea un LocaleContent vuoto con placeholder, utile per inizializzare
 * un nuovo prodotto lingue e poi tradurlo.
 */
export function createEmptyLocale(locale: string, defaults?: Partial<LocaleContent>): LocaleContent {
  return {
    locale,
    seo: { title: "", description: "" },
    nav: {
      brand: "", features: "", pricing: "", testimonials: "", faq: "",
      contact: "", get_started: "", learn_more: "", member_area: "",
      back_to_landing: "",
    },
    hero: {
      badge: "", title: "", subtitle: "", cta: "", secondary_cta: "",
      price_label: "", one_time_payment: "",
    },
    problem: { badge: "", title: "", text: "" },
    story: { badge: "", title: "", image_captions: [], quote: "" },
    author: { badge: "", title: "", name: "", role: "", bio: "", tags: [] },
    modules: { badge: "", title: "", description: "", items: [] },
    includes: { title: "", items: [] },
    testimonials: { badge: "", title: "", items: [] },
    offer: {
      badge: "", title: "", complete_package: "", course_value: "",
      bonus_value: "", price_text: "", one_time: "", launch_price: "",
      cta: "", guarantee_title: "", guarantee_text: "", includes: [],
    },
    faq: { badge: "", title: "", offer_valid: "", items: [] },
    final_cta: { title: "", subtitle: "", badge: "" },
    footer: {
      rights_reserved: "", privacy: "", terms: "", legal_note: "",
      badges: { guarantee: "", instant_access: "", lifetime_updates: "" },
    },
    trust: { title: "", readers_count: "", company_names: [] },
    ui: { labels: {} },
    audience: { badge: "", title: "", perfect_for: "", perfect_items: [], not_for: "", not_items: [] },
    course: {
      back_to_course: "", module_label: "", now_playing: "",
      page_label: "", reading_progress: "", download_pdf: "", chapter: "",
      prev_lesson: "", next_lesson: "",
    },
    lessons: { badge: "", title: "", items: [] },
    portal: {
      access_badge: "", welcome_text: "",
      video_title: "", video_desc: "", lessons_count_label: "", start_label: "",
      ebook_title: "", ebook_desc: "", format_label: "", read_label: "",
      extra_title: "", extra_desc: "", coming_soon: "", onboarded_toast: "",
    },
    ...defaults,
  };
}
