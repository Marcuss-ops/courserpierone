# Phase 2 — Webhook inbox + transactional outbox + PG listener worker

> **Status:** partially implemented — the current production path is documented below; the `PaymentWebhookEvent` inbox and PG listener design remain future work.
> **Owner:** TBD.
> **Goal:** provider webhooks (Stripe + Lemon Squeezy) and internal
> application events both flow through a single durable, retry-aware,
> audit-friendly infrastructure. Webhooks are written to a
> `PaymentWebhookEvent` inbox on receipt; a cron worker drains due
> events via `applyPaymentEvent`. Internal events are written to an
> `OutboxEvent` table in the same `$transaction` as the business write
> (transactional outbox pattern); a separate cron dispatcher polls due
> outbox rows and fans out to registered consumers. A long-lived
> PG `LISTEN` connection is supported by including a `pg_notify`
> trigger in the DDL, but the V1.5 dispatcher is a polling cron (Vercel
> serverless cannot hold a long-lived LISTEN connection). Admin
> reconciliation routes manual "missing event" repairs through the
> same inbox so observability + retry semantics are uniform.
>
> **Current implementation (2026-08-06):** the Lemon Squeezy route verifies the provider signature, reserves `(provider, deliveryId)` in `ProcessedWebhook`, and invokes the webhook processor. For a completed payment, the processor translates the payload to `CompletePaidOrderCommand` and `processOrder` commits `Order(status='completed')`, an active `AccessGrant`, and four durable `OutboxEvent` rows in one Prisma transaction. `OUTBOX_HANDLER_REGISTRY` validates each payload with Zod before dispatch. The email handler creates one `OutboxDeliveryAttempt` per `(outboxEventId, channel='email')`; SMTP is outside the database transaction. `failed` attempts may retry, while `processing`/`uncertain` outcomes are not blindly resent after an ambiguous provider boundary.
>
> **Design target (not current runtime):** the `PaymentWebhookEvent` inbox, `applyPaymentEvent`, `drainDueEvents`, admin reconciliation route, and PG `LISTEN`/`NOTIFY` worker described in the sections below are the proposed next-stage architecture. Do not use their example schemas or routes as a description of the current deployed contract.
>
> **Historical design context (pre-2026-08-06):** the former webhook handlers
> (`src/app/api/webhooks/lemonsqueezy/route.ts`,
> `src/app/api/webhooks/stripe/route.ts`) parse, verify, and
> processed events inline. The former receipt path returned a 200 only
> after the former `processOrder` path (a 200+ line function) had fully succeeded
> — a Vercel timeout mid-process could leave a half-applied Order
> with no retry. Before the current transaction boundary, `ProcessedWebhook` provided
> basic idempotency on `deliveryId` but no retry/backoff; the current path now retries the webhook reservation on processing failures.
> `prisma.analyticEvent.create` and `sendPurchaseConfirmation` were
> previously best-effort `.catch()` calls — failures were logged but lost.
> The implemented path now persists these effects as durable outbox events;
> the inbox + worker described below remains a future extension.
>
> **Migration strategy:** per-record, no break. The webhook
> handlers are extended to **dual-write** to `ProcessedWebhook`
> (existing) AND `PaymentWebhookEvent` (new). A one-shot
> script migrates existing `ProcessedWebhook` rows. After
> 7d of clean prod, the dual-write window closes. The
> `ProcessedWebhook` table is dropped in Phase 7 cleanup.

---

## 1. Motivation

The following six problems are the historical baseline that motivated this design; the current Order/AccessGrant/outbox transaction and delivery registry close the order-fulfillment and post-purchase gaps described above.

1. **Inline processing is fragile.** A Vercel timeout (10s
   default) or OOM mid-`processOrder` leaves a half-applied
   Order. The provider's next retry hits the same path, but if
   the partial state is committed (e.g. `Order` row created but
   `AccessGrant` upsert failed), the second pass sees a
   `stripeSessionId @unique` collision and silently bails —
   the grant is never written. The user gets an order but no
   course access.
2. **No retry/backoff on the business logic.** A transient
   downstream failure (SMTP timeout, Postgres blip) kills the
   webhook. The provider's own retry hits the same downstream,
   which may still be down. The current code's `isTransient`
   sniff returns 503, but the provider's exponential backoff
   tops out at ~24h with 8 attempts — and a missed email is
   invisible until the customer complains.
3. **No dead-letter visibility.** When a webhook permanently
   fails (e.g. product deleted, customer email malformed),
   the current code logs to console and acks with 200 (to stop
   provider retries). The failure is invisible to ops — there's
   no row in any table that says "this delivery was dropped."
4. **No replay.** A bug in `processOrder` that fires for 2h
   before being noticed leaves a window of N orders created
   without their downstream side-effects (email, analytics,
   abandoned-checkout recovery). There's no way to replay
   those orders' side-effects after the fix ships.
5. **Internal events are fire-and-forget.** Phase 3 will
   publish `checkout.intent.captured` and `checkout.abandoned`
   for the abandoned-cart worker. Phase 5 will publish
   `order.completed` and `order.refunded` for the
   `CustomerProductInsight` LTV update. Phase 6 may publish
   `private_offer.purchased` for the chat notification. All of
   these need a transactional outbox so the publish is atomic
   with the business write, and a durable consumer so a
   consumer crash doesn't lose the event.
6. **No admin reconciliation.** When a webhook is missed
   (provider outage, Vercel deploy race), the order is missing.
   The current code has no manual override — ops has to write
   a SQL UPDATE to create the order, and the customer
   side-effects (email, analytics) are still missing.

Phase 2 fixes all six with: (1) a `PaymentWebhookEvent` inbox
that records every delivery with HMAC verification done at the
edge, (2) a cron worker that drains due events with
`SELECT FOR UPDATE SKIP LOCKED` + backoff + dead-letter, (3)
an `applyPaymentEvent` canonical command that is the single
source of truth for "an order was paid for," (4) an
`OutboxEvent` table for internal events with a dispatcher that
fans out to consumers, and (5) an admin reconciliation
endpoint that routes through the same inbox.

---

## 2. Schema

### 2.1 `PaymentWebhookEvent`

The inbox. One row per provider delivery. The HMAC verification
happens at the edge (in the route handler) before the row is
inserted; the worker trusts the row to be authenticated.

```prisma
model PaymentWebhookEvent {
  id              String   @id @default(cuid())

  // Provider + delivery identity.
  // `deliveryId` is provider-specific:
  //   - Stripe: event.id (already globally unique)
  //   - LS:     `${data.id}-${event_name}` (composite, see § 3.1)
  // `@@unique([provider, deliveryId])` is the dedupe boundary.
  provider        String   // "lemonsqueezy" | "stripe"
  deliveryId      String
  eventType       String   // "checkout.session.completed", "order_created", etc.

  // The verified payload (provider-shaped). Stored as JSONB for
  // admin introspection + ad-hoc queries without re-fetching
  // from the provider. The HMAC was verified at receipt — the
  // stored JSON is the post-verification object, not the raw
  // request body. (The raw body is NOT stored: it's transient
  // and would inflate the table by 10× for no benefit.)
  payload         Json     @db.JsonB

  // `correlationKey` is a denormalized index for fast lookup by
  // the order's provider reference (Order.providerOrderId for LS,
  // Order.stripeSessionId for Stripe). Without it, every
  // apply-payment-event call would do a JSON-path query on
  // payload for `data.id` or `data.object.id`. With it, the
  // worker does `WHERE correlationKey = ?` and gets an index
  // seek. The index is partial:
  //   @@index([provider, correlationKey])
  // because the lookup is provider-scoped.
  correlationKey  String?

  // The status state machine (see § 2.4):
  //   received        — inserted by the route handler, awaiting first pickup
  //   processing      — claimed by a worker, in-flight
  //   retry_scheduled — apply-payment-event threw retryable error, waiting for nextAttemptAt
  //   completed       — apply-payment-event succeeded
  //   dead_letter     — apply-payment-event threw non-retryable error OR max attempts reached
  status          String   @default("received")

  // Retry bookkeeping.
  attempts        Int      @default(0)
  // `nextAttemptAt` is nullable: null means "due for immediate
  // processing on the next cron tick." Set after a retryable
  // failure to the backoff ladder offset from now().
  nextAttemptAt   DateTime?
  // `lockedAt` is the soft TTL for worker re-claim. The worker's
  // WHERE clause asserts `lockedAt IS NULL OR lockedAt < now() - 5min`
  // so an orphaned lock from a Vercel function that was OOM-killed
  // is reclaimed after 5 minutes. The worker's drain helper sets
  // `lockedAt = NOW()` AND `lockedBy = process.env.HOSTNAME ?? 'unknown'`
  // (Vercel sets HOSTNAME to the function instance name) so an
  // operator can see which worker claimed a stuck row.
  lockedAt        DateTime?
  lockedBy        String?

  lastError       String?  // truncated to 1KB; full error in server logs
  processedAt     DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([provider, deliveryId])
  @@index([status, nextAttemptAt])  // the worker's hot-path query
  @@index([provider, correlationKey])  // order-lookup index
  @@index([createdAt])  // admin "recent deliveries" view
}
```

**Why a separate `correlationKey` column:** the
`Order.providerOrderId` (LS) or `Order.stripeSessionId` (Stripe)
is what `applyPaymentEvent` needs to find the existing order
during a refund. Without the denormalized key, the worker
would do a JSONB path query on `payload` (`payload->'data'->>'id'`)
for every refund — slow and brittle (the path differs per
provider). The denormalized column is set at insert time by
the route handler and indexed.

**Why `JsonB` and not the raw request body:** the HMAC is
verified at the edge. Storing the raw body would let an
attacker who gets DB read access replay the HMAC against a
new endpoint, but the only endpoint that accepts the raw body
is the webhook route (which re-verifies HMAC). The raw body
adds no security value. `JsonB` is smaller, queryable, and
introspectable from the admin reconciliation UI.

**Why `lockedBy`:** debug aid. When a row is stuck in
`processing` for > 5 minutes, the operator can see which
worker host claimed it. Not required for correctness — the
TTL reclaims regardless. V2 may promote to a `workerId` UUID.

**Why `status` is a String, not a Prisma enum:** matches the
existing project convention (`Order.status`, `Message.type`,
`Coupon.type` are all Strings). The state machine is enforced
in application code; the DB stores the discriminator.

### 2.2 `OutboxEvent`

The transactional outbox for INTERNAL events (not provider
webhooks). One row per published event, written in the same
`$transaction` as the business write. The dispatcher polls due
rows and fans out to registered consumers.

```prisma
model OutboxEvent {
  id              String   @id @default(cuid())

  // Routing
  // `eventType` is a dotted path: "order.completed",
  // "checkout.intent.captured", "private_offer.purchased".
  // Consumers register by `eventType` (or a wildcard prefix in
  // V2). The dispatcher is event-type-agnostic.
  eventType       String

  // Aggregate pointer (for observability + ad-hoc queries)
  aggregateType   String   // "Order" | "CheckoutIntent" | "PrivateOffer"
  aggregateId     String   // the aggregate's id

  // The event payload. Same JSONB rationale as PaymentWebhookEvent.
  payload         Json     @db.JsonB

  // Idempotency (publisher-provided). A unique string the
  // publisher generates deterministically. E.g., for
  // "order.completed": `dedupeKey = "order:completed:{orderId}"`.
  // `@@unique([dedupeKey])` ensures a duplicate publish (e.g.,
  // from a retried business write) hits P2002 and is skipped.
  // Nullable because not all events are deterministically
  // dedupeable (e.g., a "user.signed_up" event that fires
  // async with no source-of-truth aggregate).
  dedupeKey       String?

  // Same status state machine as PaymentWebhookEvent (see § 2.4).
  status          String   @default("pending")
                  // pending           — inserted, awaiting first pickup
                  // processing        — claimed by the dispatcher
                  // completed         — all consumers succeeded
                  // partial_failure   — some consumers succeeded, some failed (V2 addendum)
                  // dead_letter       — max attempts reached OR non-retryable error

  attempts        Int      @default(0)
  nextAttemptAt   DateTime?  // null = "due for immediate processing"
  lockedAt        DateTime?
  lockedBy        String?

  lastError       String?
  processedAt     DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([dedupeKey])  // null dedupeKey is allowed (PG treats NULL as distinct in unique indexes by default)
  @@index([status, nextAttemptAt])  // dispatcher's hot-path query
  @@index([eventType, createdAt])  // observability / "events of this type" view
  @@index([aggregateType, aggregateId])  // "what events fired for this aggregate"
}
```

**Why a separate `OutboxEvent` table (not a shared
`payment_outbox` table with a `source` discriminator):** the
inbox and outbox have different idempotency boundaries
(provider `deliveryId` vs publisher `dedupeKey`), different
payload shapes (provider-shaped vs domain-shaped), and
different consumer routing (provider events always go to
`applyPaymentEvent`; outbox events fan out to N consumers).
Sharing the table would create a polymorphic mess. The
schema is symmetric enough that the dispatcher code can be
shared as a helper.

**Why `dedupeKey` is a `String?` (nullable):** not all events
are deterministically dedupeable. A "user.signed_up" event
that fires after a Supabase webhook (no business aggregate
to dedupe on) has no source-of-truth fingerprint. The
`@@unique` allows nulls (PG default: NULLs are distinct in
unique indexes), so the optionality doesn't break the
constraint.

**Why `nextAttemptAt` is null for the first pickup:** the
publisher doesn't know when the dispatcher will run. Setting
`nextAttemptAt = createdAt` is equivalent and avoids a
"why is this row's nextAttemptAt equal to createdAt?" code
smell. The dispatcher treats `null` as "due immediately."

### 2.3 `AdminReconciliation`

The admin endpoint's audit row. Created BEFORE the inbox row
so a duplicate `idempotencyKey` hits a P2002 instead of
creating a duplicate inbox row.

```prisma
model AdminReconciliation {
  id                String   @id @default(cuid())

  // The admin's unique key. E.g., "admin-reconcile-2026-07-13-ticket-12345".
  // `@@unique([idempotencyKey])` is the dedupe boundary.
  idempotencyKey    String   @unique

  // Audit
  adminId           String   // the admin's User.id (dbUser.role === 'admin')
  reason            String   // free-text: "customer reported missing ebook, manually triggered order"
  paymentWebhookEventId String?  // back-pointer to the inbox row this reconciliation created (or null on validation failure)

  // Optional provider context (e.g., "stripe_session_id" the admin pasted)
  provider          String?  // "lemonsqueezy" | "stripe"
  providerReference String?  // provider's id (LS order id, Stripe session id)

  createdAt         DateTime @default(now())

  admin User @relation("AdminReconciliations", fields: [adminId], references: [id], onDelete: Restrict)
  paymentWebhookEvent PaymentWebhookEvent? @relation(fields: [paymentWebhookEventId], references: [id], onDelete: SetNull)

  @@index([adminId, createdAt])
}
```

**Why a separate table (not just an `idempotencyKey` field on
`PaymentWebhookEvent`):** the admin endpoint's idempotency
boundary is the admin's key, not the provider's deliveryId.
Two reconciliations of different provider events for the same
customer would share a `correlationKey` but need distinct
audit rows. A separate table also keeps the admin
"why" (`reason`) out of the inbox table's hot path.

**Why `adminId` is required (no null for "system"
reconciliations):** every reconciliation has a human actor.
If a future V2 adds "auto-reconcile from provider API" (e.g.,
Phase 4's `retrievePayment`), use a sentinel admin user
`id='system_reconciler'`. V1.5 doesn't have this need.

### 2.4 Status state machine (shared by both tables)

```
                    ┌─────────────┐
   INSERT           │  received   │ (inbox) or  │  pending  │ (outbox)
   ────────────►    │             │             │           │
                    └─────────────┘             └───────────┘
                          │                          │
                          │ worker/dispatcher        │
                          │ SELECT FOR UPDATE        │
                          │ SKIP LOCKED              │
                          ▼                          ▼
                    ┌─────────────┐             ┌───────────┐
                    │ processing  │             │ processing│
                    └─────────────┘             └───────────┘
                          │                          │
              ┌───────────┴───────────┐              │
              │                       │              │
         success                  retryable       success (all
              │                  error (e.g.        consumers
              │                   ECONNREFUSED)      done)
              ▼                       │              │
      ┌──────────────┐                │              ▼
      │  completed   │                │       ┌───────────┐
      └──────────────┘                │       │ completed │
              ▲                       │       └───────────┘
              │                       │              ▲
              │                       │              │
              │       ┌───────────────┴──┐           │
              │       │ retry_scheduled │───────────┘ (next attempt succeeds)
              │       └─────────────────┘
              │                ▲
              │                │
              │       attempts < MAX_ATTEMPTS
              │       AND isRetryable(error)
              │
              │  attempts >= MAX_ATTEMPTS
              │  OR non-retryable error
              │       (NotFoundError, ValidationError)
              ▼       │
      ┌──────────────┐ │
      │  dead_letter │◄┘
      └──────────────┘
```

**The state machine is the same for inbox and outbox.**
That's intentional — the dispatcher code (§ 4) is shared.
Differences:
- `received` (inbox) vs `pending` (outbox) — naming
  distinction for human readability only. Both mean
  "inserted, awaiting pickup."
- The outbox's `completed` requires ALL consumers to
  succeed (V2: `partial_failure` for "some consumers
  succeeded"). The inbox's `completed` requires
  `applyPaymentEvent` to succeed.

**Why a 5-attempt max instead of unlimited retries:** the
backoff ladder tops out at 24h. The 6th attempt fires at
24h+ after the first failure. Beyond that, the failure
is unlikely to resolve without operator intervention —
dead-letter and alert.

### 2.5 Migration DDL

Idempotent DDL matching the PR 2 / Phase 3 / Phase 5 / Phase
6 patterns. All three tables in a single migration file.

```sql
-- prisma/migrations/20260716XXXXXX_phase2_webhook_inbox/migration.sql

-- PaymentWebhookEvent
CREATE TABLE IF NOT EXISTS "PaymentWebhookEvent" (
  "id"              TEXT PRIMARY KEY,
  "provider"        TEXT NOT NULL,
  "deliveryId"      TEXT NOT NULL,
  "eventType"       TEXT NOT NULL,
  "payload"         JSONB NOT NULL,
  "correlationKey"  TEXT,
  "status"          TEXT NOT NULL DEFAULT 'received',
  "attempts"        INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt"   TIMESTAMP(3),
  "lockedAt"        TIMESTAMP(3),
  "lockedBy"        TEXT,
  "lastError"       TEXT,
  "processedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentWebhookEvent_provider_deliveryId_key" UNIQUE ("provider", "deliveryId")
);

CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_status_nextAttemptAt_idx"
  ON "PaymentWebhookEvent" ("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_provider_correlationKey_idx"
  ON "PaymentWebhookEvent" ("provider", "correlationKey");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_createdAt_idx"
  ON "PaymentWebhookEvent" ("createdAt");

-- OutboxEvent
CREATE TABLE IF NOT EXISTS "OutboxEvent" (
  "id"              TEXT PRIMARY KEY,
  "eventType"       TEXT NOT NULL,
  "aggregateType"   TEXT NOT NULL,
  "aggregateId"     TEXT NOT NULL,
  "payload"         JSONB NOT NULL,
  "dedupeKey"       TEXT,
  "status"          TEXT NOT NULL DEFAULT 'pending',
  "attempts"        INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt"   TIMESTAMP(3),
  "lockedAt"        TIMESTAMP(3),
  "lockedBy"        TEXT,
  "lastError"       TEXT,
  "processedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "OutboxEvent_dedupeKey_key"
  ON "OutboxEvent" ("dedupeKey");
CREATE INDEX IF NOT EXISTS "OutboxEvent_status_nextAttemptAt_idx"
  ON "OutboxEvent" ("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_eventType_createdAt_idx"
  ON "OutboxEvent" ("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_aggregateType_aggregateId_idx"
  ON "OutboxEvent" ("aggregateType", "aggregateId");

-- AdminReconciliation
CREATE TABLE IF NOT EXISTS "AdminReconciliation" (
  "id"                TEXT PRIMARY KEY,
  "idempotencyKey"    TEXT NOT NULL,
  "adminId"           TEXT NOT NULL,
  "reason"            TEXT NOT NULL,
  "paymentWebhookEventId" TEXT,
  "provider"          TEXT,
  "providerReference" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminReconciliation_idempotencyKey_key" UNIQUE ("idempotencyKey")
);

CREATE INDEX IF NOT EXISTS "AdminReconciliation_adminId_createdAt_idx"
  ON "AdminReconciliation" ("adminId", "createdAt");

-- FK guards (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminReconciliation_adminId_fkey') THEN
    ALTER TABLE "AdminReconciliation"
      ADD CONSTRAINT "AdminReconciliation_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminReconciliation_paymentWebhookEventId_fkey') THEN
    ALTER TABLE "AdminReconciliation"
      ADD CONSTRAINT "AdminReconciliation_paymentWebhookEventId_fkey"
      FOREIGN KEY ("paymentWebhookEventId") REFERENCES "PaymentWebhookEvent"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- PG LISTEN/NOTIFY trigger on OutboxEvent INSERT.
-- Fires pg_notify('payment_outbox', NEW.id::text) on every insert.
-- The V1.5 dispatcher is a polling cron (Vercel serverless can't
-- hold a LISTEN connection), but the trigger is in place for
-- V2's long-lived worker (Fly.io, Railway, etc.) — no schema
-- change needed when the worker topology evolves.
CREATE OR REPLACE FUNCTION notify_outbox_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('payment_outbox', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS outbox_event_notify ON "OutboxEvent";
CREATE TRIGGER outbox_event_notify
  AFTER INSERT ON "OutboxEvent"
  FOR EACH ROW
  EXECUTE FUNCTION notify_outbox_event();
```

---

## 3. Webhook receipt

The route handlers at
`src/app/api/webhooks/lemonsqueezy/route.ts` and
`src/app/api/webhooks/stripe/route.ts` are slimmed to
HMAC verification + inbox insertion. Business logic moves
to `applyPaymentEvent` (§ 4) called by the worker (§ 5).

### 3.1 Receipt path (shared helper)

Both webhook routes share a helper that:
1. Verifies the HMAC.
2. Parses the payload.
3. Extracts `deliveryId` and `correlationKey` per provider.
4. INSERTs a `PaymentWebhookEvent` row (P2002 on duplicate → 200).
5. Returns 200 immediately.

```typescript
// src/lib/commerce/payments/receive-webhook.ts (new)
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { verifyLemonSqueezyHmac } from "./providers/lemonsqueezy/verify-hmac";
import { verifyStripeHmac } from "./providers/stripe/verify-hmac";
import type { NextRequest } from "next/server";

export async function receiveWebhook(
  request: NextRequest,
  provider: "lemonsqueezy" | "stripe"
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  // 1. HMAC verification
  const rawBody = await request.text();
  const hmacOk = provider === "lemonsqueezy"
    ? verifyLemonSqueezyHmac(rawBody, request.headers.get("x-signature"))
    : verifyStripeHmac(rawBody, request.headers.get("stripe-signature"));
  if (!hmacOk) {
    return { ok: false, status: 400, error: "Invalid signature" };
  }

  // 2. Parse
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }

  // 3. Extract delivery + correlation
  const { deliveryId, eventType, correlationKey } = provider === "lemonsqueezy"
    ? extractLsIds(payload)
    : extractStripeIds(payload);

  // 4. Insert into inbox (idempotent on (provider, deliveryId))
  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        provider,
        deliveryId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        correlationKey,
        status: "received",
      },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Duplicate delivery — already in the inbox. The worker
      // has either processed it or has it scheduled. Ack the
      // provider so they stop retrying.
      return { ok: true };
    }
    throw err;  // unexpected DB error → 500
  }

  // 5. Ack immediately. The worker handles the rest.
  return { ok: true };
}

// Provider-specific extractors
function extractLsIds(payload: Record<string, unknown>): { deliveryId: string; eventType: string; correlationKey: string | null } {
  const data = payload.data as { id: string | number } | undefined;
  const eventName = (payload.meta as { event_name?: string } | undefined)?.event_name ?? "unknown";
  const deliveryId = `LS-${data?.id}-${eventName}`;
  const correlationKey = data?.id ? String(data.id) : null;
  return { deliveryId, eventType: eventName, correlationKey };
}

function extractStripeIds(payload: Record<string, unknown>): { deliveryId: string; eventType: string; correlationKey: string | null } {
  const id = (payload.id as string | undefined) ?? "";
  const eventType = (payload.type as string | undefined) ?? "unknown";
  // The correlation key MUST be the right field per event type,
  // because the Order lookup is keyed differently for each:
  //   - checkout.session.*       → Order.stripeSessionId (= obj.id)
  //   - charge.refunded          → Order.stripeSessionId via payment_intent
  //                                  (we look up the session by payment_intent
  //                                  in markOrderRefunded)
  //   - invoice.payment_failed   → Order.stripeSubscriptionId
  //                                  (extracted from invoice.subscription)
  //   - customer.subscription.*  → Order.stripeSubscriptionId (= obj.id)
  // A wrong key silently fails the Order lookup → NotFoundError →
  // dead-letter. The shape is event-type-aware.
  const data = payload.data as { object?: Record<string, unknown> } | undefined;
  const obj = data?.object ?? {};
  let correlationKey: string | null = null;
  switch (eventType) {
    case "checkout.session.completed":
    case "checkout.session.expired":
      correlationKey = (obj.id as string | undefined) ?? null;
      break;
    case "charge.refunded":
      // markOrderRefunded looks up the session via payment_intent.
      correlationKey = (obj.payment_intent as string | undefined) ?? null;
      break;
    case "invoice.payment_failed":
      // markOrderFailedForInvoice looks up via stripeSubscriptionId
      // (extracted from invoice.subscription).
      correlationKey = (obj.subscription as string | undefined) ?? null;
      break;
    case "customer.subscription.deleted":
    case "customer.subscription.updated":
      correlationKey = (obj.id as string | undefined) ?? null;
      break;
    default:
      // Fallback for unknown event types — the worker will
      // classify the row via eventType and the empty correlation
      // key will trigger a NotFoundError → dead-letter (visible
      // to ops rather than silently dropped).
      correlationKey = null;
  }
  return { deliveryId: id, eventType, correlationKey };
}
```

**Why ack immediately (not after worker processes):** the
provider's retry policy is opaque and noisy. A 200 means
"we have the event, stop retrying." The worker has 6
attempts over ~31h (1m + 5m + 30m + 2h + 12h + 24h) to
process. If a critical bug kills the worker, ops sees the
dead-letter rows and replays manually.

**Why the raw body is not stored:** HMAC verified at receipt.
Storing the raw body would add no security (HMAC is
re-verified on replay) and would inflate the table ~10×.

**Why `extractLsIds` and `extractStripeIds` are separate
helpers:** the LS `deliveryId` is a composite
(`data.id + event_name`); the Stripe `deliveryId` is
`event.id` directly. The shapes diverge. Keeping them
separate is clearer than a polymorphic extractor.

---

## 4. `applyPaymentEvent` canonical command

The single source of truth for "an order was paid for /
refunded / subscription state changed." Called by:
- The webhook worker (§ 5) for inbox events.
- The admin reconciliation endpoint (§ 6) via inbox insertion.
- Future V2: the provider API polling worker (Phase 4) for
  missed events.

```typescript
// src/lib/commerce/payments/apply-payment-event.ts (new)
import { prisma } from "@/lib/db/prisma";
import { NotFoundError, ValidationError, AppError } from "@/lib/errors";
import { processOrder } from "@/lib/commerce/orders/complete-order";
import type { PaymentEvent } from "./types";

export interface ApplyPaymentEventInput {
  // The inbox event id (for the worker's bookkeeping) OR null
  // (for V2 API-driven invocation).
  inboxEventId: string | null;
  // The verified PaymentEvent from the inbox.
  event: PaymentEvent;
}

/**
 * Apply a verified PaymentEvent to the database. This is the
 * single source of truth for what an LS/Stripe webhook means.
 *
 * Returns { orderId } on success. Throws on retryable errors
 * (caller schedules a retry) or non-retryable errors (caller
 * dead-letters).
 */
export async function applyPaymentEvent(
  input: ApplyPaymentEventInput
): Promise<{ orderId: string | null }> {
  const { event } = input;

  // ── Common path: resolve user + product (via the existing
  // processOrder adapter) ──────────────────────────────────
  // processOrder(input: ProcessOrderInput) handles find-or-create
  // user + resolve product + idempotency + dual-write AccessGrant.
  // We just translate PaymentEvent → ProcessOrderInput. This keeps
  // the user/product resolution logic in one place.
  const processOrderInput = adaptPaymentEventToProcessOrder(event);
  if (processOrderInput) {
    await processOrder(processOrderInput);
    // The order id is returned by processOrder in V2 (addendum);
    // for V1.5 we look it up from the inbox's correlation key.
    const order = await prisma.order.findFirst({
      where: {
        paymentProvider: event.provider,
        providerOrderId: extractProviderOrderId(event),
      },
      select: { id: true },
    });
    return { orderId: order?.id ?? null };
  }

  // ── Event-type-specific path ──────────────────────────────
  // For events that DON'T go through processOrder (subscription
  // cancellation, refund, invoice payment failed, etc.):
  switch (event.eventType) {
    case "subscription_cancelled":
    case "subscription_payment_failed":
    case "customer.subscription.deleted":
    case "invoice.payment_failed": {
      return await revokeSubscriptionAccess(event);
    }
    case "order_refunded":
    case "charge.refunded": {
      return await markOrderRefunded(event);
    }
    case "checkout.session.expired": {
      return await markOrderFailed(event);
    }
    default: {
      // Unknown event type. The current code would `return` and
      // ack; here we throw ValidationError so the row is
      // dead-lettered (visible to ops) instead of silently dropped.
      throw new ValidationError(`Unsupported event type: ${event.eventType}`);
    }
  }
}
```

**Why a single function with a switch (not a registry):** the
event-type-specific code paths share a lot — they all need
the order lookup, the AccessGrant revocation, the email
suppression check, the analytic event. A registry of
handlers would duplicate this glue. A switch keeps the
shared logic visible.

**Why `processOrder` is called with an adapter, not inlined:**
the existing `processOrder` function (src/lib/commerce/orders/complete-order.ts)
already has 8+ steps with battle-tested error handling. Inlining
its body into `applyPaymentEvent` would duplicate 200+ lines
and create two paths to drift. The adapter is ~30 lines and
is the only place that knows the LS-vs-Stripe payload shape.

**Why a `ValidationError` on unknown event types (instead of
silent return):** the current code's `if (alreadyProcessed)
return` masks new event types from the provider — they get
acked but never processed. Phase 2 dead-letters them, making
the gap visible to ops.

### 4.1 PaymentEvent → ProcessOrderInput adapter

```typescript
// src/lib/commerce/payments/event-to-process-order.ts (new)
import type { PaymentEvent } from "./types";
import type { CompletePaidOrderCommand } from "@/lib/commerce/payments/types";

export function adaptPaymentEventToProcessOrder(
  event: PaymentEvent
): ProcessOrderInput | null {
  const custom = (event.payload?.custom ?? {}) as {
    courseSlug?: string;
    locale?: string;
    email?: string;
    channelId?: string;
  };
  const sessionOrOrder = extractSessionOrOrder(event);

  // Event types that produce a new order
  const ORDER_EVENTS: Record<string, true> = {
    "order_created": true,
    "subscription_created": true,
    "checkout.session.completed": true,
  };
  if (!ORDER_EVENTS[event.eventType]) return null;

  return {
    email: custom.email ?? extractEmail(event) ?? "",
    productSlug: custom.courseSlug,
    variantId: extractVariantId(event),
    stripeSessionId: extractStripeSessionId(event),
    providerOrderId: extractProviderOrderId(event),
    paymentProvider: event.provider === "stripe" ? "stripe" : "lemonsqueezy",
    amount: extractAmount(event),
    currency: extractCurrency(event),
    locale: custom.locale ?? "it",
    customerCountry: extractCountry(event),
  };
}
```

**Why `null` is returned for non-order events:** the event-type
switch in `applyPaymentEvent` handles the subscription/refund/fail
events separately. The adapter only translates "produce a new
order" events.

**Why `custom.email` is the primary email source, with
`extractEmail(event)` as fallback:** Phase 3's CheckoutIntent
sets `custom.email` in the LS `createCheckout` (the existing
LS code already does this). The fallback handles older LS
orders where `custom.email` wasn't set (pre-Phase 3) and
Stripe events that put the email elsewhere.

### 4.2 Event-type-specific handlers

The three handlers (`revokeSubscriptionAccess`,
`markOrderRefunded`, `markOrderFailed`) are small
specializations of the same pattern:

```typescript
async function revokeSubscriptionAccess(event: PaymentEvent): Promise<{ orderId: string | null }> {
  // 1. Find the order by correlation key
  const order = await findOrderByCorrelationKey(event);
  if (!order) {
    // No matching order — the subscription event is for a
    // sub we don't recognize. Log and return null (idempotent
    // no-op; the row is dead-lettered with a clear error).
    throw new NotFoundError(`No order found for ${event.provider} subscription event ${event.correlationKey}`);
  }
  // 2. UpdateMany with status guard (race-safe)
  await prisma.order.updateMany({
    where: {
      id: order.id,
      status: "completed",  // only downgrade completed orders
    },
    data: { status: "failed" },
  });
  // 3. Revoke the AccessGrant (PR 2 dual-write)
  await prisma.accessGrant.updateMany({
    where: {
      sourceType: "order",
      sourceId: order.id,
      status: "active",
    },
    data: { status: "revoked", revokedAt: new Date() },
  });
  return { orderId: order.id };
}

async function markOrderRefunded(event: PaymentEvent): Promise<{ orderId: string | null }> {
  const order = await findOrderRefundedOrder(event);
  if (!order) throw new NotFoundError(`No order found for refund event ${event.correlationKey}`);
  // Stripe's charge.refunded fires for FULL refunds only (the
  // current code's `if (!charge.refunded) return` guard). LS's
  // order_refunded also fires for full refunds. For partial
  // refunds (V2): extract refundLines and decrement Order.amount.
  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: "completed" },
    data: { status: "refunded" },
  });
  if (updated.count === 0) {
    // Order was already refunded or in another terminal state.
    // Idempotent no-op.
    return { orderId: order.id };
  }
  // Revoke the AccessGrant
  await prisma.accessGrant.updateMany({
    where: { sourceType: "order", sourceId: order.id, status: "active" },
    data: { status: "revoked", revokedAt: new Date() },
  });
  return { orderId: order.id };
}

// Stripe-specific: charge.refunded's correlation key is the
// payment_intent, but Order.stripeSessionId is the lookup column.
// We translate payment_intent → session via the Stripe API (V2 may
// cache this in the inbox payload if the provider returns both).
async function findOrderRefundedOrder(event: PaymentEvent): Promise<{ id: string } | null> {
  if (event.provider !== "stripe" || event.eventType !== "charge.refunded") {
    return findOrderByCorrelationKey(event);
  }
  // For charge.refunded, correlationKey is the payment_intent. Look
  // up the session via the Stripe API. If the API call fails, retryable.
  // (V2: have the webhook handler also stash session_id in the payload
  // to avoid the extra round-trip.)
  const sessions = await getStripe().checkout.sessions.list({
    payment_intent: event.correlationKey ?? "",
    limit: 1,
  });
  const sessionId = sessions.data[0]?.id;
  if (!sessionId) return null;
  return prisma.order.findFirst({
    where: { stripeSessionId: sessionId },
    select: { id: true },
  });
}

async function markOrderFailed(event: PaymentEvent): Promise<{ orderId: string | null }> {
  // checkout.session.expired and similar "order never completed"
  // events. The current code does `updateMany({ stripeSessionId,
  // status: 'completed' }) → { status: 'failed' }` — i.e.,
  // downgrade a completed order to failed when the session
  // expires. The semantics: an expired session may have been
  // marked completed by a delayed webhook; the expiry event
  // arrives later; we flip the status to failed to be safe.
  //
  // The AccessGrant stays active (the order DID complete at some
  // point; the expiry is a UX signal, not an access revocation).
  // If the customer disputes the charge later, the refund
  // webhook fires and revokeSubscriptionAccess / markOrderRefunded
  // does the actual revocation.
  const updated = await prisma.order.updateMany({
    where: {
      stripeSessionId: event.correlationKey ?? "",
      status: "completed",  // only downgrade completed orders
    },
    data: { status: "failed" },
  });
  if (updated.count === 0) {
    // No matching order, or order already in another state. The
    // current code logs "no matching completed orders found" and
    // moves on. We return null (idempotent no-op).
    return { orderId: null };
  }
  return { orderId: null };  // session-expiry doesn't bind to a single order
}
```

**Why `updateMany` (not `update`) with a status guard:** the
inbox could deliver a refund event for an order that's
already been refunded (provider retry, V2 admin
re-reconciliation). The `status: 'completed'` guard makes
the second pass a no-op. `update` without the guard would
overwrite a "refunded" status with "failed" if the second
pass is a "revoke for non-payment" event.

**Why `NotFoundError` is thrown (not returned):** the
worker's `isRetryable` classifies `NotFoundError` as
non-retryable → the row is dead-lettered. An unknown order
id is a permanent error (the data won't change on retry);
retrying is just noise. The error is logged with the
correlation key for ops to investigate.

---

## 5. Worker endpoint

The cron worker at
`/api/internal/jobs/payment-webhooks` (and the parallel
`/api/internal/jobs/outbox-dispatch` for outbox events)
drains due rows. Both workers share a `drainDueEvents`
helper that abstracts the SKIP LOCKED + backoff + dead-letter
logic.

### 5.1 `drainDueEvents` helper

```typescript
// src/lib/commerce/payments/drain-due-events.ts (new)

const BACKOFF_LADDER_MS = [
  60_000,        // 1 minute
  300_000,       // 5 minutes
  1_800_000,     // 30 minutes
  7_200_000,     // 2 hours
  43_200_000,    // 12 hours
  86_400_000,    // 24 hours
];
const MAX_ATTEMPTS = 6;
const LOCK_TTL_MS = 5 * 60 * 1000;  // 5 minutes
const BATCH_SIZE = 50;

export async function drainDueInboxEvents(): Promise<{
  processed: number; retried: number; deadLettered: number;
}> {
  return drainDue({
    table: "paymentWebhookEvent",
    processOne: processInboxEvent,
  });
}

export async function drainDueOutboxEvents(): Promise<{
  processed: number; retried: number; deadLettered: number;
}> {
  return drainDue({
    table: "outboxEvent",
    processOne: processOutboxEvent,
  });
}

async function drainOneBatch(
  table: "paymentWebhookEvent" | "outboxEvent",
  processOne: (id: string) => Promise<void>
): Promise<{ processed: number; retried: number; deadLettered: number }> {
  // Atomic claim: SELECT ... FOR UPDATE SKIP LOCKED + UPDATE status=processing.
  // The claim and the status flip are in the same transaction so
  // a parallel worker can't double-claim.
  //
  // The "where" criteria:
  //   - status in (received|pending, retry_scheduled)  — not already done
  //   - nextAttemptAt is null OR <= now()              — due for processing
  //   - lockedAt is null OR < now() - 5min             — not locked by a live worker
  //
  // The status='processing' flip is the worker's claim marker.
  // A second worker would skip this row (status != 'received'/'pending'/'retry_scheduled').
  //
  // Implementation note: Prisma's $transaction supports interactive
  // transactions, but FOR UPDATE SKIP LOCKED requires a raw query.
  // We use $executeRaw for the claim + $transaction for the per-row
  // processing. The lock is released on transaction commit.
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "${table}" SET "status" = 'processing', "lockedAt" = NOW(), "lockedBy" = ${process.env.HOSTNAME ?? 'unknown'}, "updatedAt" = NOW()
      WHERE "id" IN (
        SELECT "id" FROM "${table}"
        WHERE "status" IN ('received', 'pending', 'retry_scheduled')
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '5 minutes')
        ORDER BY "nextAttemptAt" ASC NULLS FIRST, "createdAt" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `;
    return rows.map((r) => r.id);
  });

  let processed = 0, retried = 0, deadLettered = 0;
  // Per-row timeout: 2 seconds. A single slow row (a stuck Prisma
  // query, a slow downstream call) MUST NOT push the Vercel
  // function past its 10s hard limit and silently drop the rest
  // of the batch. A timeout is treated as a retryable error:
  // the row is rescheduled with the standard backoff, the rest
  // of the batch is processed normally. The hard cap of
  // BATCH_SIZE * 2s = 100s in the worst case is theoretical
  // (the 2s timeout includes the lock TTL reclaim, not the
  // total budget) — in practice the average row completes in
  // < 200ms, and the per-row timeout is a safety net.
  const PER_ROW_TIMEOUT_MS = 2_000;
  for (const id of claimed) {
    try {
      await Promise.race([
        processOne(id),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Worker per-row timeout after ${PER_ROW_TIMEOUT_MS}ms`)), PER_ROW_TIMEOUT_MS)
        ),
      ]);
      await prisma[table].update({
        where: { id },
        data: { status: "completed", processedAt: new Date(), lockedAt: null, lockedBy: null },
      });
      processed++;
    } catch (err: unknown) {
      const isLastAttempt = (await getAttempts(id)) >= MAX_ATTEMPTS;
      const isNonRetryable = !isRetryable(err);
      if (isLastAttempt || isNonRetryable) {
        await prisma[table].update({
          where: { id },
          data: {
            status: "dead_letter",
            lastError: truncate(String(err instanceof Error ? err.message : err), 1024),
            lockedAt: null,
            lockedBy: null,
            processedAt: new Date(),
          },
        });
        deadLettered++;
      } else {
        const attempts = (await getAttempts(id)) + 1;
        const backoffMs = BACKOFF_LADDER_MS[Math.min(attempts - 1, BACKOFF_LADDER_MS.length - 1)];
        await prisma[table].update({
          where: { id },
          data: {
            status: "retry_scheduled",
            attempts: { increment: 1 },
            nextAttemptAt: new Date(Date.now() + backoffMs),
            lastError: truncate(String(err instanceof Error ? err.message : err), 1024),
            lockedAt: null,
            lockedBy: null,
          },
        });
        retried++;
      }
    }
  }

  return { processed, retried, deadLettered };
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return true;  // unknown errors are retryable
  if (err instanceof NotFoundError) return false;  // data won't change
  if (err instanceof ValidationError) return false;  // deterministic business error
  // Check for transient patterns
  const msg = err.message.toLowerCase();
  if (msg.includes("econnrefused")) return true;
  if (msg.includes("timeout")) return true;
  if (msg.includes("rate limit")) return true;
  // Default: retry. Conservative.
  return true;
}
```

**Why `FOR UPDATE SKIP LOCKED` over `SELECT ... FOR UPDATE`:**
multiple workers (Vercel cron can run overlapping if a
previous run is slow) might be active. `SKIP LOCKED` lets
each worker claim a different subset of rows without
blocking. PG's default `FOR UPDATE` would serialize the
workers — fine at 1/min but a bottleneck at higher
throughput.

**Why the status flip is in the same transaction as the
SELECT:** the `processing` status is the worker's claim
marker. A second worker that sees `status='processing'`
skips the row. The atomicity of the claim + status flip
prevents a race where worker A claims a row, worker B sees
`received` (not yet flipped), and both try to process.

**Why `nextAttemptAt ASC NULLS FIRST`:** rows awaiting
their first pickup have `nextAttemptAt IS NULL` — those
are sorted first. Rows awaiting retry are sorted by their
scheduled time. FIFO with retry-awareness.

**Why `LOCK_TTL_MS = 5 minutes`:** Vercel cron runs every
minute. A function that takes > 1 minute to complete (rare
but possible with 50 rows) would be re-claimed by the next
cron. A 5-minute TTL is a safety net for OOM/timeout —
beyond 5 minutes, the row is considered abandoned and
re-claimable.

**Why `MAX_ATTEMPTS = 6`:** the backoff ladder tops out at
24h. The 6th attempt fires 24h+ after the first. Beyond
that, the failure is unlikely to resolve without operator
intervention. Dead-letter and alert.

**Why `isRetryable` defaults to retry:** a new error type
added in V2 (e.g., a `DatabaseConnectionError` from
Prisma) shouldn't be classified as fatal without
explicit opt-in. The default of "retry" is the safe
choice for a transient-friendly world.

### 5.2 Worker endpoint

```typescript
// src/app/api/internal/jobs/payment-webhooks/route.ts (new)
// + src/app/api/internal/jobs/outbox-dispatch/route.ts (new)
import { NextRequest, NextResponse } from "next/server";
import { drainDueInboxEvents } from "@/lib/commerce/payments/drain-due-events";

async function POST(request: NextRequest) {
  // ── Auth: CRON_SECRET bearer (matches the existing
  //    /api/cron/abandoned-checkouts pattern) ──
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await drainDueInboxEvents();
  return NextResponse.json(result);
}

export { POST };
```

**Why `POST` (not `GET`):** Vercel Cron can invoke either
method, but `POST` is the convention for "the cron is
running work" (a `GET` is conventionally safe/idempotent
for HTTP semantics). The existing
`/api/cron/abandoned-checkouts/route.ts` uses `GET` for
historical reasons; Phase 2 sets the new convention.

**Why no rate-limiting middleware:** the endpoint is
CRON_SECRET-protected. Rate-limiting a CRON-secret caller
is moot — the secret is the rate limit. V2 may add an
IP-based allowlist (Vercel's egress IP range) as defense
in depth.

### 5.3 Vercel Cron config

```json
{
  "crons": [
    { "path": "/api/cron/check-supabase-pitr",   "schedule": "0 9 * * 1" },
    { "path": "/api/internal/jobs/payment-webhooks", "schedule": "* * * * *" },
    { "path": "/api/internal/jobs/outbox-dispatch",  "schedule": "* * * * *" }
  ]
}
```

The inbox + outbox workers run every minute. The PITR
checker stays weekly. (Phase 3 will add a third
`/api/internal/jobs/checkout-recovery` on `*/5 * * * *` —
out of scope for Phase 2.)

---

## 6. Admin reconciliation endpoint

`POST /api/admin/payments/reconciliations` — admin role +
`idempotencyKey` + `reason` + optional `provider` /
`providerReference` → insert into `PaymentWebhookEvent`,
ack 202. The worker handles the rest.

```typescript
// src/app/api/admin/payments/reconciliations/route.ts (new)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getServerUser } from "@/lib/supabase/get-user";
import { NotFoundError, apiErrorResponse } from "@/lib/errors";

const Body = z.object({
  idempotencyKey: z.string().min(1).max(200),
  reason: z.string().min(10).max(1000),
  // Required when synthesizing from a known provider event.
  // (For pure "manually trigger order" reconciliations without
  // a provider reference, these are nullable.)
  provider: z.enum(["lemonsqueezy", "stripe"]).optional(),
  providerReference: z.string().optional(),
  // The event payload to apply. For "re-apply" (an existing
  // inbox row), the admin pastes the original payload. For
  // "synthesize" (a manual order), the admin fills in the
  // minimal payload (email, courseSlug, amount, currency).
  payload: z.record(z.unknown()),
  // The provider's eventType (for the inbox row's routing).
  eventType: z.string(),
});

export async function POST(request: NextRequest) {
  // ── Auth: admin role ──────────────────────────────────
  const { user, dbUser } = await getServerUser();
  if (!user || !dbUser || dbUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { idempotencyKey, reason, provider, providerReference, payload, eventType } = parsed.data;

  // ── 1. Idempotency: create AdminReconciliation first ──
  // P2002 on idempotencyKey = duplicate reconciliation,
  // safe to look up the existing row + return.
  let adminReconciliation;
  try {
    adminReconciliation = await prisma.adminReconciliation.create({
      data: {
        idempotencyKey,
        adminId: dbUser.id,
        reason,
        provider: provider ?? null,
        providerReference: providerReference ?? null,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.adminReconciliation.findUnique({
        where: { idempotencyKey },
        include: { paymentWebhookEvent: true },
      });
      return NextResponse.json({
        ok: true,
        deduplicated: true,
        adminReconciliationId: existing?.id,
        paymentWebhookEventId: existing?.paymentWebhookEventId,
      });
    }
    throw err;
  }

  // ── 2. Synthesize a deliveryId and insert the inbox row ──
  // The deliveryId is a synthetic "admin-reconcile:{idempotencyKey}"
  // so a future provider delivery of the same real event would
  // hit P2002 (we have it; no need to re-process).
  const syntheticDeliveryId = `admin-reconcile:${idempotencyKey}`;
  const correlationKey = providerReference ?? null;

  let paymentWebhookEvent;
  try {
    paymentWebhookEvent = await prisma.paymentWebhookEvent.create({
      data: {
        provider: provider ?? "admin",
        deliveryId: syntheticDeliveryId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        correlationKey,
        status: "received",
      },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // The synthetic deliveryId collides with a prior
      // reconciliation — return the existing row.
      paymentWebhookEvent = await prisma.paymentWebhookEvent.findUniqueOrThrow({
        where: { provider_deliveryId: { provider: provider ?? "admin", deliveryId: syntheticDeliveryId } },
      });
    } else {
      throw err;
    }
  }

  // ── 3. Back-pointer update on AdminReconciliation ──
  await prisma.adminReconciliation.update({
    where: { id: adminReconciliation.id },
    data: { paymentWebhookEventId: paymentWebhookEvent.id },
  });

  // ── 4. Return 202 Accepted. The worker handles the rest. ──
  return NextResponse.json({
    ok: true,
    adminReconciliationId: adminReconciliation.id,
    paymentWebhookEventId: paymentWebhookEvent.id,
    message: "Reconciliation queued. The worker will apply it within ~1 minute.",
  }, { status: 202 });
}
```

**Why insert into the inbox (not call `applyPaymentEvent`
directly):** the admin gets the same observability + retry
semantics as a real provider event. If `applyPaymentEvent`
throws, the row retries. If the admin's payload has a bug
(missing email, wrong productSlug), the row is dead-lettered
and visible. Direct call would bypass the worker and lose
this.

**Why a `syntheticDeliveryId` of `admin-reconcile:{key}`:** a
real provider event with the same `idempotencyKey` (extremely
unlikely but possible) hits P2002, the admin's row is the
one processed, and the provider's row is silently
de-duplicated. The dedupe is fail-safe.

**Why the admin is a separate `provider` value of `"admin"`:**
the inbox's `@@unique([provider, deliveryId])` requires
`provider` to be one of the known values. A separate `"admin"`
provider makes the inbox queryable for "show me all
admin-reconciled events" without a special flag.

**Why `202 Accepted` (not 200):** the reconciliation is
queued, not yet applied. The status code signals async
semantics. The admin UI can poll the inbox row for
`status='completed'`.

**Why no Vercel-Cron-style trigger for the admin endpoint:**
admin reconciliations are rare (a few per week) and need
explicit human intent. The next worker tick (1 min) is
acceptable latency. A "process now" admin button could
be added in V2 (calls the worker endpoint internally).

---

## 7. Outbox consumer registry

The dispatcher (§ 5) is event-type-agnostic. Domain logic
lives in registered consumers. Phase 2 ships the registry
itself; Phase 3 (CheckoutIntent), Phase 5 (CustomerProductInsight),
and Phase 6 (PrivateOffer) register their consumers in
follow-up PRs.

```typescript
// src/lib/commerce/outbox/consumers.ts (new)
type ConsumerHandler = (event: {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}) => Promise<void>;

const consumers = new Map<string, ConsumerHandler[]>();

export function registerConsumer(eventType: string, handler: ConsumerHandler): void {
  const existing = consumers.get(eventType) ?? [];
  existing.push(handler);
  consumers.set(eventType, existing);
}

export async function dispatchOutboxEvent(event: {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const handlers = consumers.get(event.eventType) ?? [];
  // Empty-consumer guard: an event with no registered handlers
  // is almost always a bug (the publisher didn't realize no
  // consumer was registered, or a Phase 3/5/6 consumer hasn't
  // shipped yet). Logging a WARN with the event type + id makes
  // the gap visible in the Vercel runtime logs. The dispatcher
  // does NOT throw — the row is still marked `completed`
  // (otherwise the same no-op event would retry every cron
  // tick forever). V2 addendum: an `unhandledEvents` counter
  // for a dedicated alert.
  if (handlers.length === 0) {
    console.warn(
      `[OutboxDispatcher] No consumer registered for eventType='${event.eventType}', ` +
      `aggregateType='${event.aggregateType}', aggregateId='${event.aggregateId}', ` +
      `eventId='${event.id}'. Marking as completed to avoid infinite retry. ` +
      `Register a handler in src/lib/commerce/outbox/consumers.ts.`
    );
    return;
  }
  // Run all handlers in sequence. (Parallelism is a V2 addendum —
  // a handler that fails partway shouldn't block its peers.)
  for (const handler of handlers) {
    await handler(event);
  }
}
```

**Why sequence (not `Promise.all`):** if consumer A and
consumer B both write to the same `Order` row, parallel
writes would race. Sequence is the safe default. V2 may
add a "concurrency-safe" tag per consumer.

**Why `Map<string, ConsumerHandler[]>` (multiple consumers
per eventType):** the `order.completed` event is consumed
by Phase 5's `CustomerProductInsight` LTV update AND (V2)
the analytics projection. Both need to fire; both should
succeed independently.

**Why consumers are registered at module load time:** matches
the existing `paymentProviderRegistry` pattern. The
dispatcher looks up handlers from the in-memory map.

**Where Phase 3 + Phase 5 + Phase 6 register their consumers:**

```typescript
// src/lib/commerce/outbox/consumers.ts (continued — examples)

// Phase 3
import { sendAbandonedCheckoutEmail } from "@/lib/services/email";
registerConsumer("checkout.abandoned", async (event) => {
  const { intentId, email, productSlug, locale, checkoutUrl, couponCode } = event.payload as { ... };
  await sendAbandonedCheckoutEmail(email, productSlug, couponUrl ?? checkoutUrl, locale);
});

// Phase 5
import { prisma } from "@/lib/db/prisma";
registerConsumer("order.completed", async (event) => {
  const { orderId, userId, productId, channelId } = event.payload as { ... };
  // Two-step: upsert + updateMany WHERE sourceChannelId IS NULL
  // (see phase-5-customer-insights.md § 4.3 for the rationale)
  await prisma.customerProductInsight.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId, sourceChannelId: channelId ?? null },
    update: {},
  });
  if (channelId) {
    await prisma.customerProductInsight.updateMany({
      where: { userId_productId: { userId, productId }, sourceChannelId: null },
      data: { sourceChannelId: channelId },
    });
  }
});

registerConsumer("order.refunded", async (event) => {
  // Phase 5's RefundInsightLedger idempotency
  // (see phase-5-customer-insights.md § 4.4 for the full code)
});
```

**Why the consumer code is in a separate file (not inline in
the worker):** the consumer is domain logic; the worker is
infra. Splitting them keeps the worker file under 200 lines
and lets domain experts (Phase 3/5/6 owners) own their
consumers without reading the queue code.

---

## 8. Migration from `ProcessedWebhook`

The current `ProcessedWebhook` table is a basic
idempotency table. Phase 2 replaces it with
`PaymentWebhookEvent` (which provides idempotency AND retry
AND dead-letter AND observability). The migration is a
dual-write window:

### 8.1 Step 1 — Add `PaymentWebhookEvent` (Day 0)

**Scope of this step: the table + the receipt helper ONLY. The
worker endpoint is NOT enabled yet.** Enabling the worker
before `applyPaymentEvent` is implemented would mark rows
`status='completed'` with no side effects — silent data
corruption. The strict step ordering is:

- Run the migration `prisma/migrations/20260716XXXXXX_phase2_webhook_inbox/migration.sql`
  (idempotent CREATE TABLE IF NOT EXISTS for all three tables
  + the `pg_notify` trigger).
- Update `src/app/api/webhooks/lemonsqueezy/route.ts` and
  `src/app/api/webhooks/stripe/route.ts` to dual-write:
  the existing `prisma.processedWebhook.create` stays
  (for backward compat with any code that still reads it);
  the new `prisma.paymentWebhookEvent.create` is added.
- The receipt helper (`receiveWebhook`) is wired in. The
  inbox rows accumulate with `status='received'` — no
  worker is draining them yet.
- The webhook handlers STILL call the inline `processOrder`
  path. The inbox rows are dormant for the dual-write
  window. This is intentional: it validates the receipt
  path (HMAC, payload extraction, P2002 dedupe) without
  the worker doing real work yet.
- A daily `cron`-driven check at
  `/api/internal/jobs/inbox-health` (V2 addendum) verifies
  that inbox rows are accumulating and being inserted
  correctly. For Phase 2, an ops manual check
  (`SELECT COUNT(*) FROM "PaymentWebhookEvent" WHERE
  createdAt > now() - INTERVAL '1 hour'`) is sufficient.

### 8.2 Step 2 — Convert `ProcessedWebhook` rows (Day 0, after Step 1)

- Run `scripts/migrate-processed-webhook-to-inbox.ts`
  (one-shot script). For each `ProcessedWebhook` row,
  insert a `PaymentWebhookEvent` row with
  `status='completed', processedAt=createdAt, payload={}`.
- Idempotency: `WHERE NOT EXISTS (SELECT 1 FROM
  "PaymentWebhookEvent" WHERE "provider" = "ProcessedWebhook"."provider"
  AND "deliveryId" = "ProcessedWebhook"."deliveryId")`.
- Capture the conversion count in `docs/audit-log.md`.

### 8.3 Step 3 — Cut over the webhook handler (Day 1+)

- Slim the webhook handlers to HMAC + inbox insertion
  (§ 3.1). The inline `processOrder` call is removed.
- `applyPaymentEvent` is fully implemented.
- The worker drains new inbox rows on the next cron tick.
- Keep the dual-write to `ProcessedWebhook` for the
  duration of the rollout window (1 week of clean prod).

### 8.4 Step 4 — Remove the dual-write (Day 7+)

- After 7d of clean prod (no dead-letter rows, all orders
  reconciling via the worker), remove the
  `prisma.processedWebhook.create` from the handlers.
- `ProcessedWebhook` is now empty and is dropped in
  Phase 7 cleanup.

### 8.5 Step 5 — Cut over the admin reconciliation (Day 7+)

- Enable the `/api/admin/payments/reconciliations`
  endpoint. (It can ship earlier, but the admin
  documentation should be ready before the cutover.)

---

## 9. Implementation steps (after the design lands)

In order of dependency:

1. **Schema migration** —
   `prisma/migrations/20260716XXXXXX_phase2_webhook_inbox/migration.sql`
   with idempotent DDL per § 2.5.
2. **Add `PaymentWebhookEvent`, `OutboxEvent`,
   `AdminReconciliation` to `prisma/schema.prisma`** +
   `npx prisma generate`.
3. **Webhook receipt helper** at
   `src/lib/commerce/payments/receive-webhook.ts` (per § 3.1)
   + provider-specific HMAC verifiers extracted to
   `src/lib/commerce/payments/providers/lemonsqueezy/verify-hmac.ts`
   and `src/lib/commerce/payments/providers/stripe/verify-hmac.ts`.
4. **Slim the webhook handlers** to use `receiveWebhook` + the
   dual-write to `ProcessedWebhook` (per § 8.1).
5. **`applyPaymentEvent` canonical command** at
   `src/lib/commerce/payments/apply-payment-event.ts` (per § 4)
   + the `event-to-process-order.ts` adapter.
6. **`drainDueEvents` helper** at
   `src/lib/commerce/payments/drain-due-events.ts` (per § 5.1).
7. **Worker endpoints** at
   `src/app/api/internal/jobs/payment-webhooks/route.ts` and
   `src/app/api/internal/jobs/outbox-dispatch/route.ts` (per § 5.2).
8. **Outbox consumer registry** at
   `src/lib/commerce/outbox/consumers.ts` (per § 7) — empty
   in this PR; Phase 3/5/6 register their consumers in
   follow-ups.
9. **Admin reconciliation endpoint** at
   `src/app/api/admin/payments/reconciliations/route.ts`
   (per § 6).
10. **Vercel Cron config update** (per § 5.3).
11. **Migration script** at
    `scripts/migrate-processed-webhook-to-inbox.ts` (per § 8.2).
12. **Tests** — unit tests for:
    - `isRetryable` classification (NotFoundError → false, etc.)
    - `BACKOFF_LADDER_MS` array shape
    - `drainDueEvents` SKIP LOCKED behavior (mock the raw query)
    - `applyPaymentEvent` dispatch (LS order_created, Stripe
      checkout.session.completed, both refund paths)
    - `receiveWebhook` P2002 dedupe
    - Admin reconciliation: 202 + idempotency
13. **Operational runbook** at
    `docs/runbooks/phase-2-webhook-inbox.md` (separate doc)
    — covers the dead-letter recovery procedure, the
    orphaned-lock detection query, the "all events stuck in
    processing" alert, the inbox saturation SLO, and the
    PG trigger verification.

---

## 10. What gets simpler in V2

- **Real LISTEN dispatcher.** Fly.io / Railway worker that
  holds a `LISTEN payment_outbox` connection and dispatches
  events in < 1s. The PG trigger is already in place; the
  V1.5 polling cron is replaced by a long-lived worker.
- **Partial-failure outbox status.** The current
  `completed` requires ALL consumers to succeed. V2's
  `partial_failure` tracks per-consumer success, enabling
  per-consumer replay without re-running the whole event.
- **Dead-letter replay UI.** The admin endpoint can list
  dead-letter rows + click "replay" to flip them back to
  `received`. The worker picks them up on the next tick.
- **Provider API polling worker (Phase 4).** Periodically
  calls `retrievePayment` for orders that have been
  `pending` for > 24h and synthesizes an inbox event from
  the API response. The `applyPaymentEvent` function is
  reused; the worker is a new cron.
- **Webhook signature rotation.** A future provider change
  to the HMAC algorithm doesn't require a code change —
  the per-provider `verify-hmac.ts` is the only file that
  knows the algorithm.

---

## 11. Out of scope for Phase 2

- **Phase 3 consumer registration** (`checkout.intent.captured`,
  `checkout.abandoned`). The registry is in place; Phase 3
  adds the consumers in a follow-up PR.
- **Phase 5 consumer registration** (`order.completed`,
  `order.refunded`). Same.
- **Phase 6 `applyPaymentEvent` extension** (the
  PrivateOffer.purchased loop). Phase 6 extends in its
  own PR.
- **The `ProcessedWebhook` table drop.** Phase 7 cleanup.- **The `PaymentWebhookEvent` inbox and shared worker.** These remain future work. The current `sendPurchaseConfirmation` and `prisma.analyticEvent.create` effects are dispatched through `OUTBOX_HANDLER_REGISTRY`; email delivery is guarded by `OutboxDeliveryAttempt`.
- **A real LISTEN dispatcher** on Vercel. The polling cron
  is the V1.5 implementation. The PG trigger is in place
  for V2.
- **The webhook signature rotation flow.** V2.
- **Per-creator webhook configuration.** V2 (a creator with
  a custom LS store would want per-product webhook URLs).

---

## 12. References

- `prisma/schema.prisma` — the existing `ProcessedWebhook`,
  `Order`, `AccessGrant`, `User`, `Product`, `Coupon`,
  `AbandonedCheckout`, `AnalyticEvent` models that Phase 2
  extends (FKs, indexes).
- `src/lib/commerce/orders/complete-order.ts` — the
  `processOrder` function that `applyPaymentEvent`'s
  adapter translates to (PR 2's `AccessGrant` dual-write
  stays; the inline email + analytics stay for V1.5).
- `src/app/api/webhooks/lemonsqueezy/route.ts` — the
  current LS webhook handler that Phase 2 slims to
  HMAC + inbox insertion.
- `src/app/api/webhooks/stripe/route.ts` — the current
  Stripe webhook handler that Phase 2 slims likewise.
- `src/lib/commerce/payments/types.ts` — the
  `PaymentEvent`, `RawWebhook`, `CreateCheckoutInput`,
  `PaymentProvider` interfaces. Phase 2 doesn't change
  the surface contract; `applyPaymentEvent` consumes
  `PaymentEvent`.
- `src/lib/commerce/payments/providers/lemonsqueezy/index.ts`
  — the LS provider's `parseWebhook` stub
  (`NOT_IMPLEMENTED_PHASE_2`). Phase 2 implements it (the
  real HMAC verification + payload parsing + deliveryId
  extraction).
- `src/app/api/cron/abandoned-checkouts/route.ts` — the
  `CRON_SECRET` bearer pattern that the new
  `/api/internal/jobs/*` endpoints mirror.
- `src/app/api/admin/orders/route.ts` — the admin
  endpoint pattern (role check, NextResponse shape) that
  `/api/admin/payments/reconciliations` follows.
- `src/lib/errors.ts` — the `NotFoundError`,
  `ValidationError`, `AppError` types used by
  `isRetryable` for non-retryable classification.
- `vercel.json` — the existing cron config. Phase 2 adds
  two entries.
- `src/lib/env.ts` — `CRON_SECRET` (already validated
  as `optional: true`).
- `docs/phase-3-checkout-intent.md` — the consumer
  registration target for `checkout.intent.captured` and
  `checkout.abandoned` (Phase 3 PR).
- `docs/phase-5-customer-insights.md` — the consumer
  registration target for `order.completed` and
  `order.refunded` (Phase 5 PR).
- `docs/phase-6-private-offer.md` — the `applyPaymentEvent`
  extension that Phase 6 adds in a follow-up PR.
- `prisma/migrations/20260712230000_add_access_grants/migration.sql`
  — the PR 2 idempotent DDL pattern that Phase 2 mirrors.
- `prisma/migrations/20260710110006_add_processed_webhooks/migration.sql`
  — the existing `ProcessedWebhook` migration that Phase 2
  supersedes.
- `prisma/migrations/20260713XXXXXX_phase3_checkout_intent/migration.sql`
  (future) — the migration that adds `RecoveryPolicy` and
  the cron worker for `checkout.abandoned` (depends on
  Phase 2's outbox).
- PR 1 (`3c217e2`) — `paymentProviderRegistry` interface
  (the LS `parseWebhook` is now a real implementation).
- PR 2 (`afc288d`) — `AccessGrant` dual-write pattern
  (the inbox's `applyPaymentEvent` keeps the dual-write).
- PR 3 (`10055b9`) — feature-flag + dual-write cutover
  pattern (Phase 2's `ProcessedWebhook` → `PaymentWebhookEvent`
  cutover in § 8 uses the same per-record, no-break pattern).
