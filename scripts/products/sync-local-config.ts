/**
 * scripts/products/sync-local-config.ts
 *
 * Per ADR-0011 (course plugin decoupling): synced from courses.config.ts
 * registry + the per-course source-of-truth `courses/<slug>/config.json`.
 *
 * Behavior:
 *   - REQUIRES an explicit slug argv (no implicit amish-secrets default).
 *   - REJECTS slugs not present in `courses.config.ts` registry (sanity).
 *   - Silently skips drafts/archived (no DB write, exit 0).
 *   - Reads `courses/<slug>/config.json` (the single source-of-truth).
 *   - Upserts BOTH:
 *     • `Product` row (slug, cover, templateId, defaultLanguage, status='published')
 *     • `CourseConfigCache` row (precomputed CourseConfig JSON)
 *
 * Usage:
 *   npx tsx scripts/products/sync-local-config.ts <slug>
 *
 * Exit codes:
 *   0 = success (or silent skip on draft/archived)
 *   1 = missing/invalid argument, missing slug in registry, missing config file
 *   2 = DB write failed
 */

import { readFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { prisma } from "../../src/lib/db/prisma";
import {
  COURSES,
  findCourseMeta,
  type CourseMeta,
} from "../../courses.config";

interface ConfigShape {
  slug: string;
  author: string;
  cover?: string;
  template?: string;
  defaultLanguage?: string;
}

async function findFirstAdminId(): Promise<string | null> {
  // `Product.creatorId` is REQUIRED + ON DELETE RESTRICT per
  // prisma/schema.prisma Phase 1.2+4 hardening. We pick the first available
  // admin OR creator account to satisfy the FK on a brand-new Product row.
  const u = await prisma.user.findFirst({
    where: { OR: [{ role: "admin" }, { role: "creator" }] },
    select: { id: true },
  });
  return u?.id ?? null;
}

async function main() {
  // ─── 1. Argument validation (no implicit defaults post-ADR-0011) ───
  const slug = process.argv[2];
  if (!slug) {
    console.error(
      "❌ Usage: npx tsx scripts/products/sync-local-config.ts <slug>\n" +
        "   The slug MUST be declared in courses.config.ts (COURSES registry).\n" +
        "   Available slugs: " +
        COURSES.map((c) => c.slug).join(", "),
    );
    process.exit(1);
  }

  // ─── 2. Registry gate: refuse unknown slugs ──────────────────────
  const meta: CourseMeta | null = findCourseMeta(slug);
  if (!meta) {
    console.error(
      `❌ Slug "${slug}" is NOT in the courses.config.ts registry.\n` +
        `   Add an entry to COURSES[] first, then re-run this script.\n` +
        `   Current registered slugs: ` +
        COURSES.map((c) => c.slug).join(", "),
    );
    process.exit(1);
  }

  if (meta.status !== "active") {
    console.log(
      `⏭  Skipping "${slug}" — registered as status="${meta.status}" (only "active" is synced to DB).`,
    );
    await prisma.$disconnect();
    process.exit(0);
  }

  // ─── 3. Source-of-truth read: courses/<slug>/config.json ─────────
  const configPath = resolve(__dirname, "..", "..", "courses", slug, "config.json");
  if (!existsSync(configPath)) {
    console.error(
      `❌ Source file not found: ${configPath}\n` +
        `   Expected at courses/${slug}/config.json (per ADR-0011 source-of-truth layout).`,
    );
    process.exit(1);
  }

  console.log(
    `📖 Reading courses/${slug}/config.json (template=${meta.templateId}, status=${meta.status})...`,
  );
  let localConfig: ConfigShape;
  try {
    localConfig = JSON.parse(readFileSync(configPath, "utf-8")) as ConfigShape;
  } catch (e) {
    console.error(`❌ Failed to parse config.json:`, e);
    process.exit(1);
  }
  console.log(`   Author: ${localConfig.author}`);
  console.log(`   Template: ${localConfig.template ?? meta.templateId}`);
  console.log(`   Cover: ${localConfig.cover ?? "(none)"}`);

  // ─── 4. Upsert Product row (marketing/access metadata) ───────────
  console.log(`\n🔄 Upserting Product row for "${slug}"...`);
  try {
    const existingProduct = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, creatorId: true },
    });

    if (existingProduct) {
      // Refresh metadata only — hand off creatorId from existing row.
      await prisma.product.update({
        where: { slug },
        data: {
          coverUrl: localConfig.cover ?? null,
          templateId: localConfig.template ?? meta.templateId,
          status: "published",
          defaultLanguage: localConfig.defaultLanguage ?? "it",
        },
      });
      console.log(`   ✓ Product refreshed (id=${existingProduct.id}).`);
    } else {
      // Brand-new course: pick first admin/creator to satisfy FK.
      const creatorId = await findFirstAdminId();
      if (!creatorId) {
        console.error(
          `❌ No admin/creator user found in DB. Create one before first sync.\n` +
            `   Product.creatorId is REQUIRED (ON DELETE RESTRICT, schema.prisma).`,
        );
        process.exit(1);
      }
      const created = await prisma.product.create({
        data: {
          slug,
          coverUrl: localConfig.cover ?? null,
          templateId: localConfig.template ?? meta.templateId,
          status: "published",
          defaultLanguage: localConfig.defaultLanguage ?? "it",
          creatorId,
        },
      });
      console.log(`   ✓ Product created (id=${created.id}, creatorId=${creatorId}).`);
    }
  } catch (e) {
    console.error(`❌ Product upsert failed:`, e);
    process.exit(2);
  }

  // ─── 5. Upsert CourseConfigCache (precomputed JSON snapshot) ─────
  console.log(`🔄 Upserting CourseConfigCache row for "${slug}"...`);
  try {
    const cached = await prisma.courseConfigCache.upsert({
      where: { slug },
      update: {
        config: JSON.stringify(localConfig),
        version: { increment: 1 },
      },
      create: { slug, config: JSON.stringify(localConfig) },
    });
    console.log(`   ✓ CourseConfigCache updated. Version: ${cached.version}`);
  } catch (e) {
    console.error(`❌ CourseConfigCache upsert failed:`, e);
    process.exit(2);
  }

  console.log(
    `\n✅ Done! "${slug}" (template=${meta.templateId}) synced → Product + CourseConfigCache.`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("\n❌ Sync failed with unexpected error:", err);
  prisma.$disconnect().catch(() => {});
  process.exit(2);
});
