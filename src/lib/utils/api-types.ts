/** Product from GET /api/products list endpoint */
export interface ProductApiItem {
  id: string;
  slug: string;
  price: number;
  currency: string;
  pricesByCurrency: string | null;
  status: string;
  coverUrl: string | null;
  templateId: string;
  lessonsCount: number;
  locales: string[];
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
  pricesByCurrency: string | null;
  countryOverrides: string | null;
  createdAt: string;
  translations: ProductApiTranslation[];
  lessons: ProductApiLesson[];
}

/** Response from POST /api/translate */
export interface TranslateApiResponse {
  success?: boolean;
  translations?: Record<string, Record<string, string>>;
}
