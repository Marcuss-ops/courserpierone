#!/usr/bin/env node
/**
 * Audit: Course plugin drift gate.
 *
 * Cross-checks 3 sources of truth for the course plugin architecture
 * (per ADR-0011 + smoke-test proof):
 *   1. `courses.config.ts` `BUNDLED_COURSES[]` — registry source-of-truth
 *      (post-Phase 3 split: user-published entries are excluded from
 *      these drift checks since they live ONLY in `Product`, not in
 *      this registry's plugin folder layout).
 *   2. `courses/<slug>/` folders on disk — plugin data layout
 *   3. Postgres `Product` rows — runtime access/orders metadata
 *
 * Hard errors (exit 1) on any of these for BUNDLED courses:
 *   (a) Slug in BUNDLED_COURSES[] but `courses/<slug>/` folder missing on disk.
 *   (b) Folder `courses/<slug>/` exists on disk but slug NOT in
 *       BUNDLED_COURSES[] (NB: user-published entries are intentionally
 *       NOT in BUNDLED_COURSES[], but their `courses/<slug>/` folder,
 *       if any, is treated as an orphan unless they're listed there).
 *   (c) CourseMeta with `templateId !== 'default'` but
 *       `courses/<slug>/components/` folder missing on disk.
 *   (d) Slug in BUNDLED_COURSES[] with status='active' but missing
 *       Product row in DB.
 *
 * Soft warning (no exit) when:
 *   - DATABASE_URL / DIRECT_URL not set in env (offline CI scenario).
 *     Drift check (d) is skipped, but filesystem drifts (a)(b)(c) still fail.
 *   - Prisma query fails (network/DB down) — drift check (d) is skipped.
 *
 * User-published entries (declared in COURSES[] with
 * `kind: "user-published"`): reported in the audit header so operators
 * know they exist, but they are NOT subject to the bundled-only drift
 * checks (they live only in DB; their folder layout, if any, is
 * incidental).
 *
 * Wired into `npm run check` after typecheck, before lint/test. Standalone
 * invocation: `npx tsx scripts/audit-courses-drift.ts` (or `npm run audit:courses-drift`).
 */

import { existsSync, readdirSync, statSync } from "fs";
import { resolve } from "path";
import process from "process";
import type { CourseTemplateId } from "../src/lib/courses/templates";

// ─── Step 1: load registry via tsx ───────────────────────────────
async function loadRegistry(): Promise<{ bundled: unknown[]; all: unknown[] }> {
  // courses.config.ts lives at project root. This script is at scripts/
  // (one level below root), so the import path is `../courses.config`.
  // The `tsx` runtime transparently loads TypeScript imports.
  const mod = await import("../courses.config");
  return {
    bundled: mod.BUNDLED_COURSES,
    all: mod.COURSES,
  };
}

// ─── Step 2: scan courses/<slug>/config.json files on disk ─────────
function scanCoursesDir(root: string): string[] {
  const out: string[] = [];
  try {
    const entries = readdirSync(root);
    for (const name of entries) {
      const full = resolve(root, name);
      // A course is recognized by the presence of either config.json OR
      // a locales/ folder (in case config.json was not generated yet).
      // Either is enough to consider the course "on disk".
      const hasConfigJson = existsSync(resolve(full, "config.json"));
      const hasLocales = existsSync(resolve(full, "locales"));
      if (statSync(full).isDirectory() && (hasConfigJson || hasLocales)) {
        out.push(name);
      }
    }
  } catch {
    /* directory missing → empty list (registry↔disk check will fail loudly) */
  }
  return out;
}

interface CourseMeta {
  slug: string;
  status: "active" | "draft" | "archived";
  templateId: CourseTemplateId;
  kind?: "bundled" | "user-published";
  [k: string]: unknown;
}

async function main() {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Load registry ─────────────────────────────────────────
  let registry: { bundled: CourseMeta[]; all: CourseMeta[] };
  try {
    registry = await loadRegistry();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`❌ Cannot load courses.config.ts: ${msg}`);
    console.error(`   Run this script via 'npx tsx scripts/audit-courses-drift.ts' or 'npm run audit:courses-drift'.`);
    process.exit(2);
  }

  const COURSES_DIR = resolve(__dirname, "..", "courses");
  const BUNDLED_COURSES = registry.bundled;
  const ALL_COURSES = registry.all;

  const registeredBundledSlugs = new Set(BUNDLED_COURSES.map((c) => c.slug));
  const userPublishedCount = ALL_COURSES.length - BUNDLED_COURSES.length;
  const onDiskSlugs = new Set(scanCoursesDir(COURSES_DIR));

  console.log(`\n🔍 Course plugin drift audit (ADR-0011 + Phase 3 split)\n`);
  console.log(`   Bundled courses in registry: ${BUNDLED_COURSES.length}`);
  for (const c of BUNDLED_COURSES) {
    console.log(`     • ${c.slug.padEnd(20)} [status=${c.status}, template=${c.templateId}]`);
  }
  if (userPublishedCount > 0) {
    console.log(
      `\n   User-published entries (skipped from bundled drift checks): ${userPublishedCount}`,
    );
    for (const c of ALL_COURSES) {
      if (c.kind === "user-published") {
        console.log(`     • ${c.slug.padEnd(20)} (creator-driven; not bundled)`);
      }
    }
  }
  console.log(`\n   courses/ folders on disk: ${onDiskSlugs.size}`);
  for (const s of onDiskSlugs) console.log(`     • ${s}`);
  console.log();

  // ── Drift (a): slug registered but folder missing ──────────
  // BUNDLED only — user-published entries do not require a
  // courses/<slug>/ folder (they live only in DB).
  for (const course of BUNDLED_COURSES) {
    if (!onDiskSlugs.has(course.slug)) {
      errors.push(
        `❌ (a) Slug "${course.slug}" is bundled in COURSES[] but the folder courses/${course.slug}/ is missing on disk.\n` +
          `      Action: create the folder (with locales/<code>.json + config.json) OR remove the registry entry.\n`,
      );
    }
  }

  // ── Drift (b): folder on disk but slug not registered ──────
  // A folder is "orphan" if it's neither bundled nor user-published.
  // For user-published entries, the folder is allowed (declared
  // intent) but the script still flags the slug if it doesn't appear
  // in COURSES[] at all — that's the actual orphan case.
  for (const folderSlug of onDiskSlugs) {
    if (!registeredBundledSlugs.has(folderSlug)) {
      const isUserPublished = ALL_COURSES.some(
        (c) => c.slug === folderSlug && c.kind === "user-published",
      );
      if (!isUserPublished) {
        errors.push(
          `❌ (b) Folder courses/${folderSlug}/ exists on disk but the slug is NOT in COURSES[] (neither bundled nor user-published).\n` +
            `      Action: add a CourseMeta entry to courses.config.ts OR remove the orphan folder.\n`,
        );
      }
    }
  }

  // ── Drift (c): non-default templateId requires components/ ──
  // BUNDLED only — user-published courses intentionally skip this
  // check (they use the standard funnel template shipped in the
  // deployment; `templateId` is metadata, not an in-repo layout).
  for (const course of BUNDLED_COURSES) {
    if (course.templateId !== "default") {
      const componentsDir = resolve(COURSES_DIR, course.slug, "components");
      if (!existsSync(componentsDir)) {
        errors.push(
          `❌ (c) Bundled course "${course.slug}" has templateId="${course.templateId}" but courses/${course.slug}/components/ is missing.\n` +
            `      Action: add a components/ folder OR change templateId to "default" (uses inline-JSX fallback).\n`,
        );
      }
    }
  }

  // ── Drift (d): registry ↔ DB Product rows ──────────────────
  // Skip in offline CI (no DATABASE_URL); warn instead of fail.
  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!dbUrl) {
    warnings.push(
      `⚠️ (d) Drift check skipped — DATABASE_URL / DIRECT_URL not set in env.\n` +
        `      Run from a shell that has sourced .env (or set env vars) to enable Product-row verification.\n`,
    );
  } else {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      try {
        for (const course of BUNDLED_COURSES) {
          // Skip drafts/archived: they intentionally lack Product rows
          // (no public traffic, no order tracking).
          if (course.status !== "active") continue;
          const product = await prisma.product.findUnique({
            where: { slug: course.slug },
            select: { id: true },
          });
          if (!product) {
            errors.push(
              `❌ (d) Slug "${course.slug}" is bundled in COURSES[] with status="active" but the Product row is missing in DB.\n` +
                `      Action: run \`npx tsx scripts/products/sync-local-config.ts ${course.slug}\` to upsert.\n`,
            );
          }
        }
      } finally {
        await prisma.$disconnect();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(
        `⚠️ (d) Drift check skipped — Prisma query failed: ${msg}\n` +
          `      Action: verify DATABASE_URL / DIRECT_URL reach a Supabase session-mode connection.\n`,
      );
    }
  }

  // ── Report ───────────────────────────────────────────────
  if (errors.length === 0) {
    console.log(`✅ No drift detected. Course plugin architecture is intact.\n`);
    if (warnings.length > 0) {
      console.log(`\n   (non-fatal warnings:)`);
      warnings.forEach((w) => console.log(`     ${w}`));
      console.log();
    }
    process.exit(0);
  }

  console.log(`❌ Drift detected: ${errors.length} hard error(s)\n`);
  for (const e of errors) console.log(`   ${e}`);
  if (warnings.length > 0) {
    console.log(`\n   (non-fatal warnings):`);
    warnings.forEach((w) => console.log(`     ${w}`));
    console.log();
  }
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error(
    "❌ audit-courses-drift.ts failed unexpectedly:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(2);
});
