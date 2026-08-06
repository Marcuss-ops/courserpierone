import fs from "fs";
import path from "path";
import { prisma } from "../db/prisma";
import { cacheGet, cacheSet } from "../redis";
import { safeParseCourseConfig, type CourseConfig } from "./course-config-schema";

export type { CourseConfig, LanguageEntry, LessonConfig, PriceByLocale } from "./course-config-schema";

const _memoryCache = new Map<string, { config: CourseConfig; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function parseConfigAtBoundary(value: unknown, source: string): CourseConfig | null {
  const parsed = safeParseCourseConfig(value);
  if (!parsed.success) {
    console.error(`Invalid course config from ${source}:`, parsed.error.issues);
    return null;
  }
  return parsed.data;
}

/** Load a course config from Redis, disk, DB cache, or generated DB content. */
export async function getCourseConfig(slug: string): Promise<CourseConfig | null> {
  const ensureSlug = (config: CourseConfig | null, source: string): CourseConfig | null => {
    if (config && config.slug !== slug) {
      console.error(`Course config slug mismatch from ${source}: expected ${slug}, got ${config.slug}`);
      return null;
    }
    return config;
  };
  const redisKey = `config:${slug}`;
  const redisCached = await cacheGet<unknown>(redisKey);
  if (redisCached) {
    const config = parseConfigAtBoundary(redisCached, `Redis:${slug}`);
    if (config) return ensureSlug(config, `Redis:${slug}`);
  }

  const cached = _memoryCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.config;

  let config: CourseConfig | null = null;
  const configPath = path.join(process.cwd(), "courses", slug, "config.json");

  try {
    if (fs.existsSync(configPath)) {
      config = ensureSlug(
        parseConfigAtBoundary(
          JSON.parse(fs.readFileSync(configPath, "utf8")),
          configPath,
        ),
        configPath,
      );
    }
  } catch (error) {
    console.error(`Error reading course config ${configPath}:`, error);
  }

  if (!config) {
    try {
      const cachedRow = await prisma.courseConfigCache.findUnique({ where: { slug } });
      if (cachedRow) {
        config = ensureSlug(
          parseConfigAtBoundary(JSON.parse(cachedRow.config), `CourseConfigCache:${slug}`),
          `CourseConfigCache:${slug}`,
        );
      }
    } catch (error) {
      console.error(`Error reading config from DB for ${slug}:`, error);
    }
  }

  if (!config) {
    try {
      const { generateCourseConfig } = await import("./generate-course-config");
      const generated = await generateCourseConfig(slug);
      config = ensureSlug(parseConfigAtBoundary(generated, `generated:${slug}`), `generated:${slug}`);
    } catch {
      // Product might not exist — return null.
    }
  }

  if (config) {
    _memoryCache.set(slug, { config, cachedAt: Date.now() });
    cacheSet(redisKey, config).catch((error) => {
      console.warn(`[cache] fire-and-forget write failed for key ${redisKey}`, error);
    });
  }

  return config;
}
