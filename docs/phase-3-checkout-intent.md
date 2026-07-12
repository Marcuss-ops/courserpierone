# Phase 3 — CheckoutIntent + RecoveryPolicy

> **Status:** design — not yet implemented.
> **Owner:** TBD.
> **Source PRs:** supersedes the current `AbandonedCheckout` model
> (which records checkout rows AFTER the provider URL is returned)
> and the hardcoded `RECOVERY10` URL parameter in
> `src/app/api/cron/abandoned-checkouts/route.ts`.
>
> **Migration strategy:** per-record, no break. Each existing
> `AbandonedCheckout` row is converted to a `CheckoutIntent` row
> in a one-shot script. The cron worker is updated to read
> `CheckoutIntent` instead of `AbandonedCheckout`. Until the cron
> flip, both tables are written (dual-write on email capture).
> `AbandonedCheckout` is dropped in Phase 7 cleanup.

---

## 1. Motivation

The current abandoned-cart flow has three problems:

1. **Email is captured AFTER the provider call.** The current
   `CheckoutService.createCheckout` calls
   `saveAbandonedCheckout` only when the provider returns a URL.
   If the provider call fails (e.g. rate-limited, network
   timeout), the contact is silently lost. The customer was on
   our landing page, gave us their intent, but we never wrote
   it down.
2. **Hardcoded `RECOVERY10` coupon.** The cron worker at
   `src/app/api/cron/abandoned-checkouts/route.ts` appends
   `&discount=RECOVERY10` (or `?coupon=RECOVERY10` for Stripe) to
   the checkoutUrl. There's no policy — every abandoned cart
   gets the same 10% coupon. A creator launching a high-ticket
   course cannot ship a 30% recovery coupon without code edits.
3. **Single 1h-24h recovery window, fixed in cron logic.** The
   current cron polls `createdAt >= now() - 24h AND createdAt <=
   now() - 1h` — a hardcoded 1h-to-24h window. Customers who
   create an intent at 23:00 and abandon it at 00:30 may not
   see a recovery email until 23:00 the next day (a 23h delay).

Phase 3 fixes all three: email is captured BEFORE the provider
call (in a new `POST /api/checkout/intents` endpoint), the
recovery coupon comes from a `RecoveryPolicy` table that creators
can configure per product, and the recovery window is driven
by `CheckoutIntent.recoveryAt` (computed at intent time from
the applicable `RecoveryPolicy.delayMinutes`).

---

## 2. Schema

### 2.1 `CheckoutIntent`

The intent record. The customer's email + product + locale are
captured here BEFORE the provider is called. The provider session
(`providerCheckoutId`, `checkoutUrl`) is populated by
`POST /api/checkout/intents/:id/session`.

```prisma
model CheckoutIntent {
  id                 String   @id @default(cuid())

  // Client-facing identifier
  // publicToken is a random 32-byte base64url string, exposed to the
  // client (and the URL). NOT the cuid (which is internal-only).
  // Used by the client to retry session creation, and by the
  // abandoned-cart worker to look up the intent by URL.
  publicToken        String   @unique

  // Customer identity
  email              String
  userId             String?            // nullable: guest checkout
  productId          String
  creatorId          String             // denormalized for analytics + RLS

  // Locale / currency / attribution
  locale             String             // "it-it" | "en-us" | ...
  currency           String             // "eur" | "usd" | ...
  channelId          String?            // YouTubeChannel.id (channel attribution)
  visitorSessionId   String?            // for cross-session funnel tracking

  // Source attribution
  // - "landing"    : regular landing page checkout
  // - "dm_offer"   : PrivateOffer in a DM conversation (Phase 6)
  // - "dashboard"  : creator's own admin-dashboard manual checkout
  sourceType         String
  sourceId           String?            // conversationId, privateOfferId, etc.

  // Provider state
  provider           String             // "lemonsqueezy" | "stripe"
  providerCheckoutId String?            // LS checkout session id (set on /session)
  checkoutUrl        String?            // redirect URL (set on /session)

  // State machine
  status             String   @default("captured")
                          // captured      — email saved, no provider call yet
                          // checkout_created — provider session created
                          // completed     — Order exists (webhook fired)
                          // abandoned     — recovery window expired without completion
                          // expired       — RecoveryPolicy.validUntil passed
  recoveryAt         DateTime?          // when the recovery email should be sent
  recoverySentAt     DateTime?          // when the recovery email was sent
  completedOrderId   String?            // populated when webhook lands

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  user      User?     @relation("UserCheckoutIntents", fields: [userId], references: [id], onDelete: SetNull)
  product   Product   @relation(fields: [productId], references: [id], onDelete: Restrict)
  creator   User      @relation("CreatorCheckoutIntents", fields: [creatorId], references: [id], onDelete: Restrict)

  @@index([status, recoveryAt])  // abandoned-cart worker query
  @@index([email, productId])    // dedupe + analytics
}
```

**Why `publicToken` separate from `id` (cuid):** the cuid is
internal-only and predictable enough that a malicious client
could guess other intents. `publicToken` is a 32-byte random
base64url string — non-guessable, safe to put in URLs. The
`/api/checkout/intents/:id/session` endpoint accepts EITHER
the cuid (server-internal callers) or the publicToken
(client callers). The handler resolves token → intent before
processing.

**Why `creatorId` is denormalized (not derived from product):**
RLS-friendly indexing. The Phase 5 creator inbox query
(`getCreatorConversationPreviews(creatorId)`) batches by
creatorId; a denormalized field avoids a join on every inbox
load. The denormalization is enforced by the endpoint: clients
cannot set `creatorId` directly; the server derives it from
`productId` at intent creation.

**Why `userId` is nullable:** the customer may not have a
Supabase account yet (guest checkout). On webhook success,
`processOrder` does find-or-create user (existing PR 2 path)
and the user's id is back-filled into `CheckoutIntent.userId`
via a small update. (This is a minor optimization — the
abandoned-cart worker doesn't need the userId, and the
completed Order has the canonical `userId`.)

### 2.2 `RecoveryPolicy`

A creator's recovery strategy. One row per (creator × product ×
locale-cookie) policy. The abandoned-cart worker reads the
applicable policy when emitting the `checkout.abandoned` event;
the notification consumer applies the policy to choose coupon,
delay, max-messages, etc.

```prisma
model RecoveryPolicy {
  id              String   @id @default(cuid())

  // Identity
  // - "default"          : applies when no creator-specific policy matches
  // - "creator:{userId}" : creator-specific default
  // - "{productId}"      : product-specific override
  name            String   @unique

  // Window
  // delayMinutes is added to CheckoutIntent.recoveryAt (computed
  // at intent creation). E.g. delayMinutes=120 means "send recovery
  // email 2h after intent capture" — this is the post-window
  // recovery, not the abandoned-cart detection window.
  // Detection window is fixed at 2h (see § 4) and is the time
  // between intent capture and "abandoned" status transition.
  delayMinutes    Int                       // default 120 (2h post-capture)
  maxMessages     Int      @default(1)     // cap on recovery emails per intent

  // Coupon
  // couponCode is appended to checkoutUrl as `&discount={couponCode}`
  // (LS path) or `?coupon={couponCode}` (legacy Stripe path). The
  // coupon itself is a row in the existing `Coupon` table; the
  // policy just references it. A policy with no couponCode
  // sends a plain recovery email without a discount.
  couponCode      String?

  // Scope
  // languages: BCP-47 tags (e.g. ["it", "en"]) — empty array means
  //            "all languages"
  // products:  product IDs this policy applies to — empty array
  //            means "all products for this creator"
  languages       String[]                 // Postgres text[] via Prisma
  products        String[]

  // Validity window (creator campaigns, e.g. "Black Friday 30% off")
  validFrom       DateTime?
  validUntil      DateTime?

  isActive        Boolean  @default(true)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Why a free-form `name` string instead of a FK to User/Product:**
recovery policies are admin-configured (via a future
`/admin/recovery-policies` endpoint) and creators can set
campaign-scoped policies. A typed `creatorId` column would
make the schema rigid; a `name` string with a documented
naming convention (`default`, `creator:{userId}`,
`{productId}`, `black-friday-2026`) is more flexible. V2 may
add a typed `creatorId?` column if the policy-by-creator
pattern becomes the dominant use case.

**Why a Postgres array for `languages` / `products`:** the
policy is a small, scoped rule that needs a simple
"any-of" match against a `CheckoutIntent.locale` or
`CheckoutIntent.productId`. Postgres `text[]` with `@>` (contains)
or `&&` (overlaps) is the simplest fit. The Prisma client
exposes it natively as `string[]`.

### 2.3 Migration path from `AbandonedCheckout`

`AbandonedCheckout` is converted to `CheckoutIntent` per row:

```sql
-- For each AbandonedCheckout, INSERT a CheckoutIntent with mapped fields.
-- Idempotency: WHERE NOT EXISTS check on publicToken (we generate a
-- new publicToken for the migrated row).
INSERT INTO "CheckoutIntent" (
  "id", "publicToken", "email", "productId", "creatorId", "locale",
  "currency", "provider", "checkoutUrl", "status", "completedOrderId",
  "recoveryAt", "recoverySentAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,                                                  -- id
  encode(gen_random_bytes(32), 'base64'),                                    -- publicToken
  ac."email",
  ac."productId",
  p."creatorId",                                                            -- denormalized from product
  ac."locale",
  COALESCE(c."currency", 'eur'),                                            -- from country rule, fallback eur
  ac."paymentProvider",
  ac."checkoutUrl",
  CASE ac."status"
    WHEN 'pending'    THEN 'checkout_created'
    WHEN 'recovered'  THEN 'completed'
    WHEN 'expired'    THEN 'expired'
  END,
  (SELECT o."id" FROM "Order" o
    WHERE o."userId" = (SELECT u."id" FROM "User" u WHERE u."email" = ac."email")
      AND o."productId" = ac."productId"
      AND o."status" = 'completed'
    LIMIT 1),                                                                -- completedOrderId
  ac."createdAt" + INTERVAL '2 hours',                                       -- recoveryAt (legacy 2h default)
  ac."reminderSentAt",                                                       -- recoverySentAt
  ac."createdAt",
  ac."updatedAt"
FROM "AbandonedCheckout" ac
JOIN "Product" p ON p."id" = ac."productId"
LEFT JOIN "CountryLocaleRule" cl ON cl."preferredLocale" = ac."locale"
LEFT JOIN "Locale" c ON c."code" = cl."countryCode"
WHERE NOT EXISTS (
  SELECT 1 FROM "CheckoutIntent" ci
  WHERE ci."email" = ac."email"
    AND ci."productId" = ac."productId"
    AND ci."provider" = ac."paymentProvider"
);
```

`AbandonedCheckout` is dropped in Phase 7 cleanup. Until then,
the dual-write on email capture keeps both tables in sync (see
§ 3.1).

---

## 3. Endpoints

### 3.1 `POST /api/checkout/intents` — capture email first

The first call in the new flow. Captures the customer's email +
product + locale BEFORE the provider is invoked. Returns a
`publicToken` that the client uses for the next call.

```text
POST /api/checkout/intents
Content-Type: application/json

{
  "email": "mario.rossi@example.com",
  "productId": "prod_amish123",
  "locale": "it-it",
  "currency": "eur",
  "channelId": "channel_yt_it_07",        // optional, YouTube channel
  "visitorSessionId": "vs_abc123",         // optional, cross-session funnel
  "sourceType": "landing",                  // "landing" | "dm_offer" | "dashboard"
  "sourceId": null,                         // conversationId, privateOfferId, etc.
  "country": "IT"                           // ISO 3166-1 alpha-2 (optional)
}
```

The handler:

1. **Auth** — anonymous OK (this is the entry point for guest
   checkout). If a session exists, attach `userId`.
2. **Validation** — Zod schema, plus a Prisma lookup that
   `productId` exists and `status='published'`. 400 if not.
3. **Currency resolution** — if `currency` is missing, derive
   from `locale` via `getCurrencyFromLocale(locale)`. (Existing
   helper at `src/lib/i18n/locale-resolver.ts`.)
4. **Dedupe** — `findFirst` on `(email, productId, provider,
   status IN ('captured', 'checkout_created'))`. If found,
   return the existing intent's publicToken (idempotent: same
   email on the same product in the same abandoned window →
   same intent, no duplicate).
5. **Insert** — `prisma.checkoutIntent.create({ ... })`. Set
   `status='captured'`, `provider='lemonsqueezy'` (Phase 3
   only handles LS; Stripe legacy stays on the V1.5 path).
6. **Dual-write** — also create a row in `AbandonedCheckout`
   with the same data. Until the cron flip (see § 4), both
   tables are kept in sync. Drop the dual-write when the cron
   reads from `CheckoutIntent` (after the rollout window).
7. **Publish outbox event** — within the same `$transaction`,
   `INSERT INTO "OutboxEvent" (eventType='checkout.intent.captured',
   aggregateType='CheckoutIntent', aggregateId=id,
   payload={email, productId, locale, currency, channelId,
   sourceType, sourceId})` and `pg_notify('payment_outbox',
   id)`. This is a Phase 2 dependency — the dispatcher fans
   out to analytics, etc.
8. **Response** — `201 { id, publicToken, recoveryAt }`. The
   `recoveryAt` is computed at this point (see § 4.1) so the
   client can show "we'll email you in 2h if checkout isn't
   completed".

**Rate limiting:** tier `PUBLIC` (100 req/min) — same as the
existing `/api/checkout` route.

**Auth:** none required (guest checkout entry). For
`sourceType='dm_offer'`, require authenticated session with
`dbUser.id` matching the PrivateOffer's `customerId` (Phase 6
adds this; the Phase 3 endpoint already validates the type
literal so sourceType enforcement is V2 work).

### 3.2 `POST /api/checkout/intents/:idOrToken/session` — create provider session

The second call. The client uses the `publicToken` from the
intent response to request a provider checkout URL.

```text
POST /api/checkout/intents/{publicToken}/session
Content-Type: application/json
Cookie: session=...     # optional, used for logged-in checkout

(empty body — the intent already has email + product + locale)
```

The handler:

1. **Resolve `idOrToken`** — try `findUnique` on `publicToken`
   first; if null, try `findUnique` on `id` (cuid). The public
   path is the client-facing one; the internal id path is
   used by the existing `/api/checkout` route during the
   dual-write window.
2. **Validation** — `intent` exists, `product.status='published'`,
   `status IN ('captured', 'checkout_created')` (re-entrancy:
   the client may retry the session call), and
   `createdAt > now() - INTERVAL '24 hours'` (LS checkout URLs
   expire; refuse to mint a URL for an old intent).
3. **Provider call** — call
   `paymentProviderRegistry.get('lemonsqueezy').createCheckout({...})`
   (PR 1's registry) with:
   - `custom_data`: `{ checkoutIntentId: intent.id, productId:
     intent.productId, channelId: intent.channelId, sourceType:
     intent.sourceType }`
   - `receiptButtonText`, `receiptLinkUrl` from the existing
     `getUiTranslations(intent.locale).dlTitle` pattern
   - `expiresAt`: `now() + 30 minutes` (LS-side expiry)
4. **Update intent** — `status='checkout_created'`,
   `providerCheckoutId=<ls_checkout_id>`, `checkoutUrl=<ls_url>`,
   `recoveryAt=now() + 2 hours + RecoveryPolicy.delayMinutes`
   (if a policy matches; else `recoveryAt=now() + 2 hours`).
5. **Dual-write** — also update the matching
   `AbandonedCheckout` row's `checkoutUrl` (existing behavior;
   the legacy cron reads from this column).
6. **Response** — `200 { id, publicToken, url, recoveryAt }`.

**Rate limiting:** tier `PUBLIC` (100 req/min).

**Why the recovery-window is 2h + delayMinutes, not just 2h:**
the user requested "2h after capture" as the abandoned-cart
detection window. The recovery email itself is sent at
`recoveryAt = now() + 2h + delayMinutes` — the policy's
`delayMinutes` adds an additional grace period before
contacting the customer. A creator who wants "wait 4h before
sending the recovery email" sets `delayMinutes=120` on their
policy.

**Idempotency:** re-calling `/session` with the same intent
returns the existing URL (does NOT create a new LS checkout).
The intent's `providerCheckoutId` is the dedupe key.

---

## 4. Abandoned-cart worker

The current cron at
`src/app/api/cron/abandoned-checkouts/route.ts` is replaced by
a new worker at
`POST /api/internal/jobs/checkout-recovery` (Vercel Cron,
every 5 minutes — slower than the webhook worker because
recovery windows are minutes-to-hours, not seconds).

### 4.1 Detection: `status='checkout_created'` AND `completedOrderId IS NULL` AND `now() - createdAt >= 2 hours`

The 2h window is the abandoned-cart detection threshold —
"the user had 2h to complete the checkout, they didn't, so we
call this abandoned." This is a constant in
`src/lib/commerce/checkout/recovery-policy.ts` (not a config)
because the design rationale (2h matches the LS checkout URL
expiry) is fundamental; per-creator overrides are V2 work.

The query:

```sql
SELECT id FROM "CheckoutIntent"
WHERE status = 'checkout_created'
  AND "completedOrderId" IS NULL
  AND "createdAt" < now() - INTERVAL '2 hours'
  AND "recoveryAt" IS NOT NULL
  AND "recoveryAt" <= now()
  AND "recoverySentAt" IS NULL
ORDER BY "createdAt" ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

(The `recoveryAt IS NOT NULL AND recoveryAt <= now()` clause
encodes "the policy's delay has elapsed AND we haven't sent
yet." If `recoveryAt IS NULL` — the policy returned no
applicable rule — the row is logged for review but not
recovered.)

### 4.2 State transition + outbox event

For each row returned by the query:

1. **Mark as abandoned** — `UPDATE "CheckoutIntent" SET status='abandoned', updatedAt=now() WHERE id=:id AND recoverySentAt IS NULL` (idempotency guard on `recoverySentAt IS NULL`).
2. **Publish outbox event** — `INSERT INTO "OutboxEvent" (eventType='checkout.abandoned', aggregateType='CheckoutIntent', aggregateId=id, payload={intentId, email, productId, creatorId, locale, currency, channelId, sourceType, sourceId, recoveryPolicyId, couponCode})` + `pg_notify('payment_outbox', id)`. The notification consumer (Phase 2) picks this up and sends the recovery email.
3. **Mark recovery sent** — `UPDATE "CheckoutIntent" SET recoverySentAt=now() WHERE id=:id`. The dedupe on `recoverySentAt IS NULL` in the worker query ensures a row is never recovered twice.

### 4.3 Notification consumer

`src/lib/commerce/outbox/consumers.ts` adds:

```typescript
registerConsumer("checkout.abandoned", async (event) => {
  const payload = event.payload as {
    intentId: string;
    email: string;
    productId: string;
    creatorId: string;
    locale: string;
    currency: string;
    recoveryPolicyId?: string;
    couponCode?: string;
  };
  const intent = await prisma.checkoutIntent.findUnique({
    where: { id: payload.intentId },
    include: { product: { select: { slug: true, name: true } } },
  });
  if (!intent) return;
  const couponUrl = payload.couponCode
    ? appendDiscountParam(intent.checkoutUrl, payload.couponCode)
    : intent.checkoutUrl;
  await sendAbandonedCheckoutEmail(
    payload.email,
    intent.product.slug,
    couponUrl,
    payload.locale,
  );
});
```

The `appendDiscountParam` helper handles LS vs Stripe URL
shapes (LS: `&discount=`, Stripe legacy: `?coupon=`) — same
logic as the current `src/app/api/cron/abandoned-checkouts/route.ts`,
extracted into a utility for reuse.

### 4.4 Cron config

`vercel.json` update:

```json
{
  "crons": [
    { "path": "/api/internal/jobs/payment-webhooks",       "schedule": "* * * * *" },
    { "path": "/api/internal/jobs/outbox-dispatch",        "schedule": "* * * * *" },
    { "path": "/api/internal/jobs/checkout-recovery",      "schedule": "*/5 * * * *" }
  ]
}
```

---

## 5. Migration from `AbandonedCheckout`

The migration runs in three steps over one release train:

### 5.1 Step 1 — Add `CheckoutIntent` + dual-write (Day 0)

- Run the migration `prisma/migrations/20260713XXXXXX_phase3_checkout_intent/migration.sql`
  (idempotent CREATE TABLE IF NOT EXISTS for `CheckoutIntent` and
  `RecoveryPolicy`, plus indexes/FKs).
- Update `src/app/api/checkout/route.ts` to ALSO call
  `POST /api/checkout/intents` internally before calling
  `CheckoutService.createCheckout(...)`. (The existing route is
  the single entry point that the landing page uses; it
  transparently dual-writes to both tables.)
- `AbandonedCheckout` continues to be written (existing behavior).

### 5.2 Step 2 — Convert `AbandonedCheckout` rows (Day 0, after Step 1)

- Run `scripts/migrate-abandoned-checkout-to-intent.ts` (a
  one-shot script like `scripts/migrate-grants-from-orders.ts`).
  Idempotent on `(email, productId, provider)`.
- Capture the conversion count in `docs/audit-log.md` (next
  entry after the Phase 2 backfill).

### 5.3 Step 3 — Flip the cron worker (Day 1+)

- Replace the cron worker at
  `src/app/api/cron/abandoned-checkouts/route.ts` with
  `src/app/api/internal/jobs/checkout-recovery/route.ts` (the
  new implementation in § 4).
- The legacy route can stay for one more release as a safety
  net (it reads `AbandonedCheckout`, which is now empty in
  practice) — drop it in Phase 7 cleanup.
- Update `vercel.json` to swap the cron path.

### 5.4 Step 4 — Remove the dual-write in the route (Day 7+)

- After 7d of clean prod (no recovery emails missing),
  remove the `AbandonedCheckout` writes from
  `src/app/api/checkout/route.ts`. The legacy table is
  effectively dead at this point.
- `AbandonedCheckout` itself is dropped in Phase 7 cleanup.

---

## 6. Implementation steps (after the design lands)

In order of dependency:

1. **Schema migration** — `prisma/migrations/20260713XXXXXX_phase3_checkout_intent/migration.sql`
   with idempotent DDL matching the PR 2 / Phase 2 patterns.
2. **Add `CheckoutIntent` to `prisma/schema.prisma`** +
   `prisma db generate` to refresh the client.
3. **RecoveryPolicy resolution helper** at
   `src/lib/commerce/checkout/resolve-recovery-policy.ts` —
   picks the applicable policy from the table based on
   `(productId, locale, isActive, validFrom, validUntil)`.
4. **`POST /api/checkout/intents`** — new route handler.
5. **`POST /api/checkout/intents/:idOrToken/session`** — new
   route handler.
6. **Update `src/app/api/checkout/route.ts`** to dual-write
   `AbandonedCheckout` AND `CheckoutIntent` (Day 0 only).
7. **Recovery worker endpoint** at
   `src/app/api/internal/jobs/checkout-recovery/route.ts`
   (per § 4).
8. **Outbox consumer** `checkout.abandoned` in
   `src/lib/commerce/outbox/consumers.ts` (per § 4.3).
9. **Migration script** `scripts/migrate-abandoned-checkout-to-intent.ts`
   (per § 2.3 + § 5.2).
10. **Tests** — unit tests for the recovery-policy resolver,
    the new endpoints, the worker; integration test for the
    full flow (intent → session → abandoned → recovery email).
11. **Vercel Cron** update (per § 4.4).
12. **Operational runbook** in `docs/runbooks/phase-3-checkout-intent.md`
    (separate doc) — covers the migration flip, dual-write
    audit, recovery policy tuning, and dead-letter recovery
    for `checkout.abandoned` events.

---

## 7. What gets simpler in V2

- Creator admin UI: a `/admin/recovery-policies` page that
  creates/edits policies per product. The Phase 3 backend
  reads from the table; the UI is pure CRUD.
- A/B testing: a `RecoveryPolicy.variant` column + experiment
  assignment at intent creation. Phase 3 hard-codes a single
  policy per (product, locale).
- Multi-touch recovery: a `RecoveryPolicy.maxMessages > 1` with
  a sequence of follow-ups. Phase 3 sends one email at
  `recoveryAt`.
- `sourceType='dm_offer'` validation: Phase 6's PrivateOffer
  flow lands alongside Phase 3's endpoint, but the strict
  auth + product-belongs-to-creator + customer-doesn't-own
  validation is Phase 6 work.

---

## 8. Out of scope for Phase 3

- Per-creator analytics on the intent → session →
  completed funnel. Phase 5 (CustomerProductInsight) covers
  the read model.
- A/B testing of recovery copy. V2.
- The `sourceType='dm_offer'` enforcement. Phase 6.
- `AbandonedCheckout` removal from the schema. Phase 7
  cleanup.
- Coupon redemption. The `Coupon` table exists; V2 may
  integrate it with the checkout flow.

---

## 9. References

- `docs/phase-2-webhook-inbox.md` — the outbox pattern Phase 3
  depends on. The `checkout.abandoned` event is published via
  this mechanism.
- `docs/audit-log.md` — the Phase 2 baseline that the Phase 3
  backfill entry extends.
- `prisma/migrations/20260712230000_add_access_grants/migration.sql`
  — the PR 2 idempotent DDL pattern that Phase 3 mirrors.
- `src/lib/services/checkout-service.ts` (PR 1) — the LS
  provider integration that Phase 3 extends via the
  `paymentProviderRegistry.get('lemonsqueezy')` interface.
- `src/app/api/cron/abandoned-checkouts/route.ts` — the legacy
  cron worker that Phase 3 replaces.
- `src/lib/i18n/locale-resolver.ts` — `getCurrencyFromLocale(locale)`
  helper used in § 3.1.
- `src/lib/services/email.ts` — `sendAbandonedCheckoutEmail` reused
  by the Phase 3 consumer.
- PR 1 (`3c217e2`) — `paymentProviderRegistry` interface.
- PR 2 (`afc288d`) — `AccessGrant` migration pattern.
- PR 3 (`10055b9`) — feature-flag + dual-write cutover pattern
  (Phase 3 uses a similar dual-write for the cron flip in § 5).
- Phase 2 (`ff01efd`) — outbox + PG LISTEN/NOTIFY dispatcher.
