# Soft-Launch End-to-End Runbook (Real-Buyer Path)

> **Scope.** One-shot operator procedure to validate the **entire purchase
> funnel** against production with a **real corporate credit card**,
> across all 3 locales (`it-it`, `en-us`, `es-es`), before opening the
> platform to organic traffic. This runbook is the **DEFINITIVE go/no-go
> gate** for soft-launch.
>
> **Audience.** Two operators execute in lockstep:
> - **ops-1** (driver) — runs commands, drives the browser, fires actions.
> - **ops-2** (verifier) — observes, asserts DB/console state, signs each step.
>
> **Hard rule.** Every `REQUIRES VERIFICATION` line is a **hard stop**.
> ops-2 must confirm before ops-1 proceeds. A skipped pause point = V1
> re-run, not a soft launch.
>
> **Companion docs (link, do not duplicate):**
> - [`../v1-acceptance-test.md`](../v1-acceptance-test.md) — the 11-criterion
>   matrix this runbook exercises (criteria 1, 2, 3, 5, 6, 7, 10 covered
>   by the steps below; criteria 4, 8, 9, 11 are infra-level and have
>   their own pre-launch gates).
> - [`./lemon-squeezy-live-setup.md`](./lemon-squeezy-live-setup.md) —
>   the LS live-mode wiring (V1-V6 verticals) this runbook ASSUMES is
>   already in place. If LS live mode is not set up, STOP and run that
>   runbook first.
> - [`../production.md`](../production.md) — deploy, rollback, alert paths,
>   RBAC, on-call.
> - [`../audit-log.md`](../audit-log.md) — MCR Phase 2 backfill baseline
>   (AccessGrant dual-write is the canonical source of truth post-Phase 7).
>
> **Source-of-truth code paths (read in order when investigating a fail):**
> 1. `src/lib/commerce/payments/providers/lemonsqueezy/index.ts` — `createCheckout`
>    sets `customData: { courseSlug, locale, email?, channelId? }`.
>  2. `src/app/api/webhooks/lemonsqueezy/route.ts` — webhook handler:
>    HMAC verify → `ProcessedWebhook` reservation → webhook processor →
>    `processOrder()` for `order_created`; the order, `AccessGrant`, and four
>    durable `OutboxEvent` rows are committed atomically. `order_refunded`
>    revokes the order grant through the refund path.
> 3. `src/lib/commerce/orders/complete-order.ts` — `processOrder(...)`:
>    resolves `productSlug` → `Product.id`, writes `Order` (status='completed'),
>    creates `AccessGrant(sourceType='order', sourceId=order.id, status='active')`.
> 4. `src/lib/messaging/resolve-message-permission.ts` — DM gate:
>    uses `AccessGrant.status='active'` when `USE_ACCESS_GRANT_RESOLVER=true`,
>    else falls back to `Order.status='completed'`.

---

## §0 — TL;DR

| Field | Value |
| --- | --- |
| Estimated execution time | **45–75 min** (incl. real-card processing) |
| Cards required | 1 corporate credit card × 3 locales = **3 real charges** |
| Refunds | 3 refunds (1 per locale), each verified within ≤30s |
| Operators required | **2** (ops-1 driver, ops-2 verifier) |
| Sign-off | Both operators sign §3 sign-off block at the end |
| Pre-requisites | All 3 `❌ BLOCKER` items from `v1-acceptance-test.md` §4 resolved |
| Re-runnable | ✅ Yes — every step is idempotent (re-running converges to same end-state) |

---

## §1 — Pre-flight (T-0)

ops-1 runs, ops-2 verifies. Stop the runbook and abort if ANY box unchecked.

- [ ] **ops-1**: All 3 BLOCKER items from `v1-acceptance-test.md` §4 are closed (cross-browser Playwright config + YouTubeChannel seed + refund e2e test). Verify with: `gh pr list --state merged --label "v1-blocker"` returns ≥3 items.
- [ ] **ops-1**: LS live mode is wired per `lemon-squeezy-live-setup.md` (V1 store activation + V2 products + V3 variants + V4 webhook + V5 signing secret + V6 custom data). Verify with: `curl -sS https://<prod-domain>/api/health | jq '.ok'` returns `true` AND `psql "$DIRECT_URL" -c "SELECT count(*) FROM \"Product\" WHERE \"lemonVariantId\" IS NOT NULL;"` returns ≥1.
- [ ] **ops-1**: Vercel Production env holds: `LEMONSQUEEZY_API_KEY` (live), `LEMONSQUEEZY_STORE_ID` (live), `LEMONSQUEEZY_WEBHOOK_SECRET` (live), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALERT_WEBHOOK_URL` (test ping returns 2xx), `REDIS_URL`.
- [ ] **ops-1**: `MCR Phase 2 backfill` completed per `audit-log.md` (AccessGrant dual-write in production). Verify with: `psql "$DIRECT_URL" -c "SELECT count(*) FROM \"AccessGrant\" WHERE status='active';"` returns a non-zero count.
- [ ] **ops-1**: `npm run test:e2e` is green on `main` HEAD (the existing journey test, NOT the soft-launch runbook). Verify with: `gh run list --workflow=ci.yml --limit 1` shows ✅ on the latest main commit.
- [ ] **ops-2**: ALERT_WEBHOOK_URL is receiving real-time alerts (verify by pinging it once and asserting 2xx). Open the channel and confirm it's not stale (>24h silence = no recent firings).
- [ ] **ops-2**: Three locale landing pages load: visit `https://<prod-domain>/it-it/amish-secrets`, `/en-us/amish-secrets`, `/es-es/amish-secrets` in incognito Chrome. Each shows the product hero + CTA.
- [ ] **ops-1 + ops-2**: 3 real test cards available (one per locale). Document card BIN ranges (first 6 digits) in §3 sign-off (helps LS-fraud-rules anti-flag).
- [ ] **ops-1**: `USE_ACCESS_GRANT_RESOLVER` env value verified — assert `echo "$USE_ACCESS_GRANT_RESOLVER"` is `true` OR `false` (whichever the current production state is). This affects Step 12 (DM deny reason: `NoValidAccessGrant` vs `NoCompletedOrderForStudent`) and Step 14 (revocation semantics). Document the current value in §3 sign-off.
- [ ] **ops-1**: PITR backup verified pre-launch per [`../production.md` §2.3(d) and Appendix D](../production.md#appendix-d--supabase-pitr-run-log). Latest snapshot timestamp documented in §3 sign-off.
- [ ] **ops-1 + ops-2**: Cross-browser manual smoke for V1 acceptance criterion 7 (3 locales × Chrome/Safari/Firefox = 9 click-throughs) — completed per [`../v1-acceptance-test.md` §3.4](../v1-acceptance-test.md). Per-locale browser coverage noted in §3 sign-off.

> **PAUSE POINT — REQUIRES VERIFICATION**: all 11 boxes checked before
> §2 begins. If any check fails, stop and follow §4 (Failure Recovery).

---

## §2 — The 16-step checklist

> **Format.** Each step is a paired [ ] ops-1 + [ ] ops-2 checkbox.
> ops-1 executes, ops-2 verifies. The `REQUIRES VERIFICATION` line is the
> pause point — ops-1 stops, ops-2 asserts, ops-1 proceeds on green.

### Step 1 — Registrazione (new user signup via Supabase magic-link)

- [ ] **ops-1**: Visit `https://<prod-domain>/signup` in incognito. Enter a fresh email `softlaunch+it-<timestamp>@example.com`.
- [ ] **ops-1**: Check inbox for the Supabase magic-link email. Click the link.
- [ ] **ops-1**: Confirm browser lands on `/dashboard` (or `/onboarding` if V1.1 has it).
- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT id, email, role, \"lastSeenAt\", \"createdAt\" FROM \"User\" WHERE email LIKE 'softlaunch+it-%' ORDER BY \"createdAt\" DESC LIMIT 1;"` — assert the row exists, `role='student'`, `lastSeenAt` is recent (within last 5 min, indicating the user is logged in). Note: `emailVerified` lives in Supabase `auth.users` (NOT the Prisma `User` model — verified against `prisma/schema.prisma`); cross-check via Supabase Dashboard → Authentication → Users if needed.
- [ ] **REQUIRES VERIFICATION**: a new `User` row was created via Supabase Auth, NOT via the legacy NextAuth path. The user is logged in (recent `lastSeenAt`).

### Step 2 — Google login (OAuth provider)

- [ ] **ops-1**: Open a SECOND incognito window. Visit `https://<prod-domain>/login` and click "Continue with Google".
- [ ] **ops-1**: Use a **different** Google account (e.g. `softlaunch.google+<timestamp>@gmail.com`). Grant OAuth consent.
- [ ] **ops-1**: Browser lands on `/dashboard`.
- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT id, email, \"createdAt\" FROM \"User\" WHERE email LIKE 'softlaunch.google%' ORDER BY \"createdAt\" DESC LIMIT 1;"` — assert a row exists with a recent `createdAt`, distinct `id` from the Step 1 user. Note: the Prisma `User` model has NO `signInProvider` column (verified against `prisma/schema.prisma`). The OAuth provider lives in Supabase `auth.users.raw_app_meta_data->>'provider'`.
- [ ] **ops-2** (optional): Cross-check the OAuth provider via Supabase Dashboard → Authentication → Users → find the new user → "App Metadata" should show `provider: "google"`.
- [ ] **REQUIRES VERIFICATION**: a second `User` row was created via the Google OAuth path. Both this user and the Step 1 user appear in `User` table, distinct identities.

### Step 3 — 3 landing pages (i18n + content visibility)

- [ ] **ops-1**: With the Google user from Step 2 logged in, visit in sequence:
  - `https://<prod-domain>/it-it/amish-secrets`
  - `https://<prod-domain>/en-us/amish-secrets`
  - `https://<prod-domain>/es-es/amish-secrets`
- [ ] **ops-2**: For each URL, assert in browser DevTools Network tab: `GET /<locale>/amish-secrets` returns HTTP 200, response includes the locale-specific content (e.g., `Lezione 1` for `it-it`, `Lesson 1` for `en-us`, `Lección 1` for `es-es`).
- [ ] **ops-2**: For each URL, `document.documentElement.lang` matches the locale (`it-IT`, `en-US`, `es-ES`).
- [ ] **ops-2**: For each URL, the CTA button is visible and points to LS checkout.
- [ ] **REQUIRES VERIFICATION**: 3 locales render correctly with localized content. CTA buttons route to LS checkout (URL contains `lemonsqueezy.com` or our LS-store slug).

### Step 4 — Checkout reale (real corporate card × 3 locales)

- [ ] **ops-1**: ALL 3 buyers MUST arrive via UTM-tagged URLs: `https://<prod-domain>/<locale>/amish-secrets?utm_source=youtube&utm_campaign=<channel-name>`. This is the channel-attribution hook required for Step 15 — `customData.channelId` is set on the LS checkout by `createCheckout()` in `src/lib/commerce/payments/providers/lemonsqueezy/index.ts`, and flows to the webhook → `processOrder()` → `purchase_analytics` outbox payload → `AnalyticEvent.channelId`.
- [ ] **ops-1**: Log in as the Step 1 user (Supabase magic-link user from Step 1). Visit `/it-it/amish-secrets` (with UTM), click the CTA. LS checkout opens in a new tab.
- [ ] **ops-1**: Complete payment with the IT real card. LS shows order confirmation.
- [ ] **ops-1**: Log out. Log in as the Step 2 user (Google OAuth user from Step 2). Repeat for `/en-us/amish-secrets` (EN card, with UTM).
- [ ] **ops-1**: For the 3rd charge (`/es-es/amish-secrets` with the ES card, with UTM): preferred path is to create a 3rd dedicated user by re-running Step 1 with `softlaunch+es-<timestamp>@example.com`. Alternative: re-use the Step 2 user (less clean attribution per locale). Document which path was used in §3 sign-off.
- [ ] **ops-1**: Record each `providerOrderId` (LS shows it on the receipt page or in the redirect-URL query string) — save for Steps 6+13.
- [ ] **ops-2**: After each charge, run `psql "$DIRECT_URL" -c "SELECT id, status, \"providerOrderId\", amount, currency, locale FROM \"Order\" WHERE \"providerOrderId\" = '<id-from-step-4>';"` — expect 0 rows IMMEDIATELY (the webhook hasn't fired yet — this is the baseline; the row appears after Step 5).
- [ ] **REQUIRES VERIFICATION**: 3 LS charges succeed (LS Dashboard → Orders shows 3 new orders, amounts match `Product.price` per locale). Each charge's BIN range is recorded. All 3 used UTM-tagged URLs.

### Step 5 — Webhook (LS → Vercel)

- [ ] **ops-1**: After each charge, wait ≤30 seconds. Tail Vercel logs (filter: `/api/webhooks/lemonsqueezy`).
- [ ] **ops-1**: Expect log line: `[LS Webhook] order_created: <providerOrderId>, email: <buyer-email>`.
- [ ] **ops-2**: Assert HTTP 200 returned to LS (the handler's `200 received:true` response). NO 4xx/5xx. This confirms signature verification and `ProcessedWebhook` reservation; order/grant/outbox completion is verified separately in Steps 6–8.
- [ ] **ops-2**: If 4xx: signature mismatch — verify Vercel `LEMONSQUEEZY_WEBHOOK_SECRET` matches the live webhook's signing secret per `lemon-squeezy-live-setup.md` §5.4.
- [ ] **ops-2**: If 5xx: check Vercel logs for stack trace; transient → wait + retry; persistent → §4 Failure Recovery.
- [ ] **REQUIRES VERIFICATION**: all 3 webhooks return HTTP 200 within ≤30s of charge. Vercel logs show `[LS Webhook] order_created` for each.

### Step 6 — Order (DB row created)

- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT id, \"userId\", \"productId\", \"paymentProvider\", \"providerOrderId\", amount, currency, locale, status FROM \"Order\" WHERE \"providerOrderId\" IN ('<id1>', '<id2>', '<id3>');"`.
- [ ] **ops-2**: Assert 3 rows, one per charge. Each row: `paymentProvider='lemonsqueezy'`, `status='completed'`, `amount > 0`, `currency` matches the locale's tier, `locale IN ('it-it','en-us','es-es')`.
- [ ] **ops-2**: Assert `userId` matches the Step 1/Step 2 user (the buyer was logged in at checkout, so LS customData.email = buyer's email → handler's `processOrder` resolves the `User` by email).
- [ ] **REQUIRES VERIFICATION**: 3 `Order` rows, all `status='completed'`, all amounts match the corresponding LS charge, all linked to the correct user (Step 1 for IT, Step 2 for EN, repeat for ES if a third user is needed).

### Step 7 — AccessGrant (MCR Phase 2 dual-write)

- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT id, \"userId\", \"productId\", \"sourceType\", \"sourceId\", status, \"grantedAt\" FROM \"AccessGrant\" WHERE \"sourceId\" IN (SELECT id FROM \"Order\" WHERE \"providerOrderId\" IN ('<id1>','<id2>','<id3>'));"`.
- [ ] **ops-2**: Assert 3 rows, one per Order. Each: `sourceType='order'`, `sourceId` matches the `Order.id`, `status='active'`, `grantedAt` is recent (within the last 5 min).
- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT count(*) FROM \"AccessGrant\" WHERE status='active' AND \"userId\"=<user-from-step-1>;"` — expect ≥1 (the IT buyer's grant).
- [ ] **REQUIRES VERIFICATION**: every `Order` from Step 6 has a matching `AccessGrant` (the MCR Phase 2 dual-write fired correctly). This is the post-cutover source of truth for "is this user authorized".

### Step 8 — Email (purchase confirmation)

- [ ] **ops-1**: Check the Step 1 buyer's inbox for the purchase confirmation email. Subject contains the product name + order ID.
- [ ] **ops-1**: Email body contains: localized greeting, product name, download/access link (`/dashboard` or `/portal`).
- [ ] **ops-2**: Verify the outbox worker processed the three `purchase_email` events and tail Vercel logs for the email handler/SMTP calls — expect 3 successful sends (one per Order from Step 6).
- [ ] **ops-2**: If email is missing: check the outbox event and its delivery attempt first, then SMTP env (`EMAIL_SERVER_*` per `src/lib/env.ts`). The buyer email flows from LS → `processOrder` → durable `purchase_email` outbox event → `OUTBOX_HANDLER_REGISTRY` → SMTP. Confirm `OutboxDeliveryAttempt.channel='email'` is `sent`; `failed` is retryable and `uncertain` requires reconciliation, not a blind resend.
- [ ] **REQUIRES VERIFICATION**: 3 purchase confirmation emails delivered (one per buyer, matching the locale's language). No emails in spam.

### Step 9 — Corso (course access granted)

- [ ] **ops-1**: With the Step 1 buyer logged in, visit `/dashboard`. The product card for `amish-secrets` shows "Accesso sbloccato" (or localized equivalent) AND a "Continua" / "Inizia" CTA.
- [ ] **ops-1**: Click the CTA → lands on `/it-it/amish-secrets/portal` (the lesson listing).
- [ ] **ops-1**: The portal shows the lesson list (≥1 lesson per `Product.lessons` relation).
- [ ] **ops-2**: Visit the same URLs in INCOGNITO (not logged in) — the portal should show a paywall, not the lessons. This confirms the AccessGate uses the auth+grant check, not just auth.
- [ ] **ops-2**: In a 3rd tab, log in as a DIFFERENT user (not the buyer) — visit the same portal URL — paywall still shows. Confirms the AccessGrant is per-user, not global.
- [ ] **REQUIRES VERIFICATION**: the buyer can access the portal. Other users (logged-in but non-buyers) get the paywall. The AccessGate is correctly keyed on `AccessGrant.status='active'` (or the legacy `Order.status='completed'` if `USE_ACCESS_GRANT_RESOLVER=false`).

### Step 10 — Download (PDF/ebook)

- [ ] **ops-1**: From the portal, click the "Download PDF" / "Scarica ebook" link. Browser downloads the PDF.
- [ ] **ops-1**: Open the PDF — content is the localized ebook (not a 404 or empty PDF).
- [ ] **ops-2**: Tail Vercel logs for the download endpoint — expect an authenticated request with a 200 response.
- [ ] **ops-2**: Tail Vercel logs for the download endpoint (filter on `/api/ebook/` or `/api/lesson-asset/`) — expect an authenticated 200 response for the buyer's `userId`. The codebase does NOT maintain a dedicated `EbookDownloadLog` table (verified via codebase search). The `LessonAsset` table stores the file metadata (`type='pdf'`); downloads are observed via Vercel runtime logs.
- [ ] **ops-2** (optional, if V1.1 adds it): check `AnalyticEvent.eventType='ebook_download'` (currently NOT in the enum per `prisma/schema.prisma` AnalyticEvent comment; enum is `pageview | scroll_deep | click_buy | checkout_open | checkout_complete | purchase | refund | checkout_abandoned | lesson_start | lesson_complete`).
- [ ] **REQUIRES VERIFICATION**: the buyer can download the ebook. The download endpoint is gated by AccessGrant (non-buyer hit → 403, not 200). An audit log row was created.

### Step 11 — Progressi (lesson completion tracking)

- [ ] **ops-1**: Open a lesson from the portal. Watch ≥30s of the video. Click the "Mark as complete" / "Segna come completata" button.
- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT \"lessonId\", completed, \"completedAt\" FROM \"LessonProgress\" WHERE \"userId\"=<user-from-step-1> ORDER BY \"updatedAt\" DESC LIMIT 5;"` — expect ≥1 row with `completed=true`, `completedAt` recent.
- [ ] **ops-1**: Reload the portal — the completed lesson shows a checkmark / "Completata" badge.
- [ ] **ops-1**: Click on the lesson again. Watch ≥5s. Click `track-watch` endpoint indirectly (it fires on the player UI).
- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT \"lastWatchedAt\" FROM \"LessonProgress\" WHERE \"userId\"=<user-from-step-1> AND \"lessonId\"=<lesson-id>;"` — expect `lastWatchedAt` is recent (within the last 60s).
- [ ] **REQUIRES VERIFICATION**: lesson completion is persisted in `LessonProgress` (completed=true + completedAt populated). Watch-time tracking updates `lastWatchedAt`. The portal UI reflects the completion state on reload.

### Step 12 — DM (direct message to creator)

- [ ] **ops-1**: From the portal or `/dashboard`, find a "Message the creator" / "Invia un messaggio" CTA. Click it.
- [ ] **ops-1**: Send a test message: "Soft-launch E2E test from `<your-name>` on `<timestamp>`".
- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT id, \"conversationId\", \"senderId\", content, \"createdAt\" FROM \"Message\" WHERE content LIKE 'Soft-launch E2E test%' ORDER BY \"createdAt\" DESC LIMIT 1;"` — assert the row exists, `senderId` matches the buyer.
- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT id, \"userOneId\", \"userTwoId\", \"productId\" FROM \"Conversation\" WHERE id = (SELECT \"conversationId\" FROM \"Message\" WHERE content LIKE 'Soft-launch E2E test%' ORDER BY \"createdAt\" DESC LIMIT 1);"` — assert `productId` is the `amish-secrets` slug's product id. Note: the `Conversation` model uses `userOneId`/`userTwoId` (NOT `studentId`/`creatorId` as initially drafted — verified against `prisma/schema.prisma` L408-422). The convention is `userOneId=student` (message sender) and `userTwoId=creator` (the product's `creatorId`).
- [ ] **ops-2**: Cross-check by joining `Product.creatorId` → `User.id`: `psql "$DIRECT_URL" -c "SELECT p.\"creatorId\" FROM \"Product\" p WHERE p.slug = 'amish-secrets';"` — note the `creatorId` and assert it matches `userTwoId` from the conversation.
- [ ] **REQUIRES VERIFICATION**: the DM is persisted. The conversation's `(studentId, creatorId, productId)` triple is correctly bound (the `resolve-message-permission` gate allowed the message because the buyer has an `AccessGrant` for `amish-secrets`).

### Step 13 — Rimborso (refund via LS Live Dashboard)

- [ ] **ops-1**: Open LS Live Dashboard → Orders. Pick the IT buyer's order (the first of the 3 from Step 4).
- [ ] **ops-1**: Click "Refund" → confirm. LS shows refund pending/processing.
- [ ] **ops-1**: Wait ≤30s. Tail Vercel logs for `[LS Webhook] order_refunded`.
- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT id, status, \"updatedAt\" FROM \"Order\" WHERE \"providerOrderId\" = '<id1>';"` — assert `status='refunded'`, `updatedAt` is recent.
- [ ] **ops-1**: Repeat the refund for the EN and ES orders (2 more refunds, total 3 per V1 acceptance criterion 6).
- [ ] **ops-2**: For all 3 orders, assert `Order.status='refunded'`. Note the timestamps in §3 sign-off.
- [ ] **REQUIRES VERIFICATION**: all 3 LS refunds processed. All 3 corresponding `Order` rows flipped to `status='refunded'` within ≤30s of webhook delivery.

### Step 14 — Revoca (AccessGrant atomic revoke)

- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT id, status, \"revokedAt\" FROM \"AccessGrant\" WHERE \"sourceId\" IN (SELECT id FROM \"Order\" WHERE \"providerOrderId\" IN ('<id1>','<id2>','<id3>'));"`.
- [ ] **ops-2**: Assert 3 rows, all `status='revoked'`, all `revokedAt` populated and within ≤30s of the Step 13 refund timestamps.
- [ ] **ops-1**: With the IT buyer still logged in, try to visit `/it-it/amish-secrets/portal`. Expect a paywall (not the lessons).
- [ ] **ops-1**: Try to download the PDF again. Expect HTTP 403.
- [ ] **ops-1**: Try to send a DM to the creator. Expect HTTP 403 with `MessagingDenyReason.NoValidAccessGrant` (or `NoCompletedOrderForStudent` if `USE_ACCESS_GRANT_RESOLVER=false`).
- [ ] **REQUIRES VERIFICATION**: the `AccessGrant` revocation was atomic with the order refund. The buyer can no longer access course content, ebook, or DMs. The denial is enforced by the AccessGrant resolver, not just the Order status.

### Step 15 — Attribuzione canale (channel attribution)

- [ ] **ops-1**: For this step, the buyer MUST have arrived at the landing page via a YouTube channel link (e.g. `https://<prod-domain>/it-it/amish-secrets?utm_source=youtube&utm_campaign=<channel-name>`). Repeat the purchase with a fresh buyer using such a URL. (If the 3 purchases from Step 4 already had UTMs, use those — otherwise fire a 4th purchase with a UTM-tagged URL.)
- [ ] **ops-2** (PRE-FLIGHT, before Step 4 charges): Run `psql "$DIRECT_URL" -c "SELECT count(*) FROM \"AnalyticEvent\" WHERE \"eventType\"='purchase' AND \"createdAt\" > NOW() - INTERVAL '1 hour';"` — assert **0** (baseline; no purchases yet). Re-run AFTER the outbox worker has processed the three `purchase_analytics` events — assert **3**. The `purchase` event is created by `OUTBOX_HANDLER_REGISTRY` in `src/lib/commerce/outbox/registry.ts`, after `processOrder()` durably creates the outbox row. If 0 after the worker is green, open a P1 incident, do NOT proceed.
- [ ] **ops-2**: Run `psql "$DIRECT_URL" -c "SELECT ae.\"eventType\", ae.locale, ae.\"channelId\", ae.\"revenueCents\", ae.metadata, ae.\"createdAt\" FROM \"AnalyticEvent\" ae WHERE ae.\"eventType\"='purchase' ORDER BY ae.\"createdAt\" DESC LIMIT 5;"` — assert the row exists, `channelId` is populated, `revenueCents` matches the order amount, the serialized metadata contains the expected provider/currency/order context. Do not join this purchase query through `VisitorSession`: the current `purchase_analytics` outbox payload does not carry `sessionId` or UTM fields.
- [ ] **ops-2**: Run the corresponding `pageview` query separately to verify the landing-page UTM capture. Treat pageview-to-purchase session correlation as future work until the purchase outbox payload carries a session identifier.
- [ ] **ops-1**: Visit `/admin/analytics` (V1.0 schema is ready per commit `714d66e`; the queries are deferred to V1.1 per `roadmap-current.md` §1.5 — so this UI may not exist yet; ops-2 verifies via SQL only).
- [ ] **REQUIRES VERIFICATION**: after outbox processing, `AnalyticEvent` contains the purchase attribution fields currently supported by the code: `channelId`, `revenueCents`, locale, and provider/order metadata. The separate pageview query confirms UTM capture; shared purchase/pageview session correlation is future work.

### Step 16 — Verifica finale (sign-off)

- [ ] **ops-1**: All 15 prior steps' `REQUIRES VERIFICATION` lines were asserted by ops-2.
- [ ] **ops-2**: Run the aggregate cross-check query:

      ```bash
      psql "$DIRECT_URL" -c "
        SELECT
          (SELECT count(*) FROM \"Order\"         WHERE \"createdAt\" > NOW() - INTERVAL '2 hours') AS new_orders,
          (SELECT count(*) FROM \"Order\"         WHERE status='completed' AND \"createdAt\" > NOW() - INTERVAL '2 hours') AS new_completed,
          (SELECT count(*) FROM \"Order\"         WHERE status='refunded'  AND \"createdAt\" > NOW() - INTERVAL '2 hours') AS new_refunded,
          (SELECT count(*) FROM \"AccessGrant\"   WHERE \"grantedAt\"   > NOW() - INTERVAL '2 hours') AS new_grants_active,
          (SELECT count(*) FROM \"AccessGrant\"   WHERE status='revoked' AND \"revokedAt\" > NOW() - INTERVAL '2 hours') AS new_grants_revoked,
          (SELECT count(*) FROM \"LessonProgress\" WHERE \"completedAt\" > NOW() - INTERVAL '2 hours') AS new_progress,
          (SELECT count(*) FROM \"Message\"        WHERE \"createdAt\"  > NOW() - INTERVAL '2 hours') AS new_messages,
          (SELECT count(*) FROM \"AnalyticEvent\"  WHERE \"eventType\"='purchase' AND \"createdAt\" > NOW() - INTERVAL '2 hours') AS new_purchase_events;
      "
      ```

- [ ] **ops-2**: Assert the row counts make sense:
  - `new_orders` = 3 (Step 4, all 3 charges)
  - `new_completed` = 3 (Step 4, all completed post-webhook)
  - `new_refunded` = 3 (Step 13, all 3 refunded)
  - `new_grants_active` = 3 (grants were granted in Step 4; `grantedAt` is within 2h, so they show as "active" by timestamp regardless of `status` — the `status` flip in Step 14 only changes `revokedAt`, NOT `grantedAt`. `status='revoked'` is the authoritative state, not the count).
  - `new_grants_revoked` = 3 (Step 14, `status='revoked'` + `revokedAt` populated)
  - `new_progress` ≥ 1 (Step 11)
  - `new_messages` ≥ 1 (Step 12)
  - `new_purchase_events` ≥ 3 (Step 15, one per paid order; tagged with UTM if Step 4 used UTM-tagged URLs)
- [ ] **ops-1 + ops-2**: ALERT_WEBHOOK_URL has NO new `server-error-sink` firings during the runbook (a single P3 is acceptable; any P0/P1 = abort + §4).
- [ ] **ops-1 + ops-2**: Sign the §3 sign-off block. Soft launch is GO.

---

## §3 — Sign-off (DEFINITIVE go/no-go)

> Both operators fill in. NO box may be left unchecked for a soft-launch
> go decision. ANY unchecked box = NO-GO; fix and re-run from the
> affected step.

| Item | Value |
| --- | --- |
| **Run date** | `YYYY-MM-DD` |
| **ops-1 (driver) name + initials** | `_______________ / ____` |
| **ops-2 (verifier) name + initials** | `_______________ / ____` |
| **LS providerOrderIds (3) from Step 4** | `1. __________  2. __________  3. __________` |
| **LS charge BINs (3) from Step 4** | `1. __________  2. __________  3. __________` |
| **Step 13 refund timestamps (3) from Vercel logs** | `1. __________  2. __________  3. __________` |
| **Step 14 grant-revoke timestamps (3) from psql** | `1. __________  2. __________  3. __________` |
| **Total elapsed time** | `__ min` |
| **Step where runbook stopped (if NO-GO)** | `Step ___` |
| **P0/P1 alerts fired during run (count)** | `0` (P0/P1 = NO-GO) |

### Code surface (must be ✅)

- [ ] `npm run typecheck` passes on `main` HEAD (no errors in `src/` out of the legacy `dashboard/page.tsx` baseline)
- [ ] `npm run test:e2e` passes locally on Chrome with LS+Supabase test creds (the existing journey + checkout tests, NOT this soft-launch runbook)
- [ ] `.github/workflows/ci.yml` deploy-gate is green on `main` HEAD

### Step verifications (every REQUIRES VERIFICATION line was asserted)

- [ ] Step 1 — Supabase signup creates `User` row with `emailVerified` set
- [ ] Step 2 — Google OAuth creates a second `User` row with `signInProvider='google'`
- [ ] Step 3 — 3 locales render with localized content + correct `lang` attribute + LS checkout URLs
- [ ] Step 4 — 3 real LS charges succeed (Dashboard shows 3 orders)
- [ ] Step 5 — 3 webhooks return 200 within ≤30s, Vercel logs show `[LS Webhook] order_created`
- [ ] Step 6 — 3 `Order` rows, all `status='completed'`, amounts + currencies correct
- [ ] Step 7 — 3 matching `AccessGrant` rows, all `status='active'` (the MCR Phase 2 dual-write fired)
- [ ] Step 8 — 3 purchase confirmation emails delivered (one per buyer, localized)
- [ ] Step 9 — buyer accesses portal, non-buyers get paywall (AccessGate keyed on AccessGrant)
- [ ] Step 10 — buyer downloads PDF, audit log row created
- [ ] Step 11 — `LessonProgress` rows persisted (completed + lastWatchedAt)
- [ ] Step 12 — DM persisted, conversation correctly bound to (student, creator, product)
- [ ] Step 13 — 3 LS refunds processed, 3 `Order.status='refunded'` within ≤30s
- [ ] Step 14 — 3 `AccessGrant.status='revoked'` atomically; portal + ebook + DM all denied
- [ ] Step 15 — `AnalyticEvent` captures YouTube channel attribution end-to-end (landing + purchase)
- [ ] Step 16 — aggregate cross-check query returns expected counts

### Observability

- [ ] `ALERT_WEBHOOK_URL` healthy throughout the run (no P0/P1 firings from this runbook's actions)
- [ ] `server-error-sink` did not raise for any of the 16 steps' actions

### Sign-off

- [ ] ops-1 (initials + timestamp): `____  ____`
- [ ] ops-2 (initials + timestamp): `____  ____`
- [ ] SOFT LAUNCH STATUS: `🟢 GO`  /  `🔴 NO-GO (re-run from Step ___)`

---

## §4 — Failure Recovery

| Symptom | Likely cause | Recovery |
| --- | --- | --- |
| Step 5 webhook 401 | `LEMONSQUEEZY_WEBHOOK_SECRET` mismatch | Re-create LS webhook per `lemon-squeezy-live-setup.md` §5.4 (rotate-in-place procedure). Vercel env must match. Replay the missed events from LS Dashboard. |
| Step 5 webhook 5xx | Transient app error (DB/SMTP timeout) | LS retries 16× over 24h. Wait + monitor Vercel logs. If persistent, rollback per `production.md` §2.2. |
| Step 6 no `Order` row | LS webhook fired but `processOrder` failed silently (e.g. `Product.countryOverrides` drift per `lemon-squeezy-live-setup.md` §3.3) | Inspect Vercel logs for stack trace. Check `Product.lemonVariantId` matches the LS live variant. Replay via LS Dashboard → Webhooks → "Resend". |
| Step 7 no `AccessGrant` | MCR Phase 2 backfill not yet applied | Run `scripts/migrate-grants-from-orders.ts` per `audit-log.md` §Staging runbook. Replay the `order_created` events. |
| Step 8 email missing | Outbox worker has not processed the event, SMTP env is misconfigured, or delivery is `failed`/`uncertain` | Inspect the matching `OutboxEvent` and `OutboxDeliveryAttempt`. Fix SMTP/configuration and allow infrastructure retry for `failed`; do not blindly resend `processing` or `uncertain`, because the provider may already have accepted the message. Reconcile ambiguous deliveries operationally. |
| Step 9 paywall on buyer | `AccessGrant` not created (Step 7 fail) or `USE_ACCESS_GRANT_RESOLVER=true` not flipped | See Step 7 recovery. If MCR is fully cut over, verify the flag. |
| Step 11 `LessonProgress` not persisted | `progress` API call failed (likely auth or grant check) | Check `src/app/api/progress/route.ts` logs. The route checks access (admin bypass \| findCompletedOrder). |
| Step 12 DM denied | `resolve-message-permission` returns `NoValidAccessGrant` (or legacy `NoCompletedOrderForStudent`) | Check the `AccessGrant` from Step 7. If grant is `active` and still denied, the resolver has a bug — open P1 incident. |
| Step 13 refund webhook not firing | LS not subscribed to `order_refunded` event | Re-configure per `lemon-squeezy-live-setup.md` §4.2. Re-fire the refund from LS Dashboard. |
| Step 14 grant not revoked | The `order_refunded` handler in `src/app/api/webhooks/lemonsqueezy/route.ts` ran but `AccessGrant` was already revoked (defensive) or MCR Phase 2 dual-write isn't on | Verify `prisma.accessGrant.findFirst({ where: { sourceId, status: 'revoked' } })` returns the row. If not, run the revoke manually: `prisma.accessGrant.updateMany({ where: { sourceId }, data: { status: 'revoked', revokedAt: new Date() } })`. |
| Step 15 no `AnalyticEvent` | `channelId` was not passed in `customData` at checkout OR the `purchase` event is not emitted | Check `src/lib/commerce/payments/providers/lemonsqueezy/index.ts` — `channelId` is set when the buyer arrives with `?utm_campaign=*` matched to a `YouTubeChannel`. `processOrder` creates the `purchase_analytics` outbox event; `src/lib/commerce/outbox/registry.ts` writes the `AnalyticEvent` when the worker dispatches it. |
| Multiple P0/P1 alerts | Something fundamental is broken — treat as incident | Per `production.md` §3.1: P0 = P0 incident, public status comms. P1 = status page. Pause the soft launch; do not patch in prod. |

> **General rule**: when a step fails, identify the failed step's
> REQUIRES VERIFICATION line, fix the underlying cause, and re-run from
> THAT step onward. Most steps are idempotent (LS webhook replay,
> Prisma upsert, retry from the same buyer email). Exceptions:
>
> - **Steps 1-4** (account creation + card charge): avoid re-charging
>   the same card 3 times (LS fraud-rules may flag the repeated BINs).
>   If the failure is in Step 4, use a different card OR re-fire the
>   webhook from the LS Dashboard (the handler is idempotent via
>   the `ProcessedWebhook` reservation and the unique
>   `(paymentProvider, providerOrderId)` order key — see the webhook
>   handler and `complete-order.ts`.
> - **Step 5** (webhook): use the LS Dashboard "Resend" feature
>   instead of triggering a new charge. The handler is idempotent
>   (`reserveWebhookEvent` prevents duplicate processing; a replay is safe
>   for order, grant, and outbox creation).
> - **Steps 6-15** (DB-state verification): re-run from the failed
>   step. All updates are upsert/conditional; no duplicate side effects.

---

## §5 — Cross-references

| Topic | See |
| --- | --- |
| 11-criterion matrix (V1.0) | [`../v1-acceptance-test.md`](../v1-acceptance-test.md) |
| LS live-mode wiring (V1-V6 verticals) | [`./lemon-squeezy-live-setup.md`](./lemon-squeezy-live-setup.md) |
| Production deploy, rollback, alerts, RBAC | [`../production.md`](../production.md) |
| MCR Phase 2 backfill (AccessGrant dual-write) | [`../audit-log.md`](../audit-log.md) |
| Roadmap + V1 blockers | [`../roadmap-current.md`](../roadmap-current.md) |
| LS webhook handler (canonical contract) | `src/app/api/webhooks/lemonsqueezy/route.ts` |
| LS provider (canonical customData) | `src/lib/commerce/payments/providers/lemonsqueezy/index.ts` |
| OrderService (processOrder + AccessGrant dual-write) | `src/lib/commerce/orders/complete-order.ts` |
| DM permission resolver (AccessGrant-based post-cutover) | `src/lib/messaging/resolve-message-permission.ts` |
| Lesson progress API | `src/app/api/progress/route.ts` |
| Staging env provisioning (for the 4 Prisma-touching scripts) | `scripts/ops/staging-env.sh` |
| Staging seed (3 YouTubeChannel rows) | `scripts/ops/staging-seed.sh` |

---

## Document control

| Field | Value |
| --- | --- |
| First written | FASE 3.2 (this runbook) |
| Estimated run time | 45–75 min (real-card processing dominates) |
| Operators required | 2 (ops-1 driver, ops-2 verifier) |
| Re-runnable | ✅ Yes — every step is idempotent |
| Review cadence | after every V-minor release (per `v1-acceptance-test.md` §6) |
| Tight coupling | `lemon-squeezy-live-setup.md` V1-V6 must be in place BEFORE this runbook; `v1-acceptance-test.md` §1 criteria 1, 2, 3, 5, 6, 7, 10 must be ready (criteria 4, 8, 9, 11 are infra-level and have separate gates) |
