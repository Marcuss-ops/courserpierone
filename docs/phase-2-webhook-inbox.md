# Phase 2 — Webhook Inbox + Transactional Outbox + PG LISTEN/NOTIFY

> **Status:** design — not yet implemented.
> **Owner:** TBD.
> **Source PRs:** supersedes the legacy `ProcessedWebhook` table + the
> in-line `processOrder` side-effects (analytics, email, abandoned
> recovery). Supersedes the current `webhooks/lemonsqueezy/route.ts`
> and `webhooks/stripe/route.ts` which do business logic synchronously
> before returning 200.
>
> **Migration strategy:** additive. Existing `ProcessedWebhook` rows
> are converted to `PaymentWebhookEvent` rows with `status='completed'`
> and `processedAt = ProcessedWebhook.processedAt`. The new
> `PaymentWebhookEvent` table is the source of truth going forward;
> `ProcessedWebhook` is dropped in Phase 7 cleanup.

---

## 1. Motivation

The current webhook flow at `src/app/api/webhooks/lemonsqueezy/route.ts`
(commit pre-Phase 2) has three problems:

1. **Synchronous business logic in the request path.** The handler
   calls `processOrder(...)` (which itself does user-create + order +
   email + analytics + abandoned-recovery) before returning 200. The
   request stays open for the entire duration. Transient downstream
   failures (SMTP, analytics) are tolerated by `.catch(...)` but the
   order is silently skipped and the webhook will not be re-delivered.
2. **String-matching transient detection.** The current "is
   transient?" check scans the error message for substrings
   (`"ECONNREFUSED"`, `"timeout"`, `"rate limit"`). Anything else
   gets a 200 ack and the event is lost.
3. **No outbox.** If the request returns 503 to ask the provider to
   retry, the user-create + order + email sequence is partially
   visible from the provider's view. The outbox pattern guarantees
   that "received" + "applied" are atomic from the provider's
   perspective.

Phase 2 fixes all three: webhook writes a row, returns 200
immediately, and an async worker applies the event. The transactional
outbox publishes downstream events (analytics, email, abandoned
recovery) in the same transaction as the side-effect they describe.

---

## 2. Schema

### 2.1 `PaymentWebhookEvent`

The inbox. The provider's webhook handler writes a row here, then
returns 200. A worker reads due rows, applies the canonical
`applyPaymentEvent` command, and updates the row's status.

```prisma
model PaymentWebhookEvent {
  id            String   @id @default(cuid())

  // Source identification
  provider      String   // "lemonsqueezy" | "stripe"
  deliveryId    String   // LS-{data.id}-{eventName} | evt_xxx
  eventType     String   // order_created | subscription_created |
                          //   subscription_cancelled | subscription_payment_failed |
                          //   order_refunded | checkout.session.completed
  payload       Json     // raw provider payload, retained for audit

  // Worker state machine
  status        String   @default("received")
                          // received | processing | retry_scheduled |
                          //   completed | dead_letter
  attempts      Int      @default(0)
  nextAttemptAt DateTime @default(now())

  // Distributed locking for horizontal worker scaling
  // (see § 4 for how the worker uses it)
  lockedAt      DateTime?
  lockedBy      String?  // worker-instance identifier (e.g. hostname)
  lockExpiresAt DateTime?  // hard ceiling; a stale lock is released by
                            //   the next worker that picks up the row

  // Diagnostics
  lastError     String?  @db.Text
  processedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([provider, deliveryId])
  @@index([status, nextAttemptAt])
  @@index([lockedAt, lockExpiresAt])  // for stale-lock recovery
}
```

**Why `deliveryId` per-provider:** the providers' own delivery
identifiers are different shapes (`evt_xxx` for Stripe, composite
`LS-{id}-{eventName}` for Lemon Squeezy). The provider's own dedupe
logic is the source of truth, not ours.

**Why `lockedBy` is a free-form string:** multi-instance Vercel
workers don't have a stable pod-name; we use the runtime's hostname
or a random UUID per process.

### 2.2 `OutboxEvent`

The transactional outbox. Side-effects that should happen "exactly
once when the originating transaction commits" are written as an
`OutboxEvent` row in the same `$transaction` as the business write.
A separate dispatcher (`/api/internal/jobs/outbox-dispatch`,
Vercel Cron) reads unpublished events, calls `pg_notify('outbox',
{...})` for each, and marks them published.

```prisma
model OutboxEvent {
  id            String   @id @default(cuid())

  // Event identity
  eventType     String   // "order.completed" | "order.refunded" |
                          //   "access.granted" | "access.revoked" |
                          //   "lesson.completed" | "checkout.abandoned" |
                          //   "private_offer.purchased"
  aggregateType String   // "Order" | "AccessGrant" | "LessonProgress" |
                          //   "CheckoutIntent" | "PrivateOffer"
  aggregateId   String   // the related entity's id (Order.id, etc.)

  // Payload + metadata
  payload       Json     // event-specific data (e.g. { orderId, userId,
                          //   productId, amount, currency, ... })
  occurredAt    DateTime @default(now())

  // Dispatch state
  publishedAt   DateTime?  // null = not yet dispatched
  attempts      Int      @default(0)
  lastError     String?  @db.Text
  lockedAt      DateTime?
  lockedBy      String?
  lockExpiresAt DateTime?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([publishedAt, occurredAt])  // FIFO for unpublished events
  @@index([eventType, occurredAt])     // per-type rate limiting
  @@index([lockedAt, lockExpiresAt])   // stale-lock recovery
}
```

**Why both `OutboxEvent` and `PaymentWebhookEvent` exist:** they serve
different jobs. `PaymentWebhookEvent` is the **inbox** (provider → us,
incoming). `OutboxEvent` is the **outbox** (us → consumers, outgoing).
A payment event lands in the inbox, gets applied, and emits N
outbox events as side-effects (analytics, email, abandoned recovery,
etc.). The outbox does NOT replace the inbox; it supplements it.

### 2.3 Migration path from `ProcessedWebhook`

For each row in the existing `ProcessedWebhook` table:

```sql
INSERT INTO "PaymentWebhookEvent" (
  "provider", "deliveryId", "eventType", "payload", "status",
  "attempts", "nextAttemptAt", "processedAt", "createdAt", "updatedAt"
)
SELECT
  "provider",
  "deliveryId",
  "eventType",
  '{}'::jsonb,                  -- raw payload was discarded by the
                                  --   legacy table; inboxes that need
                                  --   the body can re-fetch from LS/Stripe
                                  --   on demand
  'completed',
  1,
  "processedAt",
  "processedAt",
  "createdAt",
  "createdAt"
FROM "ProcessedWebhook";
```

`ProcessedWebhook` is dropped in Phase 7 cleanup. Until then, the
new webhook route does NOT write to it — new deliveries are
captured only by `PaymentWebhookEvent`.

---

## 3. Canonical command: `applyPaymentEvent`

A single function that turns a normalized `PaymentEvent` into all
the domain side-effects. Every consumer — the inbox worker, the
reconciliation endpoint, the outbox dispatcher — calls this. No
business logic in the route handlers themselves.

```typescript
// src/lib/commerce/payments/apply-payment-event.ts
//
// Canonical command: turn a normalized PaymentEvent into all
// side-effects (processOrder + AccessGrant dual-write +
// outbox fan-out). Returns the applied event id (Order.id).
//
// Idempotency: idempotent by `correlationKey` (provider's own
// reference, e.g. LS order id). The Order table's
// @@unique([paymentProvider, providerOrderId]) + the
// AccessGrant @@unique([sourceType, sourceId, productId])
// together make the side-effects safe to retry.
//
// This function is the single point of business logic for
// payment events. NO route handler may call processOrder
// directly — they all normalize their inputs and call this.
export async function applyPaymentEvent(
  event: PaymentEvent,
): Promise<{ orderId: string }> {
  // ... (see § 6 for the body; this is a design doc, the
  //      function body is implemented in a follow-up PR)
}
```

The function body (high-level) is the existing `processOrder` logic
plus the OutboxEvent publish:

1. Find-or-create user (PR 2: `User.preferredLocale` backfill from locale)
2. Resolve product (existing 4-step fallback chain)
3. Idempotency check on `Order.@@unique([paymentProvider, providerOrderId])`
4. **In a `$transaction`:**
   - Create `Order` (existing)
   - Upsert `AccessGrant` (PR 2 dual-write)
   - Create `OutboxEvent(eventType="order.completed", payload={...})`
5. **Outside the transaction (in the same handler):**
   - Send purchase-confirmation email (existing `.catch`-tolerant)
   - Track analytics event (existing — but this becomes a consumer
     of `OutboxEvent("order.completed")` in V2)

The transactional boundary guarantees that an Order + its AccessGrant
+ its outbox event are atomically visible. If the email send fails
or the worker crashes, the outbox dispatcher re-fires the event and
the consumers are idempotent.

---

## 4. `/api/internal/jobs/payment-webhooks` worker

```text
POST /api/internal/jobs/payment-webhooks
Authorization: Bearer ${CRON_SECRET}
```

Vercel Cron, every minute. The handler:

1. **Acquire batch** — `SELECT * FROM "PaymentWebhookEvent" WHERE
   status IN ('received', 'retry_scheduled') AND nextAttemptAt <= now()
   AND (lockedAt IS NULL OR lockExpiresAt < now()) ORDER BY nextAttemptAt
   ASC LIMIT 50 FOR UPDATE SKIP LOCKED`.

2. **For each row in the batch:**
   - Set `status='processing'`, `lockedAt=now()`, `lockedBy=<hostname>`,
     `lockExpiresAt=now() + 5min`, `attempts += 1`. Commit.
   - Try to verify HMAC + parse via `paymentProvider.parseWebhook(...)`
     (PR 1 stub — Phase 2 fills in the real impl).
   - Try to call `applyPaymentEvent(event)`.
   - On success: `status='completed'`, `processedAt=now()`,
     `lockedAt=NULL`, `lockExpiresAt=NULL`. Commit.
   - On permanent failure (4xx-class: `NotFoundError`,
     `ValidationError`, HMAC signature mismatch): `status='dead_letter'`,
     `lastError=<msg>`, `lockedAt=NULL`. Commit. Alert via
     `ALERT_WEBHOOK_URL` if set.
   - On transient failure (5xx-class, network, PG timeout): keep
     `status='retry_scheduled'`, `lastError=<msg>`,
     `nextAttemptAt = now() + backoff(attempts)`,
     `lockedAt=NULL`. Commit. The next worker run picks it up.

3. **Backoff ladder** (in `src/lib/utils/webhook-backoff.ts`):

   ```
   attempts=1   →  1 minute
   attempts=2   →  5 minutes
   attempts=3   →  30 minutes
   attempts=4   →  2 hours
   attempts=5   →  12 hours
   attempts=6   →  24 hours
   attempts=7+  →  status='dead_letter' (operator intervention)
   ```

4. **Stale-lock recovery:** the next worker that runs after
   `lockExpiresAt` is reached treats the row as un-locked. (A row
   with `status='processing'` and `lockExpiresAt < now()` is
   recoverable.)

5. **Authorization:** `CRON_SECRET` env, checked via
   `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron sends this
   automatically when configured with the `CRON_SECRET` env var.

6. **Idempotency:** the inbox itself is the idempotency mechanism.
   Re-deliveries from the provider hit the
   `@@unique([provider, deliveryId])` constraint and return 200
   without re-applying.

7. **Rate limiting on the worker:** the worker batches at most 50
   rows per run. If the backlog is larger, the next minute's run
   picks up the next batch. This caps the per-minute DB load at
   ~50 calls to `applyPaymentEvent`.

8. **Observability:** the worker emits structured logs at every
   state transition (received → processing → completed | dead_letter
   | retry_scheduled). The `ALERT_WEBHOOK_URL` is called when
   `status='dead_letter'`.

### 4.1 Idempotency proof

Same `deliveryId` re-delivered:

- Webhook route: `INSERT ... ON CONFLICT (provider, deliveryId) DO
  NOTHING` — 1 row, return 200.
- Worker (in the unlikely event the inbox insert fails but the
  request returned 200): finds the existing row, processes
  it, `applyPaymentEvent` is idempotent on `correlationKey`. No
  duplicate Order, no duplicate AccessGrant.

---

## 5. `/api/admin/payments/reconciliations`

Manual recovery endpoint for "the provider says the order is paid
but we don't have the row" cases (e.g. a webhook was lost in
transit, the worker crashed, the customer complained).

```text
POST /api/admin/payments/reconciliations
Authorization: Bearer ${session}    # admin role required
Content-Type: application/json

{
  "provider": "lemonsqueezy",
  "providerReference": "123456",
  "idempotencyKey": "reconcile-order-123456-v1",
  "mode": "verify_provider",
  "reason": "Customer reports payment succeeded but no access granted"
}
```

The handler:

1. **Auth check** — `getServerUser()` must return `dbUser.role='admin'`.
2. **Idempotency** — `idempotencyKey` is logged in the
   `ReconciliationAttempt` table (see below). A duplicate key with
   the same body returns 200 with the prior result. A duplicate key
   with a different body returns 409 Conflict.
3. **Provider call** — `paymentProvider.retrievePayment(providerReference)`
   returns `{ status, email, amountCents, currency, variantIdOrPriceId, raw }`.
4. **Apply** — if `mode='verify_provider'` AND the provider's status
   is `completed` AND we don't have a corresponding Order: build a
   `PaymentEvent` and call `applyPaymentEvent(...)`. If we DO have
   the Order: return 200 with the existing order's id (idempotent).
5. **`manual_override` mode** — skips provider verification. Requires
   an audit log entry with the operator's id and a free-text
   `reason` (≥30 chars). Use only for "I checked the Stripe dashboard
   manually, here's the receipt" cases. The override is recorded in
   `ReconciliationAttempt` with `mode='manual_override'` and is
   subject to monthly review.
6. **Audit log** — `ReconciliationAttempt` row:
   ```prisma
   model ReconciliationAttempt {
     id              String   @id @default(cuid())
     operatorId      String
     provider        String
     providerReference String
     mode            String   // "verify_provider" | "manual_override"
     reason          String   @db.Text
     idempotencyKey  String   @unique
     resultOrderId   String?
     resultStatus    String   // "applied" | "already_applied" | "skipped" | "failed"
     createdAt       DateTime @default(now())
     operator        User    @relation(fields: [operatorId], references: [id], onDelete: Restrict)
   }
   ```
7. **No second implementation** — the handler does NOT call
   `processOrder` directly. It builds a `PaymentEvent` and calls
   `applyPaymentEvent(...)` — the same canonical command used by
   the inbox worker.

---

## 6. PG LISTEN/NOTIFY dispatcher

Real-time fan-out for outbox events. Without this, Vercel Cron
running the dispatcher every minute means up to 60s of latency on
email/analytics/notifications. With it: sub-second.

### 6.1 Server-side listener

`server.ts` (the existing WebSocket bridge) gets a new
`startOutboxListener()` function called at boot:

```typescript
// src/lib/commerce/outbox/listener.ts
import { prisma } from "@/lib/db/prisma";
import { getClient } from "@/lib/db/pg-listener";  // dedicated pg
                                                       // client for
                                                       // LISTEN, separate
                                                       // from the Prisma
                                                       // pool

export async function startOutboxListener() {
  const client = getClient();
  await client.connect();
  await client.query("LISTEN payment_outbox");
  client.on("notification", async (msg) => {
    if (msg.channel !== "payment_outbox") return;
    // msg.payload is the OutboxEvent id
    const event = await prisma.outboxEvent.findUnique({ where: { id: msg.payload }});
    if (!event || event.publishedAt) return;
    await dispatchEvent(event);  // call consumer(s)
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { publishedAt: new Date() },
    });
  });
}
```

The `LISTEN` connection is a dedicated PG client (NOT the Prisma
pool — `LISTEN` holds a connection open for the life of the
process). When the listener receives a notification, it loads the
event from Prisma and dispatches.

### 6.2 Notification trigger

The `applyPaymentEvent` function (and any other business write that
emits an outbox event) runs in a `$transaction` with a final
`pg_notify('payment_outbox', <eventId>)`:

```sql
-- migration: src/lib/commerce/outbox/listener.sql (or part of the
-- OutboxEvent migration)
CREATE OR REPLACE FUNCTION notify_payment_outbox()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('payment_outbox', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_outbox_notify
AFTER INSERT ON "OutboxEvent"
FOR EACH ROW EXECUTE FUNCTION notify_payment_outbox();
```

The `notify_payment_outbox` trigger is `AFTER INSERT` so the
notification is fired only when the row is committed (the trigger
runs at the end of the transaction, not per-statement).

### 6.3 Cron fallback

The LISTEN/NOTIFY dispatcher is real-time. But LISTEN messages are
lost on listener restart (PG doesn't queue them). A second safety
net is the cron worker at `/api/internal/jobs/outbox-dispatch`
(every minute) that scans for `publishedAt IS NULL` rows older
than 30s (i.e., the listener missed them or the process restarted)
and calls `pg_notify` again. This is the "belt-and-suspenders" of
the outbox.

### 6.4 Consumer pattern

`dispatchEvent(event)` looks up the registered handlers for
`event.eventType` and calls them in parallel. Handlers are pure
functions registered at boot:

```typescript
// src/lib/commerce/outbox/consumers.ts
import { sendPurchaseConfirmation } from "@/lib/services/email";
import { trackPurchase } from "@/lib/services/analytics";
import { markAbandonedRecovered } from "@/lib/services/abandoned";

registerConsumer("order.completed", async (event) => {
  // Fan-out to 3 handlers
  await Promise.allSettled([
    sendPurchaseConfirmation(...),
    trackPurchase(...),
    markAbandonedRecovered(...),
  ]);
});
```

The `registerConsumer` API is internal; consumers are wired in
`src/lib/commerce/outbox/index.ts` (one file, one import surface).

### 6.5 Idempotency

Each consumer is responsible for being idempotent on
`event.aggregateId`. Email: dedupe on `Order.id`. Analytics:
dedupe on `AnalyticEvent` unique keys. Abandoned recovery: same.
The outbox dispatcher marks `publishedAt` AFTER the consumers
return; if a consumer crashes mid-flight, the next dispatcher
run will re-fire the event. Consumers must tolerate this.

---

## 7. Implementation steps

In order of dependency:

1. **Schema migration** — `prisma/migrations/20260713XXXXXX_phase2_webhook_inbox/migration.sql`
   - `PaymentWebhookEvent` (with idempotent CREATE TABLE IF NOT EXISTS +
     DO $$ FK guards, mirroring the PR 2 pattern)
   - `OutboxEvent` (same pattern)
   - `ReconciliationAttempt` (same pattern)
   - `notify_payment_outbox()` function + trigger
2. **Data migration** — `scripts/migrate-processed-webhook-to-inbox.ts`
   - Walks `ProcessedWebhook` rows, inserts into `PaymentWebhookEvent`
     with `status='completed'`. Idempotent via
     `@@unique([provider, deliveryId])`.
3. **Canonical command** — `src/lib/commerce/payments/apply-payment-event.ts`
   - Implements § 3. Reuses `processOrder` internals (refactored to
     expose a `processOrderCore(input)` that doesn't fire the email
     / analytics / abandoned side-effects — those move to the
     outbox consumers).
4. **Worker endpoint** — `src/app/api/internal/jobs/payment-webhooks/route.ts`
   - Implements § 4. Reuses `withRateLimit(handler, "WEBHOOK")` to
     bypass per-IP rate limiting (worker is internal).
5. **Provider webhook normalization** — fill in the
   `parseWebhook` + `retrievePayment` stubs from PR 1
   (`src/lib/commerce/payments/providers/lemonsqueezy/index.ts`
   and `legacy/stripe/index.ts`).
6. **Reconciliation endpoint** — `src/app/api/admin/payments/reconciliations/route.ts`
   - Implements § 5.
7. **Outbox dispatcher** — `src/lib/commerce/outbox/dispatcher.ts` +
   `src/lib/commerce/outbox/consumers.ts` + register-call at
   `src/lib/commerce/outbox/index.ts`.
8. **Server listener** — `src/lib/commerce/outbox/listener.ts` +
   `startOutboxListener()` called from `server.ts` boot.
9. **Webhook route migration** — `src/app/api/webhooks/lemonsqueezy/route.ts`
   + `stripe/route.ts` become thin shims: verify HMAC, normalize
   into `PaymentEvent`, INSERT into `PaymentWebhookEvent` (with
   ON CONFLICT DO NOTHING), return 200. No more inline `processOrder`.
10. **Cron worker** — `src/app/api/internal/jobs/outbox-dispatch/route.ts`
    — every-minute scan for `publishedAt IS NULL AND occurredAt <
    now() - 30s` and re-`pg_notify`. Safety net.
11. **Tests** — unit tests for `applyPaymentEvent` (all 23 cases
    from `order-service.test.ts` should pass against the new
    command), integration tests for the worker (inbox → worker →
    applied → outbox event), and the reconciliation endpoint
    (admin-only, idempotency, audit log row).
12. **Vercel Cron** config in `vercel.json`:
    ```json
    {
      "crons": [
        { "path": "/api/internal/jobs/payment-webhooks", "schedule": "* * * * *" },
        { "path": "/api/internal/jobs/outbox-dispatch", "schedule": "* * * * *" }
      ]
    }
    ```
13. **Operational runbook** — `docs/runbooks/phase-2-webhook-inbox.md`
    (separate doc). Covers dead-letter triage, stale-lock recovery,
    and the 24h dual-flag staging rollout pattern (mirroring the PR
    3 cutover).

---

## 8. What gets simpler in V2

Phase 2 unlocks several follow-on simplifications:

- `processOrder` loses the inline email/analytics/abandoned-recovery
  calls (those become outbox consumers). The function shrinks
  from ~150 LOC to ~50.
- The webhook route shrinks from ~80 LOC (signature verify +
  processOrder + ack) to ~20 LOC (signature verify + inbox insert
  + ack).
- Dead-letter recovery is a `SELECT * WHERE status='dead_letter'`
  dashboard, not a custom retry endpoint.
- A future "I never received the LS order" customer complaint is
  one `reconciliations` call away, not a manual SQL fix.

---

## 9. Out of scope for Phase 2

- Replaying old `ProcessedWebhook` payloads (the body was discarded
  by the legacy table — see § 2.3). If a partial event needs
  re-application, the operator uses `/api/admin/payments/reconciliations`
  with `mode='manual_override'`.
- Schema for `OutboxEvent.aggregateType` is a free-form string; V2
  may constrain it to an enum.
- Cross-region replication. PG LISTEN is per-database. V2 might
  use logical replication slots for a multi-region fan-out.
- Idempotency-key TTL. The `idempotencyKey` on
  `ReconciliationAttempt` is unique forever; V2 may add a TTL +
  cleanup cron.

---

## 10. References

- `docs/audit-log.md` — staging baseline (Phase 2 ships after
  this is recorded with non-zero `grants_from_order`).
- `prisma/migrations/20260712230000_add_access_grants/migration.sql`
  — PR 2's idempotent migration pattern (mirrored here).
- `scripts/migrate-grants-from-orders.ts` — PR 2's backfill script
  pattern (mirrored in § 7 step 2).
- `src/lib/commerce/payments/registry.ts` (PR 1) — the
  `PaymentProvider` interface that `parseWebhook` and
  `retrievePayment` finally implement.
- `src/lib/messaging/resolve-message-permission.ts` (PR 3) —
  precedent for feature-flag + dual-write cutovers.
- `vercel.json` — current cron config; the new endpoints are added
  in § 7 step 12.
