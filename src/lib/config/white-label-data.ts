import fs from 'fs';
import path from 'path';
import { prisma } from "../db/prisma";

export interface LessonConfig {
  number: number;
  id: string;
  titles: Record<string, string>;
  descriptions: Record<string, string>;
  videos: Record<string, string>;
  duration: string;
}

export interface PriceByLocale {
  amount: number;
  currency: string;
  symbol: string;
}

export interface CourseConfig {
  slug: string;
  productId?: string;
  template?: "lumio" | "h612" | "horizon" | "book-claude" | "default";
  defaultLanguage: string;
  cover: string;
  checkoutUrl: string;
  author: string;
  price?: number;
  prices?: Record<string, PriceByLocale>;
  lemonVariantId?: string;
  languages: Record<string, LanguageEntry>;
  lessons: LessonConfig[];
  ebookChapters: { it: string; en: string; page: number }[];
}

export interface LanguageEntry {
  title: string;
  problem: string;
  story: string;
  cta: string;
  description: string;
  ebookTitle: string;
  ebookContent: string;
  /** SEO metadata per questa lingua */
  seo?: {
    title: string;
    description: string;
    ogImage?: string;
  };
  /** Traduzioni UI (labels, benefits, faq) */
  ui?: {
    labels: Record<string, string>;
    benefits: { title: string; desc: string }[];
    faq: { q: string; a: string }[];
  };
}

export async function getCourseConfig(slug: string): Promise<CourseConfig | null> {
  // Prova prima da disco (sviluppo locale)
  try {
    const configPath = path.join(process.cwd(), 'public', 'courses', slug, 'config.json');
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(fileContent) as CourseConfig;
    }
  } catch {
    // Fallback al DB
  }

  // Fallback: leggi da DB (funziona su Vercel)
  try {
    const cached = await prisma.courseConfigCache.findUnique({ where: { slug } });
    if (cached) {
      return JSON.parse(cached.config) as CourseConfig;
    }
  } catch (error) {
    console.error(`Error reading config from DB for ${slug}:`, error);
  }

  return null;
}
