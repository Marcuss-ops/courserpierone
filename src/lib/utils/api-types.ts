/** Product from GET /api/products list endpoint */
export interface ProductApiItem {
  id: string;
  slug: string;
  price: number;
  currency: string;
  pricesByCurrency: Record<string, { price: number; symbol?: string; currency?: string; lemonVariantId?: string | null }> | null;
  status: string;
  coverUrl: string | null;
  templateId: string;
  lessonsCount: number;
  locales: string[];
  /** Aggregate revenue for this product (computed by /api/products). Optional
   *  because the list endpoint may omit it for products with zero sales. */
  revenue?: number;
  /** Conversion rate string (e.g. "2.4%") from /api/analytics/dashboard. */
  conversion?: string;
  createdAt: string;
}

/** Dashboard analytics from GET /api/analytics/dashboard */
export interface DashboardApiResponse {
  pageviews: number;
  clicks: number;
  purchases: number;
  totalRevenue: number;
  ctr: string;
  conversion: string;
  cr: string;
  chartData: {
    date: string;
    pageviews: number;
    clicks: number;
    purchases: number;
  }[];
}

/** Translation record from the Product model */
interface ProductApiTranslation {
  id: string;
  productId: string;
  locale: string;
  section: string;
  content: string;
}

/** Lesson from GET /api/products/[id] detail endpoint */
interface ProductApiLesson {
  id: string;
  productId: string;
  position: number;
  translations: {
    id: string;
    lessonId: string;
    locale: string;
    title: string;
    videoUrl: string | null;
    description: string | null;
  }[];
  assets: {
    id: string;
    lessonId: string;
    type: string;
    locale: string;
    fileUrl: string;
    fileName: string | null;
  }[];
}

/** Full product detail from GET /api/products/[id] */
export interface ProductApiDetail {
  id: string;
  slug: string;
  price: number;
  currency: string;
  coverUrl: string | null;
  templateId: string;
  status: string;
  lemonVariantId: string | null;
  pricesByCurrency: Record<string, { price: number; symbol?: string; currency?: string; lemonVariantId?: string | null }> | null;
  countryOverrides: Record<string, { currency: string; price: number; symbol?: string; lemonVariantId?: string | null }> | null;
  createdAt: string;
  translations: ProductApiTranslation[];
  lessons: ProductApiLesson[];
}

/** Response from POST /api/translate */
export interface TranslateApiResponse {
  success?: boolean;
  translations?: Record<string, Record<string, string>>;
}
