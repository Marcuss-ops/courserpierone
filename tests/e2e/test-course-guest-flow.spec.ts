import { test, expect, type Page } from "@playwright/test";
import { prisma } from "./fixtures/db";

/**
 * E2E Guest Free-Course Flow — V1.x post-FREE_COURSE_SLUGS bypass
 *
 * Validates that an unauthenticated visitor can walk the full
 * free-course path without ever hitting a login redirect or paywall:
 *
 *   1. Open the free test course landing page (/<locale>/test-course-e2e)
 *   2. Click the "Enter the Course" CTA → /portal
 *   3. Click lesson 1 → /curso/<lessonId>
 *   4. Verify the YouTube iframe is present in the DOM
 *   5. Navigate to /ebook (eBook reader iframe)
 *   6. Navigate to /download (download page)
 *   7. Verify the PDF download URL returns HTTP 200 + application/pdf
 *
 * Setup requirements (idempotent — runs in beforeEach):
 *   - Product with slug="test-course-e2e", price=0, status=published
 *   - Lesson with id="test-course-e2e-lesson-1" + LessonTranslation(en)
 *   - ProductTranslation(en, cta="Enter the Course")
 *   - NEXT_PUBLIC_FREE_COURSE_SLUGS env var must include "test-course-e2e"
 *
 * This test does NOT require Supabase or LemonSqueezy credentials — it
 * exercises the free-course bypass end-to-end. It's the V1.x smoke test
 * for the open-access path that powers both staging demos and the
 * pre-flight sanity check before the LS checkout flow is enabled.
 */
const SLUG = "test-course-e2e";
const LESSON_ID = `${SLUG}-lesson-1`;
const LOCALE = "en-us";

// Skip if the dev server isn't configured for free course bypass.
// The env var is the SSOT for "open-access" courses; without it the
// middleware + AccessGate would redirect to /login and the test
// would false-pass on /login text matches.
const freeSlugs = (process.env.NEXT_PUBLIC_FREE_COURSE_SLUGS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const freeCourseBypassEnabled = freeSlugs.includes(SLUG);

test.skip(
  !freeCourseBypassEnabled,
  `Set NEXT_PUBLIC_FREE_COURSE_SLUGS to include "${SLUG}" to run this test (current: "${process.env.NEXT_PUBLIC_FREE_COURSE_SLUGS ?? ""}")`
);

/**
 * Idempotent seed for the free test course. Mirrors scripts/test-course-setup.ts
 * but is self-contained so the test doesn't depend on that script being run
 * first. Safe to call on every beforeEach — all operations are upserts.
 */
async function seedFreeTestCourse() {
  // 1. Find or create the admin user (Product.creatorId is required + FK Restrict).
  const admin =
    (await prisma.user.findFirst({
      where: { role: "admin" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })) ??
    (await prisma.user.create({
      data: {
        email: "e2e-free-course-admin@example.com",
        role: "admin",
        name: "E2E Free Course Admin",
      },
      select: { id: true },
    }));

  // 2. Upsert the product with price=0 (required for isFreeCourse defense-in-depth).
  const product = await prisma.product.upsert({
    where: { slug: SLUG },
    update: {
      price: 0,
      status: "published",
      defaultLanguage: "en",
      templateId: "default",
    },
    create: {
      slug: SLUG,
      price: 0,
      status: "published",
      defaultLanguage: "en",
      templateId: "default",
      currency: "eur",
      creatorId: admin.id,
    },
  });

  // 3. Upsert the CTA translation (rendered as a link/button on the landing).
  await prisma.productTranslation.upsert({
    where: {
      productId_locale_section: {
        productId: product.id,
        locale: "en",
        section: "cta",
      },
    },
    update: { content: "Enter the Course" },
    create: {
      productId: product.id,
      locale: "en",
      section: "cta",
      content: "Enter the Course",
    },
  });

  // 4. Upsert the lesson + translation (YouTube embed URL — works without auth).
  const lesson = await prisma.lesson.upsert({
    where: { id: LESSON_ID },
    update: { productId: product.id, position: 1 },
    create: { id: LESSON_ID, productId: product.id, position: 1 },
  });

  // Seed the lesson translation in BOTH "en" and "en-us" — the funnel
  // pages normalize the locale, but seeding both makes the test resilient
  // to any future change in the locale resolver. Mirrors the journey
  // test pattern (tests/e2e/journey.spec.ts).
  for (const locale of ["en", "en-us"]) {
    await prisma.lessonTranslation.upsert({
      where: { lessonId_locale: { lessonId: lesson.id, locale } },
      update: {
        title: "Welcome to the Test Course",
        description: "This is the first lesson. Explore the platform here.",
        videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      },
      create: {
        lessonId: lesson.id,
        locale,
        title: "Welcome to the Test Course",
        description: "This is the first lesson. Explore the platform here.",
        videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      },
    });
  }
}

test.describe("Guest free-course flow (no auth)", () => {
  test.beforeEach(async () => {
    await seedFreeTestCourse();
  });

  test("guest walks landing → portal → lesson → ebook → download", async ({
    page,
    request,
  }) => {
    // ─── 1. Open the landing page ──────────────────────────────
    await page.goto(`/${LOCALE}/${SLUG}`);
    // The funnel page must render with the "Enter the Course" CTA.
    // We assert the body contains the CTA text + the course title,
    // which catches regressions where the funnel template fails to
    // resolve the slug (e.g. CourseConfigCache stale entry).
    await expect(page.locator("body")).toContainText(/enter the course/i);
    await expect(page.locator("body")).toContainText(/test course e2e/i);

    // ─── 2. Click the CTA → /portal ────────────────────────────
    // The CTA is rendered as either a <button> or an <a> depending on
    // the funnel template. We use a broad text-based selector that
    // works for both.
    const ctaLink = page
      .locator("a, button")
      .filter({ hasText: /enter the course/i })
      .first();
    await expect(ctaLink).toBeVisible({ timeout: 10_000 });
    await ctaLink.click();
    await page.waitForURL(/\/portal/, { timeout: 10_000 });
    // Portal renders at least one lesson link (a[href*="/curso/"]).
    // For free courses, the AccessGate renders the children directly
    // (no paywall), so lessons are visible to the guest.
    const lessonLink = page.locator('a[href*="/curso/"]').first();
    await expect(lessonLink).toBeVisible({ timeout: 10_000 });

    // ─── 3. Open lesson 1 ─────────────────────────────────────
    await lessonLink.click();
    await page.waitForURL(/\/curso\//, { timeout: 10_000 });

    // ─── 4. Verify the YouTube iframe is in the DOM ────────────
    // The VideoPaywall component (free course branch) sets hasAccess=true
    // and fetches the signed URL via /api/videos/stream. Once the URL is
    // returned, PremiumVideoPlayer renders the iframe with the YouTube
    // embed src. We assert the iframe is present AND has a YouTube src —
    // the latter catches regressions where the videos stream API loses
    // the FREE_COURSE_SLUGS bypass and returns 401.
    const youtubeIframe = page.locator('iframe[src*="youtube.com"]');
    await expect(youtubeIframe.first()).toBeVisible({ timeout: 15_000 });

    // ─── 5. Navigate to /ebook ─────────────────────────────────
    await page.goto(`/${LOCALE}/${SLUG}/ebook`);
    // The eBook reader renders the PDF in an iframe (viewerUrl from the
    // API endpoint or static file). We assert an iframe is present —
    // its src will be the /api/ebook/.../download?disposition=inline URL
    // since the test course has no static PDFs in public/courses/.
    const ebookIframe = page.locator("iframe");
    await expect(ebookIframe.first()).toBeVisible({ timeout: 10_000 });

    // ─── 6. Navigate to /download ──────────────────────────────
    await page.goto(`/${LOCALE}/${SLUG}/download`);
    const downloadLink = page
      .locator('a[href*="/api/ebook/"][href*="disposition=attachment"]')
      .first();
    await expect(downloadLink).toBeVisible({ timeout: 10_000 });

    // ─── 7. Verify the PDF is actually downloadable ────────────
    // The download link points to the /api/ebook/[slug]/download endpoint
    // which (post-fix) honors the FREE_COURSE_SLUGS bypass and returns
    // 200 + application/pdf for unauthenticated guests.
    const href = await downloadLink.getAttribute("href");
    expect(href).toBeTruthy();
    const response = await request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    // Sanity check: PDF body starts with %PDF magic number.
    const body = await response.body();
    expect(body.slice(0, 4).toString()).toBe("%PDF");
  });
});
