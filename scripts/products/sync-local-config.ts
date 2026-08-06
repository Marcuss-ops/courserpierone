/**
 * scripts/products/sync-local-config.ts
 *
 * Per ADR-0011 (course plugin decoupling): synced from courses.config.ts
 * registry + the per-course source-of-truth `courses/<slug>/config.json`.
 *
 * Post-Phase 3 split (bundled vs user-published):
 *   - This script handles BUNDLED courses only. Creator-driven products
 *     (kind === "user-published") are LOUDLY REFUSED — they live
 *     exclusively in `Product` and are surfaced via the standard
 *     Product resolvers / the studio UI publish flow.
 *   - Unknown slugs (not in `COURSES[]` at all) continue to be rejected
 *     with the same loud UX as before.
 *   - Drafts/archived continue to be silently skipped (no DB write).
 *
 * Behavior:
 *   - REQUIRES an explicit slug argv (no implicit amish-secrets default).
 *   - REJECTS slugs not present in `courses.config.ts` registry.
 *   - REJECTS slugs declared `kind: "user-published"` — explicit UX
 *     message points the operator to the studio publish flow.
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
 *   1 = missing/invalid argument, missing slug in registry, user-published slug refused
 *   2 = DB write failed
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { prisma } from "../../src/lib/db/prisma";
import {
  BUNDLED_COURSES,
  findCourseMeta,
  resolveCourseRegistration,
} from "../../src/lib/courses/registry";
import { parseCourseConfig, type CourseConfig } from "../../src/lib/config/course-config-schema";
import { syncCourseConfigRecords } from "../../src/lib/config/sync-course-config";

/**
 * Resolve the `creatorId` for a brand-new Product row.
 *
 * `Product.creatorId` is REQUIRED + ON DELETE RESTRICT per
 * `prisma/schema.prisma` Phase 1.2+4 hardening. Resolution:
 *
 *   1. Explicit `--creator <userId>` argv override (works regardless of
 *      how many admin/creator users exist).
 *   2. Otherwise AUTO: works only if exactly 1 admin/creator exists in DB.
 *      Zero → error loud (operator must bootstrap an admin first).
 *      Two+  → error loud (ambiguous ownership — silent cross-course
 *      attachment is a sharp edge on multi-admin orgs, so we surface it).
 *
 * Throws on every failure mode. Returns the resolved `userId` on success.
 */
async function resolveCreatorId(): Promise<string> {
  // 1. Explicit --creator <userId> override.
  const idx = process.argv.indexOf("--creator");
  if (idx !== -1) {
    const explicit = process.argv[idx + 1];
    if (!explicit || explicit.startsWith("--")) {
      throw new Error(
        "❌ --creator flag passed without a value. Usage: --creator <userId>",
      );
    }
    const u = await prisma.user.findUnique({
      where: { id: explicit },
      select: { id: true, role: true },
    });
    if (!u) {
      throw new Error(`❌ --creator ${explicit} user not found in DB.`);
    }
    if (u.role !== "admin" && u.role !== "creator") {
      throw new Error(
        `❌ --creator ${explicit} has role="${u.role}". Must be 'admin' or 'creator'.`,
      );
    }
    return u.id;
  }

  // 2. AUTO: exactly 1 admin/creator required.
  const admins = await prisma.user.findMany({
    where: { OR: [{ role: "admin" }, { role: "creator" }] },
    select: { id: true, role: true },
  });
  if (admins.length === 0) {
    throw new Error(
      `❌ No admin/creator user found in DB.\n` +
        `   Create one first, or pass --creator <userId> explicitly.\n` +
        `   Product.creatorId is REQUIRED (ON DELETE RESTRICT).`,
    );
  }
  if (admins.length > 1) {
    const list = admins.map((a) => `  • ${a.role}:${a.id}`).join("\n");
    throw new Error(
      `❌ ${admins.length} admin/creator users found; ambiguous ownership.\n` +
        `   Either:\n` +
        `     • Pass --creator <userId> to pick explicitly, OR\n` +
        `     • Prune admin/creator roles to exactly one user.\n` +
        `\n` +
        `   Found:\n${list}\n`,
    );
  }
  return admins[0].id;
}

async function main() {
  // Precompute bundled-slugs list once for error messages (reused in 2 branches).
  const bundledSlugsList = BUNDLED_COURSES.map((c) => c.slug).join(", ");

  // ─── 1. Argument validation (no implicit defaults post-ADR-0011) ───
  const slug = process.argv[2];
  if (!slug) {
    console.error(
      "❌ Usage: npx tsx scripts/products/sync-local-config.ts <slug>\n" +
        "   The slug MUST be declared in courses.config.ts (COURSES registry).\n" +
        `   Bundled slugs: ${bundledSlugsList}`,
    );
    process.exit(1);
  }

  // ─── 2. Registry gate: refuse unknown slugs ──────────────────────
  const registration = resolveCourseRegistration(slug);
  const meta = registration?.meta;
  if (!meta) {
    const rawMeta = findCourseMeta(slug);
    if (!rawMeta) {
      console.error(
        `❌ Slug "${slug}" is NOT in the courses.config.ts registry.\n` +
          `   Add an entry to COURSES[] first, then re-run this script.\n` +
          `   Bundled slugs: ${bundledSlugsList}`,
      );
    } else {
      console.error(
        `❌ Slug "${slug}" is declared kind="user-published" in the registry.\n` +
          `   This sync script is BUNDLED-ONLY — it does not touch creator-driven products.\n` +
          `\n` +
          `   Creator-driven products are managed exclusively in the ` +
          `Product table:\n` +
          `     • They are authored + published via the studio UI / direct DB writes.\n` +
          `     • Their data is read via src/lib/data/... resolvers (ProductDocument,\n` +
          `       resolvePublishedContent, etc.), not through this registry.\n` +
          `\n` +
          `   Action: either remove the entry from COURSES[] (let it be DB-only),\n` +
          `   or change ` +
          `kind` +
          ` to "bundled" if you DO want this script to manage it.\n`,
      );
    }
    process.exit(1);
  }

  // The resolver above intentionally returns null for both unknown and
  // user-published slugs; explicit diagnostics are handled above.

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
  let localConfig: CourseConfig;
  try {
    localConfig = parseCourseConfig(JSON.parse(readFileSync(configPath, "utf-8")));
    if (localConfig.slug !== slug) {
      throw new Error(`config.slug must equal the requested slug "${slug}"`);
    }
  } catch (e) {
    console.error(`❌ Invalid config.json:`, e);
    process.exit(1);
  }
  console.log(`   Author: ${localConfig.author}`);
  if (localConfig.template && localConfig.template !== meta.templateId) {
    console.error(
      `❌ config.template "${localConfig.template}" does not match registry templateId "${meta.templateId}".`,
    );
    process.exit(1);
  }
  console.log(`   Template: ${localConfig.template ?? meta.templateId}`);
  console.log(`   Cover: ${localConfig.cover}`);

  // ─── 4. Atomically synchronize Product + CourseConfigCache ─────────
  console.log(`\n🔄 Atomically syncing Product + CourseConfigCache for "${slug}"...`);
  try {
    const existingProduct = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, creatorId: true },
    });
    const creatorId = existingProduct?.creatorId ?? (await resolveCreatorId());
    const result = await syncCourseConfigRecords(prisma, {
      slug,
      creatorId,
      coverUrl: localConfig.cover,
      templateId: localConfig.template ?? meta.templateId,
      defaultLanguage: localConfig.defaultLanguage,
      configJson: JSON.stringify(localConfig),
    });
    console.log(`   ✓ Product ${result.createdProduct ? "created" : "refreshed"} (id=${result.productId}).`);
    console.log(`   ✓ CourseConfigCache updated. Version: ${result.cacheVersion}`);
  } catch (e) {
    console.error(`❌ Atomic Product + CourseConfigCache sync failed:`, e);
    process.exit(2);
  }

  console.log(
    `\n✅ Done! "${slug}" (template=${meta.templateId}) synced atomically → Product + CourseConfigCache.`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("\n❌ Sync failed with unexpected error:", err);
  prisma.$disconnect().catch((disconnectError) => {
    console.warn("⚠️ Failed to disconnect Prisma after sync error:", disconnectError);
  });
  process.exit(2);
});
