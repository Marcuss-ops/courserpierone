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
  template?: "lumio" | "h612" | "horizon" | "book-claude" | "amish" | "default";
  defaultLanguage: string;
  cover: string;
  authorImageUrl?: string;
  storyImages?: string[];
  accentColor?: string;
  checkoutUrl: string;
  author: string;
  price?: number;
  prices?: Record<string, PriceByLocale>;
  lemonVariantId?: string;
  languages: Record<string, LanguageEntry>;
  lessons: LessonConfig[];
  ebookChapters: { it: string; en: string; page: number }[];
  /** Country-specific price overrides: { "BR": { currency: "BRL", price: 9900, symbol: "R$", ... } } */
  countryOverrides?: Record<string, { currency: string; price: number; symbol?: string; lemonVariantId?: string; stripePriceId?: string }> | string;
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

/**
 * Cache in-memory per ridurre letture disco/DB durante il lifecycle
 * di una stessa richiesta. Azzerata ad ogni deploy su Vercel.
 */
const _memoryCache = new Map<string, { config: CourseConfig; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minuti

/**
 * Carica la configurazione di un corso con read-through cache.
 *
 * Strategy:
 *   1. Memory cache (per la durata della richiesta)
 *   2. File system (sviluppo locale)
 *   3. Database cache (CourseConfigCache — funziona su Vercel)
 *   4. null
 */
export async function getCourseConfig(slug: string): Promise<CourseConfig | null> {
  // 1. Memory cache (fast path)
  const cached = _memoryCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  let config: CourseConfig | null = null;

  // 2. File system (sviluppo locale)
  try {
    const configPath = path.join(process.cwd(), 'public', 'courses', slug, 'config.json');
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(fileContent) as CourseConfig;
    }
  } catch {
    // Fallback al DB
  }

  // 3. Database cache (funziona su Vercel)
  if (!config) {
    try {
      const cached = await prisma.courseConfigCache.findUnique({ where: { slug } });
      if (cached) {
        config = JSON.parse(cached.config) as CourseConfig;
      }
    } catch (error) {
      console.error(`Error reading config from DB for ${slug}:`, error);
    }
  }

  // 4. Auto-generate from DB if cache is empty (first visit after deploy)
  if (!config) {
    try {
      const { generateCourseConfig } = await import("./generate-course-config");
      config = await generateCourseConfig(slug);
    } catch {
      // Product might not exist — that's fine, return null
    }
  }

  // Popola memory cache
  if (config) {
    _memoryCache.set(slug, { config, cachedAt: Date.now() });
  }

  return config;
}


