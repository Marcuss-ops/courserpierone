# ADR 0014: Atomicity boundary for Order, AccessGrant and transactional outbox

**Status:** Accepted · updated 2026-08-06
**Deciders:** Platform architecture review
**Supersedes:** The 2026-07-15 wording in this file
**Scope:** Lemon Squeezy payment → order → access → durable effects

## Context

The Lemon Squeezy webhook path enters
`src/app/api/webhooks/lemonsqueezy/route.ts`, translates the verified provider
payload into `CompletePaidOrderCommand`, and dispatches it through
`src/lib/commerce/webhooks/processor.ts` to
`src/lib/commerce/orders/complete-order.ts`.

A payment fulfillment is not one database row. It must establish, in order:

1. a canonical customer identified by unique email;
2. a product resolved by exactly one discriminated locator;
3. a completed `Order` identified by `(paymentProvider, providerOrderId)`;
4. an active `AccessGrant` tied to that order;
5. durable post-purchase work for email, analytics, notification and abandoned-checkout recovery.

The provider can redeliver events and multiple workers can race. The database,
not a preflight read, is therefore the idempotency authority.

## Decision

### 1. Validate the command before writing

Provider adapters and `processOrder` call
`createCompletePaidOrderCommand`. Runtime validation requires:

- non-empty `providerOrderId`;
- exactly one `ProductLocator` branch: `product_id`, `product_slug` or `variant_id`;
- valid customer email, amount, currency and locale;
- a registered payment provider.

The command is the only supported input to the paid-order use case. Provider
payloads are not passed directly to Prisma.

### 2. Resolve or create the user idempotently

The user is resolved with:

```ts
prisma.user.upsert({
  where: { email },
  create: { email, name, preferredLocale },
  update: {},
});
```

A narrowly-scoped `P2002` on the `User.email` constraint is recovered by
rereading the winner. Other unique violations propagate. This removes the old
`findUnique → create` race instead of relying on a webhook retry to heal it.

Product resolution is read-only and happens before the write transaction.

### 3. Keep the canonical write set in one transaction

`processOrder` performs the following in one Prisma `$transaction`:

```text
Order.create(status=completed)
        +
AccessGrant.upsert(sourceType=order, sourceId=Order.id, productId=Order.productId)
        +
OutboxEvent.createMany(4 deterministic event keys)
```

If any of these writes fails, the transaction rolls back as a unit. No order can
be committed without its access grant and durable post-purchase work.

The authoritative order dedupe is the database unique constraint:

```prisma
@@unique([paymentProvider, providerOrderId])
```

`order.findFirst` remains only a fast-path for ordinary retries. Two concurrent
requests may both pass that read; the losing transaction receives a narrowly
recognized `P2002` for the provider-order constraint and acknowledges the
webhook without creating duplicate grant or outbox rows.

The `AccessGrant` unique key is also authoritative:

```prisma
@@unique([sourceType, sourceId, productId])
```

### 4. Keep external delivery outside the database transaction

The transaction stores durable `OutboxEvent` rows. It does **not** call SMTP,
analytics APIs or notification delivery while holding order/grant locks.
`OutboxEvent.eventKey` is unique and its rows are claimed by a lease-based
processor.

The `OUTBOX_HANDLER_REGISTRY` is the single dispatch registry. Every handler
owns a strict Zod runtime schema, so JSON loaded from Prisma is parsed before an
effect runs:

```text
purchase_email
purchase_analytics
purchase_notification
purchase_abandoned_recovery
```

Retry classification belongs to outbox infrastructure. Invalid payloads are
permanent/dead-letter failures; recognized transient infrastructure failures
are retried with exponential backoff; unknown failures use the conservative
terminal policy.

### 5. Email delivery uses a per-event/per-channel attempt record

Email delivery is guarded by `OutboxDeliveryAttempt`:

```prisma
@@unique([outboxEventId, channel])
```

The email handler claims `channel="email"` before calling SMTP and transitions:

```text
processing → sent
processing → failed       (provider rejected/failed before acceptance)
processing → uncertain    (lease expired or DB acknowledgement failed after acceptance)
```

`sent` and `uncertain` attempts are never automatically sent again. This makes
replays and concurrent workers idempotent at the application boundary.

SMTP is not part of the PostgreSQL transaction, so exactly-once delivery cannot
be mathematically guaranteed by this application alone. A crash after SMTP
acceptance and before persisting `sent` leaves an observable `processing` or
`uncertain` record; the safe default is to avoid a blind resend and reconcile
that record operationally or through a provider with idempotency-key support.

## Webhook reservation and acknowledgement

`ProcessedWebhook` reserves a provider delivery before business processing via
an atomic unique `deliveryId`. Duplicate completed, failed, processing or
unsupported deliveries are acknowledged without running the business action
again. Retryable or expired processing leases can be reclaimed by the webhook
reservation state machine.

The webhook route is responsible for translating domain failures into HTTP
responses and persisting the terminal webhook state. The order use case does
not know about `NextResponse`.

## Consequences

### Positive

- Order, active grant and durable effects cannot diverge at commit time.
- Concurrent duplicate provider deliveries converge on one order.
- User creation is safe under concurrent webhook traffic.
- Outbox payloads are runtime-validated and dispatched through one registry.
- Email, analytics and notification effects have durable idempotency keys.
- Database locks are not held across SMTP or other network I/O.

### Accepted limitations

- SMTP cannot participate in the database transaction. `uncertain` email
  attempts require reconciliation rather than automatic blind retry.
- A real PostgreSQL integration test is required to verify the composite unique
  constraint and concurrent worker behavior against the deployed database.
- `subscription_updated` is accepted as an audit-only unsupported event because
  the current schema has no subscription aggregate.

## Effective implementation references

- Command and atomic write: `src/lib/commerce/orders/complete-order.ts`
- Command contract: `src/lib/commerce/payments/types.ts`
- Provider translation: `src/lib/commerce/payments/providers/lemonsqueezy/index.ts`
- Webhook reservation: `src/lib/commerce/webhooks/idempotency.ts`
- Webhook dispatch: `src/lib/commerce/webhooks/processor.ts`
- Outbox registry: `src/lib/commerce/outbox/registry.ts`
- Outbox processor: `src/lib/commerce/outbox/processor.ts`
- Outbox retry policy: `src/lib/commerce/outbox/retry-policy.ts`
- Schema: `prisma/schema.prisma`
- Delivery-attempt migration: `prisma/migrations/20260806120000_add_outbox_delivery_attempts/migration.sql`

## Verification

The current implementation is covered by:

- `src/lib/commerce/orders/complete-order.test.ts` — command validation,
  user/order concurrency and order/grant/outbox atomicity;
- `src/lib/commerce/outbox/registry.test.ts` — all handlers, payload validation,
  email idempotency, stale leases and crash-after-send behavior;
- `src/lib/commerce/outbox/processor.test.ts` — claiming, retries and
  dead-letter transitions;
- `src/lib/commerce/outbox/retry-policy.test.ts` — infrastructure retry policy;
- `src/lib/commerce/webhooks/__tests__/idempotency.test.ts` — webhook reservation
  races and lifecycle;
- `src/lib/commerce/webhooks/__tests__/idempotency.real-db.integration.test.ts` —
  PostgreSQL reservation concurrency when a test database is available.

Required local gates are `npm run typecheck`, `npm run lint`, `npm run test`,
Prisma schema validation and migration safety checks.
