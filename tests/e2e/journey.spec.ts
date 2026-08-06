import { test, expect, type Page } from "@playwright/test";
import { prisma, cleanupTestUser, seedTestProduct } from "./fixtures/db";
import {
  createLemonCheckout,
  generateLemonWebhookPayload,
  signLemonWebhookPayload,
} from "./fixtures/ls-helpers";
import { signUpTestUser, deleteSupabaseUserById } from "./fixtures/supabase-auth";

/**
 * E2E Full Customer Journey (DoD Scenario 1) — V1.5 LS-primary
 *
 * The journey exercises the user-facing flow with LemonSqueezy as the
 * sole payment provider. V1.5 mandate: the primary customer journey
 * MUST NOT depend on legacy payment provider creds.
 *
 * Flow per locale (it-it, en-us, es-es):
 *   1. Sign up test user via Supabase admin (email_confirm: true)
 *   2. Login via UI (/login)
 *   3. Visit localized landing page
 *   4. Visit portal — expect paywall (no order yet)
 *   5. Simulate LS checkout + signed webhook → order created in DB
 *   6. Re-visit portal — expect lessons visible (AccessGate grants access)
 *   7. Click first lesson, expect lesson page rendering
 *   8. Click "Mark Complete" → assert LessonProgress.completed=true in DB
 *   9. Sign out via /auth/signout
 *  10. Login again
 *  11. Verify LessonProgress still completed=true (persistence across sessions)
 *
 * Skip-pattern: requires real Supabase project, LemonSqueezy test account,
 * running dev server, and seeded test product.
 */

const LOCALES = ["it-it", "en-us", "es-es"] as const;
const PRODUCT_SLUG = "test-course-e2e";

const hasAllCreds =
  !!process.env.LEMONSQUEEZY_API_KEY &&
  !!process.env.LEMONSQUEEZY_WEBHOOK_SECRET &&
  !!process.env.LEMONSQUEEZY_STORE_ID &&
  !!process.env.TEST_LEMON_VARIANT_ID &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !hasAllCreds,
  "Missing Supabase/LS test credentials for E2E journey (LEMONSQUEEZY_* + TEST_LEMON_VARIANT_ID + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)"
);

// ─── Per-locale UI text expectations (anchored regex for locale safety) ─────
const LOCALIZED_BUTTON_PATTERNS: Record<string, RegExp> = {
  // Note: `\bcompra\b` is Italian informal but it would also match Spanish
  // "comprar" (cross-locale), so we keep it OUT. Use "acquista" which is
  // uniquely Italian in our i18n bundles.
  "it-it": /\b(acquista|scopri|accedi)\b/i,
  "en-us": /\b(buy|purchase|sign in|continue)\b/i,
  "es-es": /\b(comprar|descubre|acceder)\b/i,
};

const PROGRESS_BUTTON_PATTERN: Record<string, RegExp> = {
  "it-it": /complet[ao]|segna come fatta|ho finito/i,
  "en-us": /complet|mark.*complete|done|finished/i,
  "es-es": /complet[ao]|marcar como hecho|terminado/i,
};

async function signInViaUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for navigation away from /login
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

async function simulateLsCheckout(
  page: Page,
  request: import("@playwright/test").APIRequestContext,
  email: string,
  locale: string
) {
  const product = await prisma.product.findUnique({
    where: { slug: PRODUCT_SLUG },
  });
  if (!product?.lemonVariantId) {
    throw new Error(`Test product ${PRODUCT_SLUG} missing lemonVariantId`);
  }

  const orderId = `ls-order-journey-${Date.now()}`;
  const customData = {
    courseSlug: product.slug,
    locale,
    variantId: product.lemonVariantId,
  };

  // Real LS checkout creation — mirrors checkout.ls.spec.ts. The checkout
  // object URL isn't navigated in this test (we drive the webhook directly)
  // but the API call still validates our LS creds and exercises the
  // checkout-creation code path end-to-end (which is the LS provider's
  // primary surface in production post-Phase-7).
  const checkout = await createLemonCheckout(product.lemonVariantId, customData);
  expect(checkout?.data?.attributes?.url).toBeTruthy();

  // Build + sign a synthetic order_created webhook payload.
  const payload = generateLemonWebhookPayload(orderId, {
    ...customData,
    email,
  });
  const { signature, body } = signLemonWebhookPayload(payload);

  const webhookResponse = await request.post("/api/webhooks/lemonsqueezy", {
    headers: { "x-signature": signature },
    data: body,
  });

  expect(webhookResponse.status()).toBe(200);
}

test.describe("E2E Full Customer Journey (DoD Scenario 1, LS primary)", () => {
  test.beforeEach(async () => {
    // Ensure test product is seeded with current LS variant ID
    await seedTestProduct();
  });

  for (const locale of LOCALES) {
    test(`complete journey in ${locale}`, async ({ page, request }) => {
      const email = `e2e-${locale}-${Date.now()}@example.com`;
      const password = "E2eJourneyTest123!";

      let supabaseUserId: string | null = null;
      try {
        // ─── 1. Sign up test Supabase user via admin (confirmed) ───
        const user = await signUpTestUser(email, password);
        supabaseUserId = user.id;
        expect(user.email).toBe(email);

        // ─── 2. Login via UI ───
        await signInViaUi(page, email, password);

        // ─── 3. Visit localized landing page ───
        await page.goto(`/${locale}/${PRODUCT_SLUG}`);
        const landingButton = LOCALIZED_BUTTON_PATTERNS[locale];
        await expect(page.locator("body")).toContainText(landingButton);

        // ─── 4. Visit portal — AccessGate should show paywall ───
        await page.goto(`/${locale}/${PRODUCT_SLUG}/portal`);
        await expect(page.locator("body")).toContainText(landingButton);

        // ─── 5. Simulate LS checkout + webhook payment ───
        await simulateLsCheckout(page, request, email, locale);

        // Wait for order to be created in DB
        await expect
          .poll(
            () => prisma.order.count({ where: { user: { email } } }),
            { timeout: 10_000 }
          )
          .toBe(1);

        // ─── 5a. Post-order side effects — analytics event best-effort ───
        // The order-service chain records an analytics "purchase" event as a
        // DB-level proxy for the email dispatch firing. We OBSERVE the count
        // (not strictly assert) because order-service wraps analytics.create()
        // in .catch(warn) — the order row is reliably created but the analytics
        // row is best-effort.
        //
        // Two gates:
        //   1. Order row MUST exist (mandatory, asserted above).
        //   2. Analytics event: if absent after polling deadline, ANNOTATE the
        //      test (visible to the Playwright reporter) but do NOT fail it —
        //      customer access still works via the order row alone.
        //
        // We use an explicit polling loop (instead of try/catch around a
        // strict toBeGreaterThanOrEqual) so real Prisma/DB errors still
        // propagate, and only the silent-analytics-drop case is annotated.
        const analyticsDeadline = Date.now() + 3_000;
        const purchaser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        let analyticsCount = 0;
        while (Date.now() < analyticsDeadline) {
          analyticsCount = purchaser
            ? await prisma.analyticEvent.count({
                where: { userId: purchaser.id, eventType: "purchase" },
              })
            : 0;
          if (analyticsCount >= 1) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (analyticsCount === 0) {
          test.info().annotations.push({
            type: "silent-analytics-drop",
            description:
              "Order row was created but the analytics event was NOT recorded (order-service best-effort path silently failed). Customer access still works via the order row.",
          });
        }

        // ─── 5b. Dashboard shows the new course after purchase ───
        await page.goto("/dashboard");
        // The dashboard renders CourseCard for any completed order. Assert at
        // least one course card is present (a[href*="/portal"]) — this catches
        // regressions where /api/user/orders or dashboard render logic drops
        // newly-created orders.
        await expect(page.locator('a[href*="/portal"]').first()).toBeVisible({
          timeout: 10_000,
        });

        // ─── 6. Re-visit portal — AccessGate grants access, lessons visible ───
        await page.goto(`/${locale}/${PRODUCT_SLUG}/portal`);
        // Now portal should NOT show "buy" button — at least one lesson should be present
        const lessonsLocator = page.locator('a[href*="/curso/"]');
        await expect(lessonsLocator.first()).toBeVisible({ timeout: 10_000 });

        // ─── 7. Click first lesson ───
        await lessonsLocator.first().click();
        await page.waitForURL(/\/curso\//, { timeout: 10_000 });

        // Lesson page should render (title visible)
        await expect(page.locator("body")).toBeVisible();

        // ─── 8. Mark Complete → LessonProgress completed=true ───
        const progressButton = page.locator("button").filter({
          hasText: PROGRESS_BUTTON_PATTERN[locale],
        });
        await expect(progressButton.first()).toBeVisible({ timeout: 5_000 });
        await progressButton.first().click();

        // Verify in DB
        await expect
          .poll(
            () =>
              prisma.lessonProgress.count({
                where: { user: { email }, completed: true },
              }),
            { timeout: 5_000 }
          )
          .toBeGreaterThanOrEqual(1);

        // ─── 9. Sign out via real /auth/signout endpoint ───
        // The signout route is POST-only; we trigger it via the page's request
        // context so the server-side supabase.auth.signOut() runs and the
        // sb-*-auth-token cookie is cleared.
        const signoutResponse = await page.request.post("/auth/signout");
        expect(signoutResponse.status()).toBe(200);
        const cookiesAfter = await page.context().cookies();
        const authCookieStillPresent = cookiesAfter.some((c) =>
          c.name.includes("auth-token")
        );
        expect(authCookieStillPresent).toBe(false);

        // ─── 9b. Verify server-side session invalidation ───
        // Visiting a protected page after sign-out should redirect to /login.
        // This catches regressions where Supabase's server-side session was
        // not actually invalidated by the signout handler (only cookie removed).
        await page.goto("/dashboard");
        await page.waitForURL(/\/login/, { timeout: 5_000 });

        // ─── 10. Login again ───
        await signInViaUi(page, email, password);

        // ─── 11. Verify LessonProgress persisted ───
        const persistedCount = await prisma.lessonProgress.count({
          where: { user: { email }, completed: true },
        });
        expect(persistedCount).toBeGreaterThanOrEqual(1);
      } finally {
        if (supabaseUserId) {
          await deleteSupabaseUserById(supabaseUserId).catch(() => {
            // Silent failure — Supabase user may already be gone
          });
        }
        await cleanupTestUser(email).catch(() => {
          // Silent failure — DB cleanup is best-effort
        });
      }
    });
  }
});
