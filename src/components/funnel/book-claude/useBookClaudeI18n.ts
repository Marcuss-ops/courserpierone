// ─── Book-Claude I18n helpers ───────────────────────────────

// ─── FALLBACK_LABELS ──────────────────────────────────────
export const FALLBACK_LABELS = {
  instant_access: "Instant access",
  buy_now_arrow: "Buy Now →",
  readers: "1,247+ readers",
  buy_now_dash: "Buy Now —",
  view_modules: "View Modules",
  ssl_secure: "Secure SSL payment",
  instant_download: "Instant Download",
  lifetime_access: "Lifetime Access",
  guarantee_days: "30-Day Guarantee",
  section_who: "// 01 — Who Is This For",
  is_this_for_you: "Is This Course For You?",
  perfect_for: "Perfect for you if:",
  p_struggle: "You struggle to make ends meet",
  p_cut_costs: "You want to cut costs without sacrificing quality of life",
  p_consumerism: "You're tired of consumerism and debt culture",
  p_practical: "You want practical, time-tested methods",
  p_future: "You want to build a solid financial future for your family",
  not_for: "Not for you if:",
  n_quick: "You're looking for get-rich-quick schemes",
  n_habits: "You don't want to change your spending habits",
  n_quick_fix: "You prefer quick fixes over a solid foundation",
  n_implement: "You're not willing to implement what you learn",
  n_advice: "You're looking for personalized financial advice",
  section_learn: "// 02 — What You'll Learn",
  masters_secrets: "The Amish Masters' Secrets",
  modules_desc: "8 practical modules that turn Amish wisdom into concrete actions for your daily life.",
  section_author: "// 03 — The Author",
  behind_course: "Behind This Course",
  your_name: "Alessandro Rinaldi",
  researcher_author: "Researcher · Author · Traveler",
  author_bio: "I lived 3 months in Pennsylvania, interviewed 12 Amish families, studied their economic system. No theory — only field-tested practices that I applied to transform my financial life.",
  section_content: "// 04 — Course Content",
  what_inside: "What You'll Find Inside",
  also_includes: "Also includes:",
  inc_full_ebook: "Full eBook (PDF, ePub, Kindle)",
  inc_checklist: "Printable 30-day checklist",
  inc_excel: "Amish budget Excel sheet",
  inc_shopping: "Weekly shopping list template",
  inc_lifetime: "Lifetime member area access",
  inc_updates: "Free future updates",
  section_offer: "// 05 — The Offer",
  invest_yourself: "Invest in Yourself",
  launch_offer: "Launch Offer",
  complete_package: "Complete Package",
  course_value: "Course: $97",
  bonus_value: "Bonus: $27",
  one_time: "One-time payment — no subscription",
  launch_price: "Launch price — then $37",
  inc_course_full: "Full course (value $97)",
  inc_ebook: "eBook PDF, ePub, Kindle",
  inc_checklist2: "Printable 30-day checklist",
  inc_excel2: "Amish budget Excel sheet",
  inc_access_updates: "Lifetime access + updates",
  inc_bonus_shopping: "BONUS: Weekly shopping list (value $27)",
  unlock_now: "Unlock Access Now",
  guarantee_title: "30-Day Money-Back Guarantee",
  guarantee_text: "Try it for 30 days. If you don't save at least $100, we'll refund the full amount. No questions, no hassle.",
  section_testimonials: "// 06 — Testimonials",
  reviewer: "Marco R., early readers",
  testimonial_text: "I applied the Amish budget method and in two months I cut my expenses by 35%. The 30-day checklist was the turning point. Finally a course that really works.",
  testimonial_name: "Marco R.",
  testimonial_role: "Rome — early readers",
  section_faq: "// 07 — FAQ",
  faq_title: "Frequently Asked Questions",
  offer_valid: "Offer valid this week",
  final_cta: "Start Your Journey to Financial Freedom Today",
  final_sub: "Join hundreds of people who have already transformed their relationship with money.",
  unlock_dash: "Unlock Access —",
  guarantee_badge: "30-Day Guarantee",
  instant_access_badge: "Instant Access",
  lifetime_badge: "Lifetime Updates",
  rights_reserved: "All rights reserved.",
  privacy: "Privacy",
  terms: "Terms",
  legal_note: "This is a digital informational product. Results may vary and depend on personal commitment. The Amish prices and techniques described are based on ethnographic research and may not accurately reflect the contemporary practices of all Amish communities.",
  bestseller: "Best Seller",
  story_badge: "// The True Story",
  story_title: "My Experience Among the Amish",
  story_subtitle: "Three months in Pennsylvania, twelve families interviewed, an economic system that has worked for 300 years.",
  amish_life: "Amish Life",
  caption_1: "Daily life in the Amish community: simplicity, self-sufficiency, and financial wisdom passed down through generations.",
  caption_2: "The barter and exchange system that eliminates the need for cash and builds lasting trust relationships.",
  caption_3: "The Amish household economy: how a family lives on 60% less than the national average.",
  tag_1: "Economic Anthropology",
  tag_2: "Amish Studies",
  tag_3: "Financial Consulting",
  brand_name: "Courssy",
  story_quote: "The Amish live rich and full lives while spending a fraction of what we spend. In this course, we reveal how they do it.",
} as const;

export type LabelKey = keyof typeof FALLBACK_LABELS;

// ─── t() factory ──────────────────────────────────────────
export function createBookClaudeT(
  lcLabels: Record<string, string>,
  labels: Record<string, string>,
  localizeCurrency: (val: string) => string,
) {
  return (key: LabelKey): string => {
    const val = lcLabels[key] ?? labels[key] ?? FALLBACK_LABELS[key] ?? key;
    return localizeCurrency(val);
  };
}

export function createLocalizeCurrency(
  baseAmount: number,
  currentAmount: number,
  currencySymbol: string,
  currency: string,
): (val: string) => string {
  return (val: string): string => {
    if (!val) return "";
    const ratio = baseAmount > 0 ? currentAmount / baseAmount : 1;
    return val.replace(
      /(?:[€$£¥₽]|[A-Z]{3})\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:[€$£¥₽]|[A-Z]{3})/g,
      (_match, p1, p2) => {
        const rawVal = p1 || p2;
        if (!rawVal) return _match;
        const parsedVal = parseFloat(rawVal.replace(",", "."));
        if (isNaN(parsedVal)) return _match;
        const converted = Math.round(parsedVal * ratio);
        const isSuffix = ["RUB", "₽", "PLN", "zł", "SEK", "NOK", "DKK", "kr"].includes(currency);
        return isSuffix
          ? `${converted} ${currencySymbol}`
          : `${currencySymbol}${converted}`;
      },
    );
  };
}
