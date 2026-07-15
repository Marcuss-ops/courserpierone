# Lemon Squeezy — Live Store Setup Operator Runbook

> **Scope.** One-shot operator procedure to bring up a Lemon Squeezy (LS) **live** store for the Courssy codebase. Six independent verticals, each wired end-to-end with Vercel env vars: (1) store live activation, (2) products, (3) variants, (4) webhook endpoint, (5) signing secret, (6) custom data fields contract.
>
> **Audience.** Operator flipping the codebase from LS test-mode (staging) to LS live-mode (production) for the V1.x launch. **Read this BEFORE any production deploy** that touches payments.
>
> **Companion runbooks (do not duplicate, link instead):**
> - [`../../scripts/ops/staging-bootstrap.md` §3](../../scripts/ops/staging-bootstrap.md) — LS **test mode** counterpart. This runbook is the live-mode counterpart; structurally identical except for: (a) test/live API key, (b) test/live store ID, (c) test/live webhook secret, (d) test/live variant IDs (different number ranges).
> - [`../../docs/production.md` §2 + §5](../../docs/production.md) — production deploy/rollback + secret rotation tier
> - [`../../docs/ops/supabase-auth-setup.md`](../../docs/ops/supabase-auth-setup.md) — Supabase Auth wiring (cross-cuts with post-purchase auth gating)
> - [`../../docs/production-hardening.md` §5](../../docs/production-hardening.md) — webhook signature verification contract (HMAC + `timingSafeEqual`)
> - [`../../SECURITY.md` §Lemonsqueezy](../../SECURITY.md) — threat model entry for webhook replay attacks
>
> **Source-of-truth env schema:** [`../../src/lib/env.ts` `LEMONSQUEEZY_*`](../../src/lib/env.ts) (`ENV_DEFINITIONS` array — canonical list of every var this runbook wires).
>
> **Source-of-truth contract code:**
> - [`../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts`](../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts) — `createCheckout` is the canonical contract for what custom data is sent to LS.
> - [`../../src/app/api/webhooks/lemonsqueezy/route.ts`](../../src/app/api/webhooks/lemonsqueezy/route.ts) — canonical webhook handler. HMAC verification + idempotency + event-name dispatch (5 events consumed).

---

## TL;DR — Six verticals to bring up

```
┌─ V1: Store live activation ─────  • KYC/KYB + Activate flow (Ledger
│                                    questionnaire, 2-3 business days)
│                                  • Test→Live mode switch (bottom-left
│                                    of LS Dashboard)
│                                  • New store URL/slug/store ID
│
├─ V2: Products ─────────────────  • For each product, create in LIVE
│                                    mode (or "Copy to Live Mode" if
│                                    test-mode product already exists)
│                                  • Status: published (not draft)
│                                  • Generate fresh product IDs (test
│                                    IDs are NOT preserved on copy)
│
├─ V3: Variants ────────────────  • Per-currency/region variants → wire
│                                    to Product.lemonVariantId in DB
│                                  • Copy-to-Live generates NEW variant
│                                    IDs — DB update is mandatory
│                                    (silent drift if forgotten)
│
├─ V4: Webhook endpoint ───────  • POST https://<prod-domain>/
│                                    api/webhooks/lemonsqueezy
│                                  • Subscribe to 5 events:
│                                    order_created, order_refunded,
│                                    subscription_created,
│                                    subscription_cancelled,
│                                    subscription_payment_failed
│                                  • Distinct from staging webhook
│                                    (different signing secret)
│
├─ V5: Signing secret ─────────  • User-defined 6-40 chars (LS Dashboard)
│                                  • HMAC-SHA256 over raw request body,
│                                    compared timing-safely against
│                                    X-Signature header (see route.ts
│                                    L20-40)
│                                  • Vercel Production env holds it
│                                    as LEMONSQUEEZY_WEBHOOK_SECRET
│
└─ V6: Custom data fields ─────  • courseSlug, locale, email, channelId
                                   (canonical 4 sent on every checkout)
                                 • Optional: productSlug (alias for
                                   courseSlug when consumer asks for it)
                                 • Round-trip: LS echoes back via
                                   attributes.first_order_item.
                                   product_options.custom_data (one-time
                                   items) or attributes.custom_data
                                   (subscriptions)
```

After all 6 verticals are wired, run `npm run test:e2e -- tests/e2e/checkout.ls.spec.ts` against the Production deployment to verify the end-to-end signed-webhook → DB row flow. **Plus** a manual 1× real-card purchase per [`../../docs/v1-acceptance-test.md` §1.5](../../docs/v1-acceptance-test.md) before any go-live traffic.

---

## §1 — Store live activation

### 1.1 Activate the LS store

Lemon Squeezy Dashboard → **Settings → Activate your store** (sidebar link).

| Field | Source of value |
| --- | --- |
| Business questionnaire | tax country, registered company name, business type (individual/sole proprietorship/company) |
| Identity verification (KYC/KYB) | government-photo ID + address proof for the beneficial owner; sometimes a bank statement |
| Payout method | bank account in the same legal entity name (or PayPal where LS supports it) |

> ⏱ **Timeline.** LS staff manually reviews KYC/KYB submissions — typical
> turnaround is 2-3 business days. During review, the store is in
> "**Test mode**" only — the toggle at the bottom-left of the Dashboard
> shows `Test` highlighted. After approval, the toggle unlocks `Live` and
> the store gets a `store.{slug}` URL.

> 🔒 **Why KYC/KYB matters.** Until activation, every "test" purchase
> you fire is sandbox-only — no real money moves. But LS still records
> test transactions internally, so the test-mode products carry forward
> to live mode **only when you explicitly "Copy to Live Mode"** on each
> product. This is the core gotcha: test-mode IDs (`Store ID = 1`,
> variant IDs assigned by LS test mode) **do not carry over**.

### 1.2 Toggle Test → Live

After KYC/KYB approval, the toggle in the bottom-left of the LS Dashboard moves from `Test` to `Live`.

```bash
# Sanity via curl: no vendor API exists to introspect this; visual check only.
# Open https://app.lemonsqueezy.com/ in browser, log in, observe the toggle.
```

> ⚠️ **Hard rule.** Once a variant has been "**Copied to Live Mode**"
> (see §3.2), its live-mode variant ID is **a fresh integer assigned by
> LS** — usually one order of magnitude larger than the test-mode ID.
> The codebase's `Product.lemonVariantId` column must be updated to the
> new live ID before any production traffic. §3.3 covers this exact
> drift detection.

### 1.3 Capture store identifier

After Live mode unlocks:

| Field | Where to find it | Wire to env |
| --- | --- | --- |
| **Store ID** | LS Dashboard → Stores → click your LIVE store → Settings → "Store ID" (e.g. `12345`) | `LEMONSQUEEZY_STORE_ID` (Production scope in Vercel) |
| **Store slug** | Same page → "Slug" (e.g. `courssy`) → public URL = `https://store.courssy.com` (LS-hosted storefront) | Informational only (not an env var) |

> Per [`../../docs/production-hardening.md` §row #1](../../docs/production-hardening.md),
> the codebase uses a **flat env model**: `LEMONSQUEEZY_STORE_ID`
> accepts any positive integer. There's NO code path that discriminates
> test-mode store from live-mode store. The test/live separation lives
> entirely in the VERCEL ENVIRONMENT SCOPES (Preview = staging env in
> §3.1 of staging-bootstrap; Production = this runbook).

---

## §2 — Products

### 2.1 Create each product in Live mode

LS Dashboard → Stores → your LIVE store → Products → "**New product**".

| Field | Source / convention |
| --- | --- |
| **Name** | matches the `Product.name` field in the DB (case-sensitive). Render on LS checkout = same as DB. |
| **Description** | matches the lead paragraph of `Product.description` in DB. LS strips HTML; keep plain text. |
| **Price** | matches the canonical `Product.price` (USD cents per base currency). LS UI lets you set per-variant; cover in §3. |
| **Status** | **"Published"** (not "Draft") — draft products don't generate checkout URLs. |
| **Files (digital delivery)** | optional; we don't use LS-hosted file delivery because access is gated by `Order.status === 'completed'` in our app, not by LS |

### 2.2 OR Copy-to-Live from existing test-mode product

If you already have products in test mode (from staging-bootstrap §3.1):

```
LS Dashboard → Products → [test product] → "..." menu → "Copy to Live Mode"
```

This is the easier path **but has critical gotchas**:

1. **The copy creates a NEW LS product with a NEW ID.** The old test-mode product's record remains in test mode but is invisible in live mode. Confusing.
2. **The product's variants are also re-assigned.** §3.2 covers this in detail.
3. **The product's description, name, and files are copied verbatim.** No field re-entry needed, but verify they're still current.
4. **The copy is a one-time operation per product.** Re-running it duplicates the product.

> ✅ Recommended workflow: COPY each test-mode product to live mode
> (keeps DB-side descriptions consistent), then §3.3 walks through the
> variant-ID remapping.

### 2.3 Status: published (NOT draft)

A draft product in LS creates a checkout URL **only for the LS store admin** (you can preview it), but **not for end users**. Until you toggle the product status to "Published", no production traffic can land on it. Verify status visually per product after copy-to-live.

---

## §3 — Variants

### 3.1 What is a variant

A "variant" in LS is a distinct purchasable configuration of a single product. The codebase uses variants to represent **currency/region pricing tiers** (one variant per `CountryCode → Price` mapping the codebase already maintains in `Product.countryOverrides`).

Examples from the DB schema:

```jsonc
// Product.countryOverrides (DB JSON)
{
  "BR": { "currency": "BRL", "price": 9900, "symbol": "R$", "lemonVariantId": "123456" },
  "JP": { "currency": "JPY", "price": 780000, "symbol": "¥", "lemonVariantId": "789012" },
  "EU": { "currency": "EUR", "price": 5400, "lemonVariantId": "345678" }
}
```

LS rejects a checkout if the customer hits a variant for a price that doesn't match what `Product.countryOverrides` declares. Drift here = silent breakage: the LS checkout opens, the customer enters card details, and LS rejects with a 422 on the price mismatch.

### 3.2 Create variants per pricing tier

For each `Product.countryOverrides` entry:

```
LS Dashboard → Stores → [LIVE store] → Products → [product] → Variants → "New variant"
```

| Field | Value |
| --- | --- |
| **Name** | human-readable tier name (e.g. "EU/USD", "BR/BRL", "JP/JPY") |
| **Price** | the price number from `countryOverrides.{country}.price` (in **whole currency units**, NOT cents — LS UI takes whole units, divide the cents value by 100) |
| **Currency** | from `countryOverrides.{country}.currency` |
| **Description** | optional — keep blank unless the tier has notable differences (e.g. "VAT included for EU") |
| **Status** | Published (same rule as products — draft = no checkout URL) |

After saving, LS shows the **Variant ID** at the bottom of the variant page (a numeric integer, e.g. `123456`). Copy this into `Product.countryOverrides.{country}.lemonVariantId` (and into `Product.pricesByCurrency.{currency}.lemonVariantId` if you use the per-currency map).

### 3.3 Critical: variant ID drift on Copy-to-Live

**The most common operator pitfall on LS live-mode setup**: after using "Copy to Live Mode" on a test-mode product, **every variant gets a NEW ID**, but the DB still has the OLD ID. The codebase's `OrderService.resolveProduct({ variantId })` lookup will silently miss (returning `null`), and the LS webhook will fire `no_completed_order_for_student` denials.

Mitigation procedure (run after every Copy-to-Live):

```bash
# 1. List all variants on the live product (LS Dashboard per §3.2 above).
#    Write down the new live IDs matching each CountryCode.

# 2. Update the DB. Either:
#    a) Admin panel per product (manual, slow but traceable)
#    b) Direct SQL (bulk, requires care):
psql "$DIRECT_URL" -c "
  UPDATE \"Product\"
  SET country_overrides = jsonb_set(
    country_overrides,
    '{BR,lemonVariantId}',
    '\"<NEW-LIVE-BR-variant-id>\"'
  )
  WHERE slug IN ('<product-slug-1>', '<product-slug-2>');
"
# (Repeat per CountryCode per Product.)

# 3. Verify no drift remains:
psql "$DIRECT_URL" -c "
  SELECT slug, country_overrides
  FROM \"Product\"
  WHERE country_overrides IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM jsonb_each(country_overrides) AS kv
      WHERE kv.value->>'lemonVariantId' IS NULL
    );
"
# Expected: zero rows (i.e., no product has a CountryCode without a lemonVariantId).
```

If variant IDs drift, the webhook handler's `OrderService.resolveProduct` throws `NotFoundError`, and the handler responds `200 OK` (acknowledged-but-not-processed) per [`../../src/app/api/webhooks/lemonsqueezy/route.ts` 200/404 contract](../../src/app/api/webhooks/lemonsqueezy/route.ts) — **silently swallowing the order**. Operators won't see the failure unless they tail Vercel logs for `[LS Webhook] order_created received id=…` followed by NO DB write.

### 3.4 Default fallback (`Product.lemonVariantId` column)

The DB also has a top-level `Product.lemonVariantId` column (separate from `countryOverrides`). This is the **fallback variant** used when no `countryOverrides` key matches the buyer's country code. Set it to the default currency variant (typically USD or EUR):

```bash
psql "$DIRECT_URL" -c "
  UPDATE \"Product\" SET \"lemonVariantId\" = '<DEFAULT-VARIANT-ID>'
  WHERE slug = '<product-slug>';
"
```

The provider code ([`../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts` L51](../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts)) reads `pricing.lemonVariantId`, which `PricingService` resolves as: `countryOverrides[country].lemonVariantId ?? lemonVariantId` — so the fallback only kicks in for unmapped countries.

---

## §4 — Webhook endpoint

### 4.1 Create the webhook

LS Dashboard → **Settings → Webhooks → "Create webhook"**.

| Field | Value |
| --- | --- |
| **Webhook URL** | `https://<production-domain>/api/webhooks/lemonsqueezy` — **NOT** the staging URL. Per [`../../scripts/ops/staging-bootstrap.md` §3.2](../../scripts/ops/staging-bootstrap.md), staging uses the Vercel Preview URL; live uses the custom production domain. |
| **Signing secret** | user-defined, **6-40 characters** (LS UI enforces). Copy to Vercel Production env as `LEMONSQUEEZY_WEBHOOK_SECRET`. Keep a SECOND copy in 1Password (it's the only thing that authenticates webhooks). |

### 4.2 Subscribe to the canonical 5 events

The handler in [`../../src/app/api/webhooks/lemonsqueezy/route.ts`](../../src/app/api/webhooks/lemonsqueezy/route.ts) consumes exactly **five** events. Subscribe to all five — anything LS sends that we don't handle is silently acknowledged (returns `200 received:true`) without side effects:

| Event | Handler behavior | DB side effect |
| --- | --- | --- |
| `order_created` | `processOrder(...)` (one-time purchase) | INSERT `Order { status: 'completed' }` + create `AccessGrant` + send purchase email |
| `subscription_created` | `processOrder(...)` (recurring billing treated as single Order per period) | INSERT `Order { status: 'completed' }` per billing period |
| `order_refunded` | `prisma.order.updateMany({ ... status: 'refunded' })` (only completed orders) | UPDATE `Order.status = 'refunded'` → auto-revoke access (Phase 7+) |
| `subscription_cancelled` | `prisma.order.updateMany({ ... status: 'failed' })` (only completed orders) | UPDATE `Order.status = 'failed'` → auto-revoke access |
| `subscription_payment_failed` | `prisma.order.updateMany({ ... status: 'failed' })` (only completed orders) | UPDATE `Order.status = 'failed'` → auto-revoke access |

> ⚠️ Do NOT subscribe to events the handler doesn't know about (LS
> 2025 added `subscription_resumed`, `subscription_updated`, etc.).
> Subscribing means LS fires payloads that the handler acknowledges
> without processing — wasted vendor traffic + Vercel function invocations
> + logs.

### 4.3 Webhook URL is the contract boundary

The webhook URL in the LS Dashboard must be **byte-exact** with the route in the codebase. Any typo (trailing slash, wrong subdomain, `https` vs `http`) means LS fires correctly, but our server returns `404 not found`, and LS retries 16 times over 24 hours before giving up.

Verification step (after creating the webhook):

```bash
# Use the LS dashboard's "Send test event" feature to fire a test
# order_created event. Verify in Vercel Logs:
#   POST /api/webhooks/lemonsqueezy → 200, log "[LS Webhook] order_created"
```

### 4.4 Idempotency contract

The handler uses **`LS-{data.id}-{event_name}`** as the composite `deliveryId` for the `Prisma.processedWebhook` table. Concurrent retries from LS (it retries on non-2xx) hit the unique-key constraint and are silently acknowledged. **Don't** rely on LS's own retry metadata — always use the composite. Per [`../../src/app/api/webhooks/lemonsqueezy/route.ts` L46-58](../../src/app/api/webhooks/lemonsqueezy/route.ts).

---

## §5 — Signing secret

### 5.1 Generate at webhook creation

When you §4.1 create the webhook in LS Dashboard, you define a signing secret. The rules:

| Constraint | What LS enforces |
| --- | --- |
| Length | 6–40 characters (inclusive) |
| Character set | any printable ASCII (we use 32-char hex from `openssl rand -hex 16`) |
| Visibility | shown ONCE in the LS UI after creation; not retrievable later. **Save to 1Password immediately.** |
| Rotation | regenerating creates a NEW webhook with the NEW secret — there is no "rotate in place" affordance. The old webhook must be deleted manually after the new one is confirmed working. |

### 5.2 Wire to Vercel Production env

| Vercel setting | Value |
| --- | --- |
| Variable name | `LEMONSQUEEZY_WEBHOOK_SECRET` |
| Scope | **Production only** (NOT Preview — staging has its own signing secret per [`../../scripts/ops/staging-bootstrap.md` §3.2](../../scripts/ops/staging-bootstrap.md)) |
| Value | the signing secret from §5.1 (verbatim, including any special chars; LS does NOT base64-encode) |

### 5.3 How the handler verifies

The handler at [`../../src/app/api/webhooks/lemonsqueezy/route.ts` L19-37](../../src/app/api/webhooks/lemonsqueezy/route.ts):

1. Reads `LEMONSQUEEZY_WEBHOOK_SECRET` from `process.env`.
2. Reads `x-signature` header (LS puts the HMAC hex digest).
3. Computes `crypto.createHmac('sha256', secret).update(body).digest('hex')` on the **raw** request body (NOT the parsed JSON — secret must be over the byte-exact body).
4. Compares with **`crypto.timingSafeEqual`** (prevents timing attacks).
5. Returns `400 Invalid signature` on mismatch.

> **Critical:** the comparison is **constant-time**. If you ever see
> `==` or `===` in place of `timingSafeEqual` here, that's a CVE — the
> handler accepts timing-attack fingerprintable signatures. Don't
> introduce such a refactor without coordinating with
> [`../../docs/production-hardening.md` §5](../../docs/production-hardening.md).

### 5.4 Secret rotation procedure

When you suspect compromise or every 365 days (per [`../../SECURITY.md` §Rotation tier](../../SECURITY.md)):

| Step | Action |
| --- | --- |
| 1 | LS Dashboard → Webhooks → "New webhook" with a NEW signing secret (any 32-char hex string from `openssl rand -hex 16`). |
| 2 | **Delete the old webhook** (so only the new one exists in LS). |
| 3 | Vercel → Project → Settings → Environment Variables → `LEMONSQUEEZY_WEBHOOK_SECRET`. Paste the NEW secret into Production scope. |
| 4 | Vercel redeploy (functions otherwise keep the old env cached). |
| 5 | Smoke-test fire from the new webhook — verify Vercel logs `[LS Webhook] order_created`. Overwrite 1Password entry with the new secret (mark "rotated on {date}"). |

This procedure avoids the dual-key window entirely: between steps 2 and 4 **NO webhook is wired** (LS holds retries internally, the codebase returns 5xx without HMAC for any new signers). For non-critical-seconds rotations (scheduled 365-day hygiene), this is the correct trade-off. For **active compromise recovery** where the old webhook MUST stay valid during the rotation, the dual-key pattern is documented at [`../../SECURITY.md` §Compromise rotation](../../SECURITY.md) — coordinate with security-lead before invoking.

---

## §6 — Custom data fields (the application contract)

### 6.1 The four canonical fields

The provider at [`../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts` L57-61](../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts) sets the following custom data on every checkout:

```ts
const customData: Record<string, string> = {
  courseSlug: product.slug,           // canonical — round-tripped to webhook
  locale,                             // e.g. "it-it", "en-us"
};
if (userEmail) customData.email = userEmail;
if (channelId) customData.channelId = channelId;
```

→ **`courseSlug`** (canonical string), **`locale`** (canonical string), **`email`** (optional, only if pre-checkout captured), **`channelId`** (optional, only if YouTube attribution).

These are the **only** fields the codebase sets **inside `customData`** (the application-controlled bucket LS echoes back on the webhook). The provider ALSO sets `checkoutData.discountCode` (LS's own vendor-controlled discount-code field, distinct from `customData` — see [`../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts` L65-67](../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts)). Operators should NOT add new fields inside `customData` without coordinating with the team that owns `processOrder` ([`../../src/lib/services/order-service.ts` L13-39](../../src/lib/services/order-service.ts)) to read them — fields that are sent-but-not-consumed are harmless but waste LS payload bytes.

### 6.2 One-time items vs subscriptions

LS delivers the custom data via different paths depending on the payload type:

| Item type | Webhook event | Custom data path |
| --- | --- | --- |
| One-time purchase | `order_created` | `attributes.first_order_item.product_options.custom_data` |
| Subscription | `subscription_created` / `*_cancelled` / `payment_failed` | `attributes.custom_data` (note: NOT under `first_order_item`) |

The handler at route.ts L65-69 / L113-114 already mirrors both paths, but each handles them independently. **Don't** consolidate without checking both branches survive.

### 6.3 Round-trip semantics

Field name in customData → field name in webhook payload → DB column read by `processOrder`:

| customData key | Webhook payload path | DB read |
| --- | --- | --- |
| `courseSlug` | `attributes.first_order_item.product_options.custom_data.courseSlug` OR `attributes.custom_data.courseSlug` (subscriptions) | `OrderService.resolveProduct({ productSlug })` → `Product.slug` × `Order.productId` FK |
| `locale` | same path as `courseSlug` | `processOrder({ locale })` → `Order.locale` |
| `email` | (only sent if pre-checkout captured; LS overrides with buyer's actual email in the webhook payload anyway) | `processOrder({ email })` → `Order.user.email` (or fallback to direct email if user doesn't exist) |
| `channelId` | same path as `courseSlug` | `processOrder({ channelId })` → `Order.channelId` |

> ⚠️ **Symmetry invariant:** if you rename `courseSlug` in the
> provider (line 57), you MUST also rename the read in `processOrder`
> ([order-service.ts consumer](../../src/lib/services/order-service.ts)
> at L13+). Asymmetric renames cause `OrderService.resolveProduct` to
> receive `productSlug=undefined` and fall back to `slug→variantId`
> lookups — silently different code paths, hard to diagnose.

### 6.4 Aliases (courseSlug vs productSlug)

The provider sets `courseSlug`. The handler at route.ts L73 accepts `customData.productSlug` as a fallback alias:

```ts
const productSlug = customData.courseSlug ?? customData.productSlug ?? "";
```

**Both** keys reach `processOrder` as `productSlug`. The alias is intentional: future operators may rename `courseSlug → productSlug` for clarity (the DB column is `Product.slug`, not `Product.courseSlug`); the alias keeps the rename reversible.

> Decision-time: **keep both keys** in the contract. Operators adding
> a NEW custom field should set the field directly (no aliases) — the
> alias pattern is reserved for the canonical-contract renames only.

### 6.5 What's NOT in customData (yet)

The codebase doesn't set any of the following on checkout. If your operator wants to add them, coordinate with the team that owns `processOrder`:

| Hypothetical field | Use case | Why not set today |
| --- | --- | --- |
| `affiliateCode` | referral attribution | Phase 5+ post-V1.2 (per [`../../docs/roadmap-current.md`](../../docs/roadmap-current.md)) |
| `couponCode` | discount tracking | passed via LS's own `discountCode` field (not customData) at provider L66 |
| `campaignId` | marketing attribution | Phase 5+ post-V1.2 |
| `variant` (replaces productSlug) | renaming the canonical key | coordinated rename via §6.4 |

Adding new fields BEFORE the webhook consumer reads them is wasted payload. Ask the team before adding.

---

## §7 — Verification

### 7.1 LS Dashboard → Send test event

Per-product, per-variant test:

```
LS Dashboard → Stores → [LIVE store] → Products → [product] → Variants → [variant] → "Send test event" → "Order created"
```

Expect in Vercel logs (Production environment, real-time filter for `/api/webhooks/lemonsqueezy`):

```
[LS Webhook] order_created: <numeric-id>, email: <expected-test-email>
```

### 7.2 Verify a real-card purchase (V1 V&V criterion #5)

Per [`../../docs/v1-acceptance-test.md` §1.5 criterion #5](../../docs/v1-acceptance-test.md): **a 1× real-card purchase** is the V1 V&V gate. This is **not** automatable — the operator clicks through:

1. Visit `https://<production-domain>/<locale>/<product-slug>`.
2. Click CTA — LS checkout opens with the live variant pre-selected.
3. Use a personal real card (not test mode). LS charges ~$1.
4. Verify Vercel logs `[LS Webhook] order_created` + LS Dashboard → Orders shows the order.
5. Verify DB shows the new `Order { status: 'completed' }` row.
6. Verify the buyer receives the purchase-confirm email (per §6.5 of staging-bootstrap, check `src/lib/services/email.ts` for the localized template).
7. **Refund via LS Dashboard** (this exercises §4.2 the `order_refunded` event). Verify the DB row's `status` flips to `refunded` and the `AccessGrant` is revoked within 1 polling cycle (per Phase 7).
8. **Repeat for at least 3 products** (each per `Product.countryOverrides` country tier + USD fallback) to exercise the variant-routing code path.

> This manual step is the bottleneck of V1 V&V. Plan for ≥1 calendar day
> end-to-end per product. **Buffer this in your launch timeline.**

### 7.3 End-to-end via `npm run test:e2e`

```bash
npx playwright test tests/e2e/checkout.ls.spec.ts \
  --project=chromium \
  LEMONSQUEEZY_API_KEY='<live-key>' \
  LEMONSQUEEZY_STORE_ID='<live-store-id>' \
  LEMONSQUEEZY_WEBHOOK_SECRET='<live-webhook-secret>' \
  TEST_DATABASE_URL='<direct-against-prod-DB>' \
  NEXT_PUBLIC_APP_URL='https://<production-domain>'

# Expected: 1 test passing (the LS purchase flow).
```

> ⚠️ For V&V runs you use the **LIVE** key/store/secret, but the
> `tests/e2e/checkout.ls.spec.ts` body signs a synthetic webhook with
> a `secret=LEMONSQUEEZY_WEBHOOK_SECRET`. Verify the LS Dashboard's
> "Send test event" feature is toggled to your LIVE webhook before
> running the e2e.

### 7.4 Health endpoint cross-check (lightweight)

```bash
curl -sS 'https://<production-domain>/api/health' | jq
# Expected: { ok: true, services: { database: { status: "up" } } }.
# The /api/health endpoint does NOT include LS in its services map
# (LS has no inline ping — it surfaces via webhook delivery).
```

---

## §8 — Common failure modes

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Product creates checkout URL in test mode but not in live | Test-mode store is fine, but the LIVE product is "Draft" (not "Published") | §2.3 — toggle product status to "Published" in the LIVE store |
| Buyer pays, but DB never shows the order | LS webhook is firing to the staging URL (or vice versa). Alternatively: webhook signing secret mismatch. | §4.3 — verify webhook URL is byte-exact. §5.4 — verify Vercel Production env's `LEMONSQUEEZY_WEBHOOK_SECRET` matches the LS webhook's secret. |
| `OrderService.resolveProduct` throws `NotFoundError` for an order that LS clearly fired | **`Product.lemonVariantId` not updated after Copy-to-Live (§3.3)**. The TEST variant ID is still in the DB. | §3.3 — Update `Product.countryOverrides.*.lemonVariantId` → live variant IDs. Plus update top-level `Product.lemonVariantId` fallback (§3.4). |
| Vercel logs show `[LS Webhook] order_created` followed by NO DB row | The `processOrder(...)` call threw → handler returned `200` due to NotFoundError/ValidationError acknowledgement at route.ts L173-176. **Silent business error.** | Inspect Vercel logs for `[LS Webhook]` stack traces; most common cause is `Product.countryOverrides` drift (see row above) or `courseSlug` mismatch (rare). |
| `createCheckout` returns 400 from `LemonSqueezyPaymentProvider` | Either: (a) `pricing.lemonVariantId` is null, or (b) the variant ID is parseInt-failing (NaN) | (a) §3.3 — wire variant ID. (b) verify the column type — should be `String?`, not `String`. |
| LS charges the buyer twice | Duplicate LS-side checkout session because the LS redirect URL got hit twice (e.g., buyer refreshes the page). | Add a single-flight guard in the page that initiates checkout (not in this runbook's scope). LS-side checkout-with-existing-cart isn't idempotent. Log this for the frontend team. |
| LS webhook 401 "invalid signature" (production) | `LEMONSQUEEZY_WEBHOOK_SECRET` in Production env doesn't match the LS webhook's actual signing secret | §5.4 — re-create the LS webhook and re-paste the secret. |
| LS webhook 404 (production) | Routing domain mismatch — LS is firing at staging URL, not production URL | §4.1 — verify webhook URL is `https://<production-domain>/api/webhooks/lemonsqueezy`, NOT the Vercel Preview URL. |
| Live-mode checkout succeeds but access doesn't unlock | `Order.status` is `'completed'` but `AccessGrant` was never created (Phase 7 resolver not yet flipped) | §6 of staking-bootstrap cross-link: `USE_ACCESS_GRANT_RESOLVER=true` once rollout cadence (1d zero denies in staging → 7d monitoring → flip prod → monitor 7d → remove legacy read) is satisfied per env.ts L130 |
| LS sends event but handler returns 500 (not 4xx) | Transient upstream error (ECONNREFUSED/timeout). LS retries 16 times over 24h. | Inspect Vercel logs for the actual error; usually it's a transient Supabase or SMTP issue. The handler returns 503 (line 168) which LS retries correctly. |
| After Copy-to-Live, the live product's variant list is empty | Copy-to-Live bug in LS UI (rare, ~1/100 copies). Re-copy and verify. | LS Dashboard → product → Variants. If empty, redo Copy-to-Live. |
| Live store ID fetched, but buyer hits 422 on LS checkout | Variant price mismatch — DB has cents-equivalent price, LS variant has whole-units price, and the conversion is wrong | §3.2 — divide cents by 100 when entering LS UI. |

---

## §9 — Operational hygiene

### 9.1 Secret rotation tier (per `SECURITY.md`)

Per [`../../SECURITY.md` §Lemonsqueezy](../../SECURITY.md) and [`../../docs/production.md` §5](../../docs/production.md):

| Secret | Tier | Rotation cadence | Hot rotation procedure |
| --- | --- | --- | --- |
| `LEMONSQUEEZY_API_KEY` | **Required (payments)** — rapid-blast radius (every webhook hits LS API with this) | 365 d or on compromise | §9.2 below |
| `LEMONSQUEEZY_STORE_ID` | Low-entropy (no secret — it's a public ID) | rotate only on store transfer | N/A — just update env |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | **Required (payments)** — replay-attack lever | 365 d or on compromise | §5.4 above |

### 9.2 Live API key rotation

1. Create a NEW API key in LS Dashboard → Settings → API. Label it (`prod-key-{year}-{month}`).
2. Paste into Vercel env `LEMONSQUEEZY_API_KEY` (Production scope).
3. Vercel redeploy.
4. **Smoke-test** a real-card purchase (per §7.2 first two steps only — don't need the refund).
5. **Delete the OLD API key** in LS Dashboard.
6. Update 1Password (new entry, archive old with rotation date).

> The hot-rotation window (between steps 2 and 4) has BOTH keys valid.
> During this window, requests from the codebase can use either. **Don't
> delete the old key before step 4 — order swaps matter for in-flight
> requests.**

### 9.3 Cross-env audit (quarterly)

Per [`../../scripts/ops/staging-bootstrap.md` §8.1](../../scripts/ops/staging-bootstrap.md) (same quarterly cadence):

```bash
# 1. Verify env scoping
npx vercel env ls | grep -E 'LEMONSQUEEZY_'
# All LEMONSQUEEZY_* lines should appear under Production scope, with
# staging duplicates under Preview.

# 2. Verify LS Dashboard variant IDs match DB
psql "$DIRECT_URL" -t -A -F '|' -c "
  SELECT slug, country_overrides::text
  FROM \"Product\"
  WHERE country_overrides IS NOT NULL
  ORDER BY slug;
" > /tmp/db-variants.txt
# Manually cross-check each ID against LS Dashboard. Drift = §3.3.

# 3. Verify webhook health
curl -sS 'https://<production-domain>/api/health' | jq
```

### 9.4 What this runbook does NOT cover

| Topic | See |
| --- | --- |
| **LS test mode** setup | [`../../scripts/ops/staging-bootstrap.md` §3](../../scripts/ops/staging-bootstrap.md) |
| **Vercel Production env wiring** (other env vars beyond LEMONSQUEEZY_*) | [`../../docs/production.md` §2](../../docs/production.md) |
| **Legacy payment cleanup** | [`../../docs/roadmap-current.md`](../../docs/roadmap-current.md) |
| **Subscriptions-as-product** (V1.x sells single-shot; subscriptions are post-V1.2) | roadmap §1.2 |
| **Discount codes** (passed via LS's `discountCode` field, not customData) | [`../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts` L66](../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts) |
| **Refunds via admin panel** (vs LS-dashboard-driven refunds) | admin/products per-Order refund UI, post-V1.2 |
| **DR/backup for live-store data** | LS handles their own DR; our DR is just the DB-side `Order` rows + `AccessGrant` rows, which Supabase PITR covers |

---

## §10 — Cross-references

| Topic | See |
| --- | --- |
| LS test mode (parallel structure, test-mode-only concerns) | [`../../scripts/ops/staging-bootstrap.md` §3](../../scripts/ops/staging-bootstrap.md) |
| Production deploy / rollback | [`../../docs/production.md`](../../docs/production.md) |
| Production-hardening gap analysis (HMAC + flat-env model justification) | [`../../docs/production-hardening.md` §5](../../docs/production-hardening.md) |
| Source-of-truth env schema | [`../../src/lib/env.ts` `LEMONSQUEEZY_*`](../../src/lib/env.ts) |
| LS webhook handler (canonical contract) | [`../../src/app/api/webhooks/lemonsqueezy/route.ts`](../../src/app/api/webhooks/lemonsqueezy/route.ts) |
| LS provider implementation (canonical customData set) | [`../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts`](../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts) |
| OrderService contract (consumes LS customData → writes Order/AccessGrant) | [`../../src/lib/services/order-service.ts`](../../src/lib/services/order-service.ts) |
| Threat model + RBAC + secret rotation tier | [`../../SECURITY.md`](../../SECURITY.md) |
| Test mode → Live mode flip (route map) | [`../../docs/v1-acceptance-test.md` §1.5](../../docs/v1-acceptance-test.md) |
| LS Copy-to-Live product UX documentation (vendor) | [Lemon Squeezy — Copy to Live Mode](https://docs.lemonsqueezy.com/help/products/copy-to-live-mode) |
| LS Webhook signing reference (vendor) | [Lemon Squeezy — Signing Requests](https://docs.lemonsqueezy.com/help/webhooks/signing-requests) |
| LS Pass Custom Data reference (vendor) | [Lemon Squeezy — Passing Custom Data](https://docs.lemonsqueezy.com/help/checkout/passing-custom-data) |

---

## Document control

| Field | Value |
| --- | --- |
| First written | FASE 3.2 (this runbook) |
| Source of truth for each vertical | Lemon Squeezy Dashboard (live mode) — this runbook is the **procedural mirror** |
| Cross-checked against | [`../../scripts/ops/staging-bootstrap.md`](../../scripts/ops/staging-bootstrap.md) (test-mode counterpart), [`../../docs/production.md`](../../docs/production.md) (deploy/rollback), [`../../docs/production-hardening.md`](../../docs/production-hardening.md) (HMAC contract), [`../../src/lib/env.ts`](../../src/lib/env.ts) (env schema), [`../../src/app/api/webhooks/lemonsqueezy/route.ts`](../../src/app/api/webhooks/lemonsqueezy/route.ts) (handler contract), [`../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts`](../../src/lib/commerce/payments/providers/lemonsqueezy/index.ts) (customData set), [`../../src/lib/services/order-service.ts`](../../src/lib/services/order-service.ts) (customData consumer), [`../../SECURITY.md`](../../SECURITY.md) (rotation tier) |
| Maintainer | payments-lead (TBD) |
| Review cadence | quarterly audit (per §9.3); immediate update on any LS vendor change (new event types, dashboard overhaul, KYC flow changes); tight coupling to staging-bootstrap.md §3 — keep both in sync |
