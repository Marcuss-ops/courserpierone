import { z } from "zod";
import type { CourseTemplateId } from "@/lib/courses/templates";

const courseTemplateIds = ["lumio", "h612", "horizon", "default"] as const satisfies readonly CourseTemplateId[];

export const courseTemplateIdSchema = z.enum(courseTemplateIds);

const languageEntrySchema = z
  .object({
    title: z.string(),
    problem: z.string(),
    story: z.string(),
    cta: z.string(),
    description: z.string(),
    ebookTitle: z.string(),
    ebookContent: z.string(),
    seo: z
      .object({
        title: z.string(),
        description: z.string(),
        ogImage: z.string().optional(),
      })
      .optional(),
    ui: z
      .object({
        labels: z.record(z.string(), z.string()),
        benefits: z.array(z.object({ title: z.string(), desc: z.string() })),
        faq: z.array(z.object({ q: z.string(), a: z.string() })),
      })
      .optional(),
  })
  .passthrough();

const lessonConfigSchema = z
  .object({
    number: z.number().int().nonnegative(),
    id: z.string().min(1),
    titles: z.record(z.string(), z.string()),
    descriptions: z.record(z.string(), z.string()),
    videos: z.record(z.string(), z.string()),
    duration: z.string(),
  })
  .passthrough();

const priceByLocaleSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().min(1),
  symbol: z.string().min(1),
});

const countryOverrideSchema = z.object({
  currency: z.string().length(3),
  price: z.number().int().nonnegative(),
  symbol: z.string().optional(),
  lemonVariantId: z.string().nullable().optional(),
});

/** Canonical runtime shape for courses/<slug>/config.json and DB cache JSON. */
export const courseConfigSchema = z
  .object({
    slug: z.string().min(1),
    productId: z.string().min(1).optional(),
    template: courseTemplateIdSchema.optional(),
    defaultLanguage: z.string().min(1),
    cover: z.string().min(1),
    authorImageUrl: z.string().optional(),
    storyImages: z.array(z.string()).optional(),
    accentColor: z.string().optional(),
    checkoutUrl: z.string().min(1),
    author: z.string().min(1),
    price: z.number().nonnegative().optional(),
    prices: z.record(z.string(), priceByLocaleSchema).optional(),
    lemonVariantId: z.string().optional(),
    languages: z.record(z.string(), languageEntrySchema),
    lessons: z.array(lessonConfigSchema),
    ebookChapters: z.array(
      z
        .object({ page: z.number().int().nonnegative() })
        .catchall(z.union([z.string(), z.number()])),
    ),
    countryOverrides: z.union([
      z.record(z.string(), countryOverrideSchema),
      z.string(),
    ]).optional(),
  })
  .passthrough();

export type CourseConfig = z.infer<typeof courseConfigSchema>;
export type LanguageEntry = CourseConfig["languages"][string];
export type LessonConfig = CourseConfig["lessons"][number];
export type PriceByLocale = NonNullable<CourseConfig["prices"]>[string];

/** Parse unknown JSON at a source boundary and throw a useful Zod error. */
export function parseCourseConfig(value: unknown): CourseConfig {
  return courseConfigSchema.parse(value);
}

/** Parse a complete JSON document without throwing, for fallback loaders. */
export function safeParseCourseConfig(value: unknown) {
  return courseConfigSchema.safeParse(value);
}

/** Used only for legacy metadata overlays before the final config is built. */
export const courseConfigOverridesSchema = courseConfigSchema.partial();
export type CourseConfigOverrides = z.infer<typeof courseConfigOverridesSchema>;
