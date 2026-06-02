import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Mappa lingua → nome visualizzato ──────────────────────
export const LOCALE_LABELS: Record<string, string> = {
  it: "Italiano",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  nl: "Nederlands",
  pl: "Polski",
  ru: "Русский",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
  ar: "العربية",
  hi: "हिन्दी",
  tr: "Türkçe",
  vi: "Tiếng Việt",
  th: "ไทย",
  id: "Bahasa Indonesia",
  sv: "Svenska",
  da: "Dansk",
};

// ─── Mappa sezioni funnel ─────────────────────────────────
export const FUNNEL_SECTIONS = [
  "titolo",
  "sottotitolo",
  "problema",
  "storia",
  "recensioni",
  "cta",
] as const;

export type FunnelSection = (typeof FUNNEL_SECTIONS)[number];

export const FUNNEL_SECTION_LABELS: Record<FunnelSection, string> = {
  titolo: "Titolo",
  sottotitolo: "Sottotitolo",
  problema: "Problema",
  storia: "Storia",
  recensioni: "Recensioni",
  cta: "Call to Action",
};
