# Phase 6 — PrivateOffer in chat (LS overlay)

> **Status:** design — not yet implemented.
> **Owner:** TBD.
> **Goal:** a creator can send a one-off discount offer to a customer
> via the existing DM chat; the customer sees an inline card with a
> "Acquista con sconto" button that opens the Lemon Squeezy hosted
> checkout overlay (the LS URL rendered in an iframe modal); on
> payment, the webhook handler closes the loop with a system
> message, an `AccessGrant` (PR 2), and a `PrivateOffer.status='purchased'`
> update.
>
> **Source-of-truth refactor:** the customer-pays-via-DM flow currently
> doesn't exist — the only path to access is the public landing page
> (Phase 3's `CheckoutIntent` with `sourceType='landing'`). Phase 6
> adds the `sourceType='dm_offer'` path, with the `PrivateOffer` row
> as the bridge between the chat and the checkout.
>
> **Migration strategy:** additive. The existing `Message` model
> gains optional `type`, `offerId`, `metadata` columns. The
> `PrivateOffer` and `MessageOffer` tables are new. No data
> backfill is needed (the V1.5 minimum is forward-only — old chats
> continue to work with the default `type='text'`).
>
> **Relationship to prior phases:**
> - PR 2 (`afc288d`) — `AccessGrant` is the access record written on
>   purchase. The `PrivateOffer.purchased` path reuses the existing
>   `processOrder` flow.
> - PR 3 (`10055b9`) — `MessagingDenyReason.NoValidAccessGrant` is
>   the canonical deny reason when a customer without a grant tries
>   to DM a creator on a product. The Phase 6 endpoint accepts this
>   reason as the "valid auth" check.
> - Phase 2 (`ff01efd`) — the webhook inbox + outbox pattern. The
>   `applyPaymentEvent` canonical command is the same one the
>   `PrivateOffer.purchased` flow calls. The LS provider's
>   `parseWebhook` is extended (not replaced) to carry the new
>   `custom.privateOfferId` / `custom.checkoutIntentId` fields.
> - Phase 3 (`27ef1c9`) — the `CheckoutIntent` model already has
>   `sourceType='dm_offer'` and `sourceId='<privateOfferId>'` as
>   reserved values. Phase 6 fills those in. The
>   `/api/checkout/intents/:idOrToken/session` endpoint is
>   extended to call the Phase 6 PrivateOffer update when
>   `sourceType='dm_offer'` (status='opened' transition).
> - Phase 5 (`d4e2b49`) — the `CustomerProductInsight.lifetimeValueCents`
>   is incremented by the existing `processOrder` path; no Phase 6
>   changes are needed to Phase 5.

---

## 1. Motivation

The current creator↔customer flow has a gap: a creator who wants
to give a one-off discount (say, "I'll give you 30% off if you buy
today") has no native way to do it in-product. The workarounds are:

1. **Send a plain message** with a manually crafted coupon code.
   Problem: no UI for the customer to click-to-checkout. They have
   to copy the code, navigate to the public landing page, paste the
   code in the LS checkout. Most won't bother.
2. **Use the LS-hosted discount link.** LS supports a `?discount=`
   URL param, but the creator can't send a "this discount is for
   YOU only" link — the link works for anyone who has it.
3. **Manual reconciliation.** The creator creates the LS checkout
   with a per-customer discount in the LS dashboard, sends the URL
   via DM, and manually confirms the order on the LS side. Problem:
   the LS-side discount has to be set up per-customer, and the
   LS-hosted discount link has the same issue as (2).

Phase 6 fixes all three with a single `PrivateOffer` model that
ties a chat message to a checkout intent to a discount code, all
scoped to a single (creator, customer, product) tuple. The
customer clicks an inline card in the chat, an LS overlay opens,
and the purchase flows through the existing `processOrder` path
with `sourceType='dm_offer'` for attribution.

---

## 2. Schema

### 2.1 `PrivateOffer`

The offer record. Created when a creator clicks "Invia offerta" in
the chat composer; the offer becomes visible to the customer as an
inline card when the offer's `Message` is sent.

```prisma
model PrivateOffer {
  id                 String   @id @default(cuid())

  // Conversation context
  // The conversation that this offer is attached to. The creator
  // can only send offers in conversations where they are the
  // creator-side (userOne or userTwo = creatorId) and the customer
  // is the other side. Validated in § 3 step (a).
  conversationId     String
  creatorId          String   // denormalized for inbox RLS (Phase 5)
  customerId         String   // the other party in the conversation

  // Product being offered
  productId          String
  locale             String   // BCP-47 tag at offer time ("it-it")
  currency           String   // "eur" | "usd" | ... — must match product

  // Discount
  // The Coupon row applied to this offer. The Coupon's
  // `maxUses`, `expiresAt`, `isActive` are the source of truth
  // for authorization. PrivateOffer doesn't store the discount
  // percentage directly — it references the Coupon by code so
  // changing the coupon's value automatically applies to new
  // checkouts.
  discountCode       String?

  // Provider state (set by /api/checkout/intents/:id/session when
  // the customer clicks the card)
  checkoutIntentId   String?  // CheckoutIntent.id (Phase 3)
  providerCheckoutId String?  // LS checkout session id
  checkoutUrl        String?  // LS hosted-checkout URL (the overlay's src)

  // State machine — see § 2.4 for transitions
  status             String   @default("draft")
                          // draft      — creator composed, not yet sent
                          // sent       — Message(type='checkout_offer') was created
                          // opened     — customer clicked the card; LS overlay loaded
                          // purchased  — webhook fired successfully
                          // expired    — expiresAt passed without purchase
                          // revoked    — creator explicitly cancelled

  // Expiry
  // The offer is no longer valid after this timestamp. Default 7d
  // from `sent` (configurable per-creator in V2). The cron worker
  // transitions draft|sent|opened → expired when expiresAt < now().
  expiresAt          DateTime

  // Set on purchase — back-pointer to the canonical Order.
  purchasedOrderId   String?  @unique  // one offer → one order, by design

  // Audit
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  sentAt             DateTime?  // when status transitioned to 'sent'
  openedAt           DateTime?  // when status transitioned to 'opened'
  purchasedAt        DateTime?  // when status transitioned to 'purchased'
  revokedAt          DateTime?  // when status transitioned to 'revoked'

  conversation  Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  creator       User          @relation("CreatorOffers", fields: [creatorId], references: [id], onDelete: Restrict)
  customer      User          @relation("CustomerOffers", fields: [customerId], references: [id], onDelete: Cascade)
  product       Product       @relation(fields: [productId], references: [id], onDelete: Restrict)
  checkoutIntent CheckoutIntent? @relation(fields: [checkoutIntentId], references: [id], onDelete: SetNull)
  order         Order?        @relation(fields: [purchasedOrderId], references: [id], onDelete: SetNull)
  messages      Message[]     @relation("OfferMessages")  // back-pointer for Message.offerId

  // Partial unique index (added in the migration, NOT a Prisma
  // @@unique — see § 2.3): at most ONE active offer per conversation
  // at any time. "Active" = status IN ('draft', 'sent', 'opened').
  // Historical offers (purchased, expired, revoked) are NOT
  // constrained — a conversation can have many historical offers
  // but only one pending.
  @@index([creatorId, status])         // creator-side "my pending offers" query
  @@index([customerId, status])       // customer-side inbox badge
  @@index([status, expiresAt])         // cron worker: scan for expired offers
}
```

**Why a partial unique index (not `@@unique([conversationId,
status])`):** the user wants "one ACTIVE offer per conversation."
A `@@unique([conversationId, status])` would allow 1×draft +
1×sent + 1×opened + 1×purchased + 1×expired simultaneously on
the same conversation — the wrong cardinality. The partial
unique index is the correct PG construct:
`CREATE UNIQUE INDEX ... ON "PrivateOffer" ("conversationId")
WHERE status IN ('draft', 'sent', 'opened')`. Prisma's
`@@unique` doesn't support partial indexes, so the index is
added in the migration DDL (§ 2.3) rather than the schema.
The migration is idempotent via `CREATE UNIQUE INDEX IF NOT
EXISTS`.

**Why `purchasedOrderId` is `@unique`:** an offer maps to at most
one order. If the customer refunds and re-purchases (different
Order.id), the offer stays purchased with the original order;
the re-purchase creates a new offer (V2 addendum: "renew offer"
action). For V1.5, the one-to-one mapping is the right
constraint.

**Why `sentAt`/`openedAt`/`purchasedAt`/`revokedAt` are separate
timestamps:** analytics — "how long does it take for a customer
to open an offer?" is a leading indicator of offer relevance.
A single `updatedAt` doesn't capture the transition timing.

**Why `onDelete: Restrict` on `creator` and `product`:** the
PrivateOffer is a commercial record. Deleting a creator or
product should not silently drop the offer (same as AccessGrant's
Restrict). Use an explicit cleanup query in V2 if needed.

**Why `onDelete: Cascade` on `customer`:** if a customer account
is deleted (GDPR, etc.), their offers are not security-relevant
and can cascade. (The cascade does NOT delete the AccessGrant on
purchase — that's a separate table with Restrict.)

### 2.2 `Message` model extensions

The existing `Message` model gains three optional columns.
Backward-compatible: existing rows get `type='text'` (default),
`offerId=null`, `metadata=null`.

```prisma
model Message {
  // ... existing fields ...

  // Type discriminator (default "text" — the existing V1 behavior)
  type        String   @default("text")
                       // text            — regular chat message
                       // checkout_offer  — inline LS-overlay card (PrivateOffer)
                       // system          — system-generated message (purchase notifications,
                       //                    abandoned recovery, etc.)
  // The PrivateOffer this message is associated with. Only set when
  // type='checkout_offer'. The Message is the customer's "view" of
  // the offer; the PrivateOffer is the canonical record.
  offerId     String?
  offer       PrivateOffer? @relation("OfferMessages", fields: [offerId], references: [id], onDelete: SetNull)

  // Free-form metadata for non-text messages.
  // For type='system': { event: 'purchased', productId, amount, currency,
  //                       offerId?, privateOfferDiscountPct? }
  // For type='checkout_offer': { discountPct, expiresAt, productId,
  //                              productName, productSlug } (display
  //                              cache so the card doesn't need a
  //                              re-fetch on render)
  metadata    Json?

  // ... existing relations ...
}
```

**Why `type` is a String, not an enum:** Prisma's enum support is
fine, but the existing codebase uses String discriminators
(see `Message.eventType` in `AnalyticEvent`, `Order.status`,
etc.). Sticking with String is the convention.

**Why `metadata` is Json:** free-form, schema-less payload. The
chat view's renderer reads the discriminator and casts to the
appropriate shape. V2 may migrate to a typed `MessageMetadata`
union, but V1.5 doesn't need it.

**Why `offerId` is a separate column instead of embedded in
`metadata`:** the offer relation needs to be queryable
(`prisma.message.findMany({ where: { offerId: <id> } })`).
Embedding in metadata would force a JSON path query, which is
slower and harder to index.

### 2.3 Migration

Idempotent DDL matching the PR 2 / Phase 2 / Phase 5 patterns:

```sql
-- prisma/migrations/20260715XXXXXX_phase6_private_offer/migration.sql
CREATE TABLE IF NOT EXISTS "PrivateOffer" ( ... );

-- Partial unique index: at most ONE active offer per conversation.
-- "Active" = status IN ('draft', 'sent', 'opened'). Historical
-- offers (purchased, expired, revoked) are unconstrained. Prisma's
-- @@unique doesn't support partial indexes, so this is a raw
-- CREATE UNIQUE INDEX (idempotent via IF NOT EXISTS).
CREATE UNIQUE INDEX IF NOT EXISTS "PrivateOffer_one_active_per_conversation"
ON "PrivateOffer" ("conversationId")
WHERE status IN ('draft', 'sent', 'opened');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrivateOffer_conversationId_fkey') THEN
    ALTER TABLE "PrivateOffer"
      ADD CONSTRAINT "PrivateOffer_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE;
  END IF;
END $$;
-- (repeat for creatorId, customerId, productId, checkoutIntentId, purchasedOrderId)

-- Message model extensions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='Message' AND column_name='type') THEN
    ALTER TABLE "Message" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'text';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='Message' AND column_name='offerId') THEN
    ALTER TABLE "Message" ADD COLUMN "offerId" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='Message' AND column_name='metadata') THEN
    ALTER TABLE "Message" ADD COLUMN "metadata" JSONB;
  END IF;
END $$;

-- FK on Message.offerId → PrivateOffer.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_offerId_fkey') THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_offerId_fkey"
      FOREIGN KEY ("offerId") REFERENCES "PrivateOffer"("id") ON DELETE SET NULL;
  END IF;
END $$;
```

### 2.4 Status state machine

```
     ┌──────────┐  creator clicks "Invia"   ┌──────────┐
     │  draft   │ ─────────────────────────→ │   sent   │
     └──────────┘                            └──────────┘
                                                  │
                                                  │ customer clicks card
                                                  │ (LS overlay loads)
                                                  ▼
                                            ┌──────────┐
                                            │  opened  │
                                            └──────────┘
                                                  │
                                                  │ webhook fires
                                                  ▼
                                            ┌──────────┐
                                            │purchased │
                                            └──────────┘
                                                  │
                                                  │ (terminal)

     ANY of draft|sent|opened ──(expiresAt < now())──→ expired
     ANY of draft|sent|opened ──(creator PATCH /revoke)──→ revoked
```

**Why `draft` is distinct from `sent`:** a creator can compose an
offer in the chat composer (filling in the discount code,
previewing the card) and then either send it (transition to
`sent`) or discard it (row deleted, no Message created). This
matches the existing chat composer's "draft" UX (e.g., a creator
types a long message, navigates away, comes back to the draft
still in the composer). The `draft` state also enables analytics
on "offers composed but never sent" — a leading indicator of
creator friction with the offer UI.

**Why `opened` is a separate state from `sent`:** the offer was
seen by the customer (the card was rendered) but the customer
hasn't paid yet. Knowing the time delta between `sent` and
`opened` is a key engagement metric. The `openedAt` timestamp
captures the moment of click.

**Why `purchased` is the only "happy path" terminal state:**
`expired` and `revoked` are failure modes, not happy paths.
Keeping them distinct from `purchased` makes the inbox badge
code simpler (`status='purchased'` = success, everything else
= not yet).

**`purchasedOrderId` set in the same `$transaction` as the
`status='purchased'` update:** atomicity is critical. If the
Order.create succeeds but the PrivateOffer.update fails, we'd
have an order without an offer — the dashboard would show no
record. The transaction guarantees both happen or neither.

### 2.5 Discount policy (per-product, V1.5)

The 7th validation step (`discount-policy-respected`) reads from
two existing surfaces and one new column:

```prisma
// Existing: Coupon
model Coupon {
  // ... existing fields ...
  productId   String?  // null = applicable to all products
  // maxUses + expiresAt are the authorization boundary
}

// New: Product.allowPrivateOffers + maxPrivateOfferDiscountPct
model Product {
  // ... existing fields ...
  // Per-product private-offer policy. Defaults to "allowed,
  // no per-product cap" (creators can shoot themselves in the
  // foot by sending 99% discounts, but the Coupon's own
  // maxUses caps the total exposure).
  allowPrivateOffers         Boolean @default(true)
  maxPrivateOfferDiscountPct Int?    // 1-100; null = no per-product cap
}
```

The 7th step evaluates:

```typescript
// 1. Product.allowPrivateOffers === true (or undefined → default true)
// 2. If maxPrivateOfferDiscountPct is set, the coupon's effective
//    discount must be <= that percentage.
// 3. Coupon.isActive === true, expiresAt IS NULL OR expiresAt > now()
// 4. Coupon.usedCount < maxUses (or maxUses IS NULL)
// 5. Coupon.productId IS NULL OR Coupon.productId === productId
//    (the coupon is authorized for this product)
```

**Why per-product (not per-creator) for V1.5:** the policy
boundary is "this creator wants to offer this discount on this
product" — a per-product column is the most natural fit. A
per-creator policy table is V2 (analogous to RecoveryPolicy in
Phase 3) and would address "all products on this creator's
account share the same discount cap."

**Why `maxPrivateOfferDiscountPct` is nullable:** a null cap
means "no per-product cap" (the Coupon's own limits apply).
This is the default for existing products.

**Why Coupon.productId is reused as the authorization:** the
existing Coupon model already has this column. Phase 6 doesn't
add a new authorization surface; it reuses the existing one.
A creator who wants a "10% off Corso X" coupon sets
`Coupon.productId=X`; the private offer is rejected if the
product doesn't match.

---

## 3. Endpoint: `POST /api/conversations/:conversationId/offers`

The 7-step validation chain. The handler:

1. **Auth** — `getServerUser()` returns `dbUser`. Reject 401 if
   anonymous.
2. **Conversation membership** — load the Conversation by id;
   reject 404 if not found, 403 if `dbUser.id` is not
   `userOneId` or `userTwoId` (not a participant).
3. **Step (a) — sender-is-creator** — the sender is the creator
   side of the conversation. Compute `customerId` as the other
   party; verify `dbUser.id === (the creator)` by joining to
   `Conversation.product.creatorId`. Reject 403 if the sender
   is the customer.
4. **Step (b) — product-belongs-to-creator** — the offer's
   `productId` (from the request body) must match
   `Conversation.productId` AND `product.creatorId === dbUser.id`.
   Reject 403 if the product is on a different conversation, 400
   if the product is on the same conversation but not owned by
   this creator.
5. **Step (c) — product-is-published** — `product.status === 'published'`.
   Reject 400 if the product is in 'draft' or 'archived'.
6. **Step (d) — customer-doesnt-own-product** — no `AccessGrant`
   with `status='active'` exists for `(customerId, productId)`.
   The query is `prisma.accessGrant.findFirst({ where: {
   userId: customerId, productId, status: 'active' } })`.
   Reject 409 (Conflict — "il cliente ha già accesso") if found.
7. **Step (e) — coupon-is-authorized** — if a `discountCode` is
   provided, look up the `Coupon` row. Verify:
   - `isActive === true`
   - `expiresAt IS NULL OR expiresAt > now()`
   - `maxUses IS NULL OR usedCount < maxUses`
   - `productId IS NULL OR productId === productId`
   Reject 400 ("coupon non valido") if any check fails.
8. **Step (f) — currency-locale-consistent** — the offer's
   `currency` (from the request body, default 'eur') must be
   supported by the product's `pricesByCurrency` map (or
   `countryOverrides` for the customer's country). The
   existing `getCurrencyFromLocale` helper in
   `src/lib/i18n/locale-resolver.ts` resolves the canonical
   currency for the customer's `locale` (from
   `Conversation` member profile or `Accept-Language`).
   Reject 400 ("valuta non supportata per questa localizzazione")
   if no match.
9. **Step (g) — discount-policy-respected** — per § 2.5:
   - `product.allowPrivateOffers === true` (or undefined →
     default true)
   - if `maxPrivateOfferDiscountPct` is set, the coupon's
     effective discount must be <= that percentage
   - (Coupon authorization already verified in step (e).)
   Reject 400 ("offerta non permessa dalla policy del prodotto")
   if any check fails.
10. **Existing-offer check** — no PrivateOffer with
    `status IN ('draft', 'sent', 'opened')` already exists for
    this conversation. The `@@unique([conversationId, status])`
    enforces this at the DB level, but we check first to return
    a friendly 409 instead of a 500.
11. **Create PrivateOffer** — `prisma.privateOffer.create({ data:
    { conversationId, creatorId: dbUser.id, customerId, productId,
    locale, currency, discountCode, status: 'draft', expiresAt:
    now() + 7d } })`.
12. **Send the offer** — transition to `sent`:
    `prisma.privateOffer.update({ where: { id: offer.id },
    data: { status: 'sent', sentAt: now() } })`. Create the
    associated Message:
    ```typescript
    prisma.message.create({
      data: {
        conversationId,
        senderId: dbUser.id,
        content: `📦 ${product.name} a €${discountedPrice} con sconto privato (scade ${expiresAtFormatted})`,  // preview text
        type: 'checkout_offer',
        offerId: offer.id,
        metadata: {
          discountPct: computedDiscountPct,
          expiresAt: offer.expiresAt.toISOString(),
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          privateOfferId: offer.id,
        },
      },
    });
    ```
13. **WS broker emit** — `messageBroker.emit(NEW_MESSAGE, ...)`
    using the existing `createMessageAndNotify` helper
    (extended to support `type` and `offerId`).
14. **Response** — `201 { offerId, messageId, expiresAt }`.

**Why the offer is created in `draft` then immediately transitioned
to `sent`:** the `draft` state supports the composer-UX
(see § 2.4). For the V1.5 endpoint, the offer is sent atomically
(no "save as draft" yet) — the `draft → sent` transition is two
DB calls but appears as one to the user. V2 may expose a
`POST /offers` (without `/send`) to support the draft-then-send
flow.

**Why the discount percentage is computed and stored in the
Message's `metadata`:** the chat view needs to render the
discount badge ("-30%") without re-fetching the offer or
computing the discount math on every render. Storing it in
`metadata` (a denormalized cache) keeps the renderer fast.
V2 may invalidate this on coupon changes.

**Rate limiting:** tier `AUTH` (30 req/min). A creator spamming
their own chat with offers is rare but possible.

**Auth:** the existing `authorizeDmRequest` doesn't apply here
(the actor is the CREATOR, not a customer↔creator pair). The
endpoint reuses the same patterns (load conversation, verify
membership, verify role) but doesn't call the resolver.

---

## 4. Message consumer: render the LS overlay card

The chat view at `src/components/chat/chat-view.tsx` needs to
detect `type='checkout_offer'` and `type='system'` messages and
render them differently from `type='text'`. The renderer is
a small switch in the message component:

```tsx
// src/components/chat/message-bubble.tsx
function MessageBubble({ message }: { message: Message }) {
  switch (message.type) {
    case "checkout_offer":
      return <CheckoutOfferCard message={message} />;
    case "system":
      return <SystemMessageBubble message={message} />;
    case "text":
    default:
      return <TextMessageBubble message={message} />;
  }
}
```

### 4.1 `<CheckoutOfferCard>`

The card shows the product, the discount, the expiry, and an
"Acquista con sconto" button. The button opens a modal with an
iframe pointing to the LS checkout URL.

```tsx
// src/components/chat/checkout-offer-card.tsx
function CheckoutOfferCard({ message }: { message: Message & { offer: PrivateOffer } }) {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const { metadata, offer } = message;
  const { discountPct, expiresAt, productName, productSlug } = metadata;

  return (
    <div className="rounded-2xl border border-cream-dark-gold/40 bg-cream-dark-gold/10 p-4 max-w-md">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cream-dark-orange to-cream-dark-gold flex items-center justify-center shrink-0">
          <Tag className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-cream-dark-text">
            Offerta privata per te
          </p>
          <p className="text-xs text-cream-dark-text-soft mt-0.5">
            {productName} · sconto <span className="font-bold text-cream-dark-gold">-{discountPct}%</span>
          </p>
          <p className="text-[10px] text-cream-dark-text-soft/60 mt-1">
            Scade {formatRelativeTime(expiresAt)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setIsOverlayOpen(true)}
        className="mt-3 w-full py-2.5 rounded-xl bg-cream-dark-gold text-white font-semibold text-sm hover:bg-cream-dark-gold/90 transition-colors"
      >
        Acquista con sconto
      </button>

      {isOverlayOpen && (
        <CheckoutOverlay
          offerId={offer.id}
          checkoutUrl={offer.checkoutUrl ?? ""}
          onClose={() => setIsOverlayOpen(false)}
          onPurchaseComplete={() => {
            setIsOverlayOpen(false);
            // Reload the conversation to show the system message
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
```

### 4.2 `<CheckoutOverlay>` (LS iframe modal)

A simple modal that loads the LS checkout URL in an iframe. The
modal listens for a postMessage from the LS iframe (LS sends a
`?status=success` query param on the redirect URL when payment
completes) and closes itself.

```tsx
// src/components/chat/checkout-overlay.tsx
function CheckoutOverlay({
  offerId,
  checkoutUrl,
  onClose,
  onPurchaseComplete,
}: {
  offerId: string;
  checkoutUrl: string;
  onClose: () => void;
  onPurchaseComplete: () => void;
}) {
  // Mark the offer as "opened" the first time the overlay is shown.
  // Fire-and-forget; the server-side handler in § 3.2 is the
  // source of truth. The server endpoint is IDEMPOTENT — the
  // status field itself is the dedupe key: the handler does
  // `UPDATE PrivateOffer SET status='opened', openedAt=now()
  // WHERE id=:id AND status='sent'`. A second invocation (the
  // iframe reloads, the user double-clicks, etc.) finds no row
  // matching the WHERE clause and is a no-op. openedAt is set
  // only on the first transition.
  useEffect(() => {
    fetch(`/api/conversations/offers/${offerId}/opened`, { method: "POST" })
      .catch(() => {});  // fire-and-forget
  }, [offerId]);

  // Listen for the LS redirect postMessage.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // LS redirects to redirectUrl on success: the parent page
      // polls the LS-provided success indicator. We listen for a
      // simple "?checkout=success" or a custom postMessage from
      // the LS iframe (when configured).
      if (event.data?.type === "lemonsqueezy:success") {
        onPurchaseComplete();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onPurchaseComplete]);

  // Poll for the system message as a fallback (in case postMessage
  // isn't delivered, e.g. the LS iframe is blocked by the browser).
  // Every 3s for up to 120s. The 120s window covers slow LS checkouts
  // (card entry + 3DS + processing can exceed 60s; 120s is a safe
  // upper bound without keeping the user waiting indefinitely).
  // The interval stops on `purchased` (success) AND on `expired` /
  // `revoked` (no point polling further — the offer is terminal).
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/conversations/offers/${offerId}/status`);
      if (res.ok) {
        const { status } = await res.json();
        if (status === "purchased") {
          onPurchaseComplete();
          clearInterval(interval);
        } else if (status === "expired" || status === "revoked") {
          // Terminal but-not-purchased: close the overlay cleanly.
          clearInterval(interval);
        }
      }
    }, 3000);
    const stopAfter = setTimeout(() => clearInterval(interval), 120_000);
    return () => {
      clearInterval(interval);
      clearTimeout(stopAfter);
    };
  }, [offerId, onPurchaseComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center"
          aria-label="Chiudi"
        >
          <X className="w-5 h-5" />
        </button>
        <iframe
          src={checkoutUrl}
          className="w-full h-full border-0"
          allow="payment"
          sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
        />
      </div>
    </div>
  );
}
```

**Why a plain modal with iframe (not the LS-provided JS overlay):**
the LS hosted checkout loads in an iframe natively. Wrapping it
in our own modal gives us control over the close button, the
post-purchase UX (refresh the chat, show the system message),
and the polling fallback. Using a third-party JS widget (the
`lemon.js` overlay) would add a dependency, a CSP complication
(it injects scripts into the parent page), and a 2nd source of
truth for the "overlay is open" state.

**Why the `sandbox="allow-forms allow-scripts allow-same-origin
allow-top-navigation"`:** the LS checkout needs scripts to run
(it's a real checkout page, not a static form) and needs
top-level navigation (the success redirect goes to the LS
receipt page, which then redirects to our `redirectUrl`). We
deliberately omit `allow-popups` and `allow-modals` to keep the
LS iframe contained.

**Why poll for the system message as a fallback:** the
`postMessage` from the LS iframe may not arrive in some browsers
or with some ad-blockers. The polling fallback (every 3s) is
robust — when the webhook fires (Phase 2's
`applyPaymentEvent`), the server marks the offer as
`purchased` and inserts the system message. The client sees the
status flip on the next poll and refreshes.

**Why a `POST /opened` side-channel:** the
`/api/checkout/intents/:idOrToken/session` endpoint (Phase 3)
is the canonical place to mark the offer as opened (it's
called when the customer clicks the card and the LS overlay
loads). The `POST /opened` side-channel is a fallback for
when the iframe loads but the session call never happens
(browser issue, ad-blocker, customer closed the modal before
LS loaded). The `INSERT ... ON CONFLICT DO NOTHING` on the
server side makes the side-channel idempotent.

---

## 5. Webhook enrichment: `applyPaymentEvent` extended

The existing `applyPaymentEvent` (Phase 2's canonical command)
is extended to:

1. **Extract `privateOfferId` from the payload.**
2. **If present, look up `PrivateOffer` by id.**
3. **Validate the offer is in a purchaseable state** (`sent` or
   `opened`; not already `purchased`/`expired`/`revoked`).
4. **Create Order + AccessGrant** (existing path).
5. **In the same `$transaction`**, update the offer:
   `status='purchased', purchasedOrderId=order.id, purchasedAt=now()`.
6. **After the transaction**, create a system message:
   `type='system', metadata={ event: 'purchased', productId,
   amount, currency, offerId, discountPct }`.

The LS provider's `createCheckout` and `parseWebhook` are
extended to carry `privateOfferId` / `checkoutIntentId` /
`conversationId` / `sourceType` in the `custom` field.

### 5.1 `createCheckout` — extend customData

```typescript
// src/lib/commerce/payments/providers/lemonsqueezy/index.ts
async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
  const { product, pricing, locale, userEmail, channelId, sourceType, sourceId, conversationId } = input;
  // ... existing code ...

  const customData: Record<string, string> = {
    courseSlug: product.slug,
    locale,
  };
  if (userEmail) customData.email = userEmail;
  if (channelId) customData.channelId = channelId;

  // Phase 6 — PrivateOffer attribution
  // sourceType ∈ { "landing", "dm_offer", "dashboard" } (Phase 3).
  // For "dm_offer", sourceId is the PrivateOffer.id; conversationId
  // is the Conversation.id. The webhook handler uses these to
  // close the loop (see § 5.3).
  if (sourceType) customData.sourceType = sourceType;
  if (sourceId) customData.sourceId = sourceId;
  if (conversationId) customData.conversationId = conversationId;
  // For "dm_offer" specifically, surface the privateOfferId
  // separately so the webhook handler doesn't have to parse
  // sourceId as a discriminated union.
  if (sourceType === "dm_offer" && sourceId) {
    customData.privateOfferId = sourceId;
  }

  // ... rest of existing code ...
}
```

**Why the `CreateCheckoutInput` interface gains
`sourceType`/`sourceId`/`conversationId`:** Phase 3's
`CheckoutIntent` already carries these fields, but the provider
interface was written before Phase 3. Phase 6 is the
opportune time to thread them through the provider signature
(Phase 3 was the right time, but we deferred to Phase 6 since
Phase 3 only added the CheckoutIntent table — it didn't call
the provider directly).

### 5.2 `parseWebhook` — extract the new custom fields

```typescript
// src/lib/commerce/payments/providers/lemonsqueezy/index.ts
async parseWebhook(input: RawWebhook): Promise<PaymentEvent> {
  // ... existing HMAC verification + payload parsing ...

  // Extract the new custom fields. LS's `meta.custom_data` carries
  // the keys we set in createCheckout. We surface them as
  // top-level fields on PaymentEvent for ergonomic consumption.
  const custom = payload?.meta?.custom_data ?? {};
  return {
    provider: "lemonsqueezy",
    eventType: payload?.meta?.event_name ?? "order_created",
    deliveryId: `${payload?.data?.id}-${payload?.meta?.event_name ?? "unknown"}`,
    correlationKey: String(payload?.data?.id ?? ""),
    payload: {
      // ... existing payload fields ...
      custom: {
        courseSlug: custom.courseSlug,
        locale: custom.locale,
        email: custom.email,
        channelId: custom.channelId,
        // Phase 6 additions
        sourceType: custom.sourceType,
        sourceId: custom.sourceId,
        conversationId: custom.conversationId,
        privateOfferId: custom.privateOfferId,
      },
    },
  };
}
```

### 5.3 `applyPaymentEvent` — close the PrivateOffer loop

```typescript
// src/lib/commerce/payments/apply-payment-event.ts
export async function applyPaymentEvent(event: PaymentEvent): Promise<{ orderId: string }> {
  const custom = (event.payload?.custom ?? {}) as {
    courseSlug?: string;
    locale?: string;
    email?: string;
    channelId?: string;
    sourceType?: string;
    sourceId?: string;
    conversationId?: string;
    privateOfferId?: string;
  };

  // ... existing processOrder path (user-create, Order.create, AccessGrant.upsert, email, analytics) ...

  // Phase 6: if the event is tied to a PrivateOffer, update the offer
  // and emit a system message — in the same $transaction as the
  // Order.create so the offer/order/message are atomically visible.
  if (custom.privateOfferId && custom.sourceType === "dm_offer") {
    await prisma.$transaction(async (tx) => {
      // Validate the offer is still purchaseable.
      const offer = await tx.privateOffer.findUnique({
        where: { id: custom.privateOfferId },
      });
      if (!offer) {
        console.warn(`[Phase6] PrivateOffer ${custom.privateOfferId} not found for webhook event`);
        return;  // not a fatal error — the order still goes through
      }
      if (offer.status === "purchased") {
        console.warn(`[Phase6] PrivateOffer ${custom.privateOfferId} already purchased, skipping`);
        return;  // webhook replay — idempotent skip
      }
      if (offer.status !== "sent" && offer.status !== "opened") {
        console.warn(`[Phase6] PrivateOffer ${custom.privateOfferId} in status '${offer.status}', refusing to mark as purchased`);
        return;
      }

      // Update the offer.
      await tx.privateOffer.update({
        where: { id: custom.privateOfferId },
        data: {
          status: "purchased",
          purchasedOrderId: order.id,
          purchasedAt: new Date(),
        },
      });

      // Create the system message. The content is viewer-aware:
      // the SAME Message row renders to both the customer and
      // the creator. The `metadata` carries the canonical data
      // (event type, productId, amount, currency, discount, etc.)
      // and the renderer localizes the visible text per viewer
      // (customer sees "Hai acquistato", creator sees "Mario ha
      // acquistato"). A naïve single-string `content` field
      // would show "Hai acquistato" to both — wrong for the
      // creator's view. Storing the canonical data in `metadata`
      // + viewer-aware rendering is the right split.
      //
      // senderId is a special "system" sentinel: a stable user
      // id (see SYSTEM_USER_ID constant) that's never a real
      // human. This avoids polluting the customer's lastSeenAt
      // (the offline-notification cooldown in
      // createMessageAndNotify checks `message.type === 'system'`
      // and skips the partner's lastSeenAt update). The chat
      // composer's UI treats system messages as not-sent-by-anyone
      // (centered, with a system icon).
      const coupon = offer.discountCode
        ? await tx.coupon.findUnique({ where: { code: offer.discountCode } })
        : null;
      const discountPct = coupon?.type === "percent" ? coupon.value : null;
      const customer = await tx.user.findUnique({
        where: { id: order.userId },
        select: { name: true, email: true },
      });
      const customerDisplayName =
        customer?.name || customer?.email?.split("@")[0] || "Il cliente";
      await tx.message.create({
        data: {
          conversationId: offer.conversationId,
          senderId: SYSTEM_USER_ID,  // sentinel: not a real human
          content: "",  // renderer composes per-viewer from metadata
          type: "system",
          metadata: {
            event: "purchased",
            productId: order.productId,
            productName: productName,
            productSlug: productSlug,
            amount: order.amount,
            currency: order.currency,
            offerId: offer.id,
            discountPct,
            // Viewer-localization helpers (renderer uses these to
            // build the visible text per the viewer's role):
            customerId: order.userId,
            customerDisplayName,
          },
        },
      });
    });
  }

  return { orderId: order.id };
}
```

**Why the offer update is in a `$transaction` with the
`message.create`:** the system message is part of the same
business event as the order. If the message fails, the offer
shouldn't show `purchased` without the matching message — the
customer would see the system message on a refresh but the
offer would still show `sent`/`opened`. Wrapping both in a
transaction guarantees consistency.

**Why the `senderId` of the system message is the customer
(`order.userId`):** the existing message schema requires a
non-null `senderId`. The system message is "from the customer"
in the sense that the customer is the one who triggered the
event. The chat view's renderer uses `type='system'` to
visually distinguish this from a customer-typed message (e.g.,
centered, with a system icon).

**Why the offer update is INSIDE the existing `processOrder`
flow, not a separate outbox consumer:** the offer→order binding
is a hard transactional dependency. If the offer is marked
`purchased` BEFORE the order is created, a crash between the
two leaves an offer with no order. If the order is created
WITHOUT updating the offer, the customer sees no system message
in the chat. The `$transaction` is the right primitive.

**V2 addendum:** the `applyPaymentEvent` could be split into
"create the order" (transactional) and "update the offer +
emit the system message" (outbox consumer) for cleaner
separation. For V1.5, the inline transaction is simpler and
the atomicity guarantee is worth the coupling.

**`SYSTEM_USER_ID` constant:** the system message's `senderId`
is a sentinel user id (e.g., a hardcoded `system-bot` User row
created at migration time) rather than `order.userId`. This
avoids two issues:
  (a) The customer's `lastSeenAt` would update when they see
      the system message, polluting the offline-notification
      cooldown in `createMessageAndNotify` (which assumes the
      partner is "human" and increments lastSeenAt on view).
      The system message is a server-emitted event, not a
      user-triggered interaction.
  (b) The chat composer's UI treats system messages as
      "not sent by anyone" (centered, system icon). A
      `senderId = SYSTEM_USER_ID` makes the renderer code
      explicit: `if (message.senderId === SYSTEM_USER_ID) render
      as system`.

The `SYSTEM_USER_ID` is created by the Phase 6 migration:
`INSERT INTO "User" (id, email, name, role) VALUES
('system_bot_000000000000000', 'system@internal', 'System',
'system') ON CONFLICT (id) DO NOTHING`. V2 may add a nullable
`senderId` to the Message schema (for a cleaner separation)
but V1.5 uses the sentinel-user convention.

**About the `senderId` schema convention:** the `Message.senderId`
is currently `NOT NULL` (V1 schema). Phase 6 keeps the
NOT NULL constraint and uses the sentinel user. A future
schema change (V2) could make `senderId` nullable for
`type='system'` messages, removing the need for the sentinel.
For V1.5, the sentinel is the right tradeoff: no schema break,
clear semantic meaning, easy to query (`WHERE senderId =
SYSTEM_USER_ID` for all system messages).

---

## 6. Migration from existing data

The Phase 6 migration is **additive only**. No existing rows
are modified.

- The `Message` model gains 3 columns (`type`, `offerId`,
  `metadata`) with safe defaults (`type='text'`, `offerId=null`,
  `metadata=null`). Existing rows are unaffected.
- The `PrivateOffer` table is new — no existing data to migrate.
- The `Message.offerId → PrivateOffer.id` FK is new.

The `@@unique([conversationId, status])` constraint on
PrivateOffer is enforced from the moment the migration lands.
For new offers going forward, this prevents "two pending offers
on the same conversation." Existing chats have zero offers, so
no conflict.

---

## 7. Implementation steps (after the design lands)

In order of dependency:

1. **Schema migration** — `prisma/migrations/20260715XXXXXX_phase6_private_offer/migration.sql`
   with idempotent DDL (CREATE TABLE IF NOT EXISTS for PrivateOffer
   + DO $$ ALTER TABLE for Message columns + FK constraints).
2. **Add `PrivateOffer` + Message extensions to
   `prisma/schema.prisma`** + `npx prisma generate`.
3. **Add `allowPrivateOffers` + `maxPrivateOfferDiscountPct` to
   `Product`** + Prisma generate.
4. **`POST /api/conversations/:conversationId/offers` endpoint**
   with the 7-step validation per § 3. The endpoint calls a new
   `src/lib/services/private-offer-service.ts` for the validation
   chain (testable in isolation).
5. **`POST /api/conversations/offers/:offerId/opened` and
   `GET /api/conversations/offers/:offerId/status` endpoints**
   for the `opened` state transition and the polling fallback
   (§ 4.2). The `POST /opened` endpoint is IDEMPOTENT via a
   conditional `WHERE status='sent'` update — double-clicks and
   iframe reloads are no-ops after the first transition.
6. **Extend `CreateCheckoutInput` + LS `createCheckout` /
   `parseWebhook`** to carry `sourceType` / `sourceId` /
   `conversationId` / `privateOfferId` per § 5.1, § 5.2.
7. **Extend `applyPaymentEvent`** to close the PrivateOffer loop
   per § 5.3.
8. **Extend `createMessageAndNotify`** to accept `type` and
   `offerId` (additive parameter, default `type='text'` /
   `offerId=null` for the existing call sites).
9. **Update `src/components/chat/chat-view.tsx` + create
   `src/components/chat/message-bubble.tsx` +
   `src/components/chat/checkout-offer-card.tsx` +
   `src/components/chat/checkout-overlay.tsx`** to render the
   `type='checkout_offer'` and `type='system'` messages.
10. **Add a "Invia offerta privata" button to the chat
    composer** at `src/components/chat/chat-composer.tsx`. The
    button opens a small dialog (discount code input, expiry
    default 7d, preview of the card) and on submit calls
    `POST /api/conversations/:conversationId/offers`.
11. **Cron worker for offer expiry** — add to
    `vercel.json` a new entry
    `{ "path": "/api/internal/jobs/private-offers-expire",
    "schedule": "0 * * * *" }` (every hour, since the expiry
    window is days, not seconds). The worker scans for
    `PrivateOffer.status IN ('draft', 'sent', 'opened') AND
    expiresAt < now()` and transitions to `expired` via
    `updateMany`. No outbox event needed (the expiry is silent).
12. **`POST /api/conversations/:conversationId/offers/:offerId/revoke`
    endpoint** (creator-only) for the `revoked` state transition.
    The handler validates the offer belongs to the conversation,
    the actor is the creator, and the offer is in a revokable
    state (`sent` or `opened`; not already `purchased`/`expired`).
13. **Tests** — unit tests for the 7-step validation (each step
    can pass/fail independently), the `applyPaymentEvent` extension
    (privateOfferId present, absent, replayed), the card renderer
    (renders with the right metadata, opens the overlay on click).
14. **Operational runbook** at
    `docs/runbooks/phase-6-private-offer.md` (separate doc) —
    covers the rollout (1d of zero rejected offers, then flip
    the default `allowPrivateOffers` to `true` for all products
    that don't have it set, monitor 7d, then consider the
    `enforceDiscountPolicy` flag for V2).

---

## 8. What gets simpler in V2

- **Creator analytics** on the offer funnel: how many offers
  sent, opened, purchased, expired, revoked. The state
  machine gives us a free funnel.
- **Multi-touch offers** — a creator sends 3 offers over a
  week, customer buys on the 3rd. The `@@unique([conversationId,
  status])` constraint is relaxed to allow N active offers.
- **Time-boxed offers** — a "Black Friday only" offer with
  `validFrom` and `validUntil` columns.
- **Offer templates** — a creator can save a "30% off, 7d
  expiry" template and reuse it for multiple customers.
- **A/B testing** — `RecoveryPolicy.variant` style
  experimentation on offer copy (V2 addendum for both Phase 3
  and Phase 6).
- **Customer-side "request a discount"** — the customer
  sends a message asking for a discount; the creator gets a
  "create offer" pre-filled with the customer's request.

---

## 9. Out of scope for Phase 6

- Multi-product offers (one offer for multiple products).
  V2.
- Coupon stacking (multiple coupons on the same offer). V2.
- Per-customer offer caps ("max 3 offers per customer per
  month"). V2.
- Offer analytics dashboard. V2.
- The Message `metadata` schema. V2 may add a typed
  `MessageMetadata` union.
- The `Message.type` enum. V2 may promote to a Prisma enum.
- The `applyPaymentEvent` split. V2 may move the offer
  update + system message to an outbox consumer.

---

## 10. References

- `prisma/schema.prisma` — User, Product, Conversation,
  Message, Order, Coupon, AccessGrant, YouTubeChannel models
  that `PrivateOffer` extends and references.
- `src/lib/commerce/payments/types.ts` — the `CreateCheckoutInput`
  and `PaymentEvent` interfaces extended by § 5.
- `src/lib/commerce/payments/providers/lemonsqueezy/index.ts` —
  the LS `createCheckout` and `parseWebhook` extended in
  § 5.1, § 5.2.
- `src/lib/messaging/create-message.ts` — the
  `createMessageAndNotify` helper extended to support
  `type` and `offerId` (§ 7 step 8).
- `src/components/chat/chat-view.tsx` — the chat renderer
  that gains the `<MessageBubble>` switch (§ 4).
- `docs/phase-2-webhook-inbox.md` — the
  `applyPaymentEvent` canonical command extended in § 5.3.
- `docs/phase-3-checkout-intent.md` — the `CheckoutIntent`
  model with `sourceType='dm_offer'` that Phase 6 fills in.
- `docs/phase-5-customer-insights.md` — the read model that
  `PrivateOffer.purchased` indirectly populates (the
  existing `processOrder` LTV upsert fires from the same
  webhook).
- PR 1 (`3c217e2`) — `paymentProviderRegistry` interface
  (LS `createCheckout` extended here).
- PR 2 (`afc288d`) — `AccessGrant` model + dual-write
  pattern (the offer.purchased path reuses this).
- PR 3 (`10055b9`) — feature-flag + dual-write cutover
  pattern (Phase 6 may use a similar `enforcePrivateOfferPolicy`
  flag for the rollout in § 7 step 14).
- Phase 2 (`ff01efd`) — webhook inbox + outbox + LISTEN/NOTIFY
  pattern. The `applyPaymentEvent` extension in § 5.3
  participates in this same flow.
- Phase 3 (`27ef1c9`) — `CheckoutIntent` + `RecoveryPolicy`
  + `/api/checkout/intents/:idOrToken/session` design. The
  Phase 6 session call from § 4.1 reuses Phase 3's
  CheckoutIntent + the `opened` transition.
- Phase 5 (`d4e2b49`) — `CustomerProductInsight` read model.
  The `processOrder` LTV upsert fires from the same webhook
  as the Phase 6 offer.purchased update.
