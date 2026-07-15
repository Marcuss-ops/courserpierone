# ADR 0014: Atomicity boundary for Order+AccessGrant (LS webhook write-path)

**Status:** Accepted · 2026-07-15
**Deciders:** Platform architecture review
**Parent:** [ADR-0011 — Course plugin decoupling](0011-course-plugin-decoupling.md)
**Supersedes:** — (documents an existing decision retroactively)
**Implements:** commit `b1992c4` — `fix(order): atomic Order+AccessGrant creation via $transaction`

> **Note on numbering:** the user-requested number for this ADR was `0013`, but that number is already taken by [ADR-0013 (Template-amish direct-import workaround)](0013-template-amish-direct-import.md). To avoid the doc-tree confusion of an out-of-order number, this ADR takes the next available slot: `0014`. Cross-references in body + commit use the same number.

---

## Context

The Lemon Squeezy webhook happy path (`order_created`, `subscription_created`) lands in `src/lib/commerce/orders/complete-order.ts:processOrder` (post-commerce-consolidation refactor, commit `8c354ea`; previously `src/lib/services/order-service.ts`). The function performs 9 numbered steps; step 4 is the canonical write:

1. Find or create user by email
2. Resolve product (id / slug / variant)
3. Idempotency check on `providerOrderId`
4. **Create `Order` + upsert `AccessGrant` — was non-atomic pre-`b1992c4`**
5. Ebook locale resolution (deferred)
6. Build email links
7. Send purchase confirmation email
8. Track analytics event
9. Recover abandoned checkout row

### Pre-`b1992c4` problem

The Order row and the AccessGrant row were written in two separate Prisma calls (step 4 split across two `await` points). If the second call (the `accessGrant.upsert`) failed for any reason — unique-violation on a stale `@@unique([sourceType, sourceId, productId])`, a transient DB timeout, a deadlock — the Order row was already committed. The `Order.status='completed'` row sat without its matching `AccessGrant.status='active'` row.

In production this would mean:
- The customer sees "purchase complete" in their email (the route returned 200).
- The `AccessGate` resolves to NO grant → the customer is locked out of the product they just paid for.
- Support has to manually reconcile the orphan order.
- Worse: the legacy `Order.findFirst(status='completed')` resolver path would still grant access (until the MCR Phase 3 flag flip), creating a window where the customer is granted access via Order status, the grant doesn't exist, and a future flip silently breaks them.

### Why a 4-call transaction isn't enough either

The naive "wrap the whole function in a `$transaction`" alternative would acquire user-row + product-row + order-row + grant-row locks for the full duration of steps 5–9 (email send is a network call; analytics write is another DB call; abandoned-checkout recovery is a third DB call). The transaction would hold those locks across network I/O, dramatically increasing the chance of contention with the other concurrent webhooks for the same user / product (see §Race condition below). The decision is therefore: **transact only the two write-side rows that MUST be consistent, and keep the side-effects outside**.

---

## Decision

### (a) Inside the `$transaction` (atomic pair)

```ts
// src/lib/commerce/orders/complete-order.ts:175-211
await prisma.$transaction(async (tx) => {
  const o = await tx.order.create({ data: { /* …status: "completed" */ } });
  await tx.accessGrant.upsert({
    where: { sourceType_sourceId_productId: {
      sourceType: "order", sourceId: o.id, productId: o.productId,
    } },
    create: { /* userId, productId, status: "active" */ },
    update: {}, // no-op: idempotent re-runs are safe
  });
  return o;
});
```

Only the `Order` create + the `AccessGrant` upsert are inside the transaction. The `AccessGrant.@@unique([sourceType, sourceId, productId])` is the authoritative dedupe — concurrent retries (from the explicit backfill `scripts/migrate-grants-from-orders.ts` or from an LS re-delivery) safely no-op via the `update: {}` clause.

### (b) Outside the transaction by design (5 points)

The 5 things deliberately NOT in the tx, each with rationale:

| # | Step | Outside because |
|---|------|-----------------|
| 1 | User find-or-create (`prisma.user.findUnique` then `prisma.user.create`) | A `User` row that exists for an order that later rolls back is **harmless** — `User.email` is `@unique`, so concurrent racing `user.create` calls for the same email collapse to a single row anyway (see §Race condition). Keeping this outside prevents holding user-row locks during the tx. |
| 2 | Product resolve (read-only `findUnique` / `findFirst` against `Product`) | Pure read; no point inside a write tx. Move the read OUTSIDE means the tx body is small and the product-row is not locked. |
| 3 | Idempotency check (`order.findFirst({ providerOrderId })`) | Outside so concurrent webhook retries from LS don't waste a tx slot on what's a duplicate. The Order `@@unique([paymentProvider, providerOrderId])` is the authoritative dedupe; step 3 is a fast-path early-return. |
| 4 | (the same atomic pair from (a)) | — |
| 5 | Email send / `AnalyticEvent.create` / `AbandonedCheckout.updateMany` | Fire-and-forget side-effects (network call + non-critical writes). Their failures must NOT roll back the order — the order is the canonical record. Each keeps its own per-step `try/catch` + `console.error` pattern. |

### (c) Race condition in step 1 (User find-or-create)

Two concurrent LS webhooks for the **same email** within the same `processOrder` window race on step 1:

```text
Webhook A: findUnique({ email }) → null
Webhook B: findUnique({ email }) → null
Webhook A: user.create({ email })  → 200 OK
Webhook B: user.create({ email })  → P2002 (User.email @@unique)
Webhook B: error propagates up
```

The P2002 from `Webhook B` is a `Prisma.PrismaClientKnownRequestError` with `code = "P2002"`. In the current error-classifier (`src/lib/commerce/webhooks/error-classifier.ts`), this is **NOT** matched by any of:

- `isAckError` (only `WebhookAckError`)
- `isSecurityOrParseError` (only `HmacVerificationError | InvalidJsonError`)
- `isTransientError` (substring match on `ECONNREFUSED`, `ETIMEDOUT`, etc. — does NOT match P2002)
- `isAcknowledgableError` (only `NotFoundError | ValidationError`)

…so the catch in the route resolves to the 500 fallback: `classifyWebhookError` returns `NextResponse.json({ error: "Processing failed" }, { status: 500 })`. LS sees the 5xx and **re-delivers** the webhook.

On the re-delivery, step 1's `findUnique({ email })` returns the row that Webhook A successfully created (it committed before Webhook B's `user.create` returned P2002). Webhook B's re-delivery proceeds through the rest of the steps — and if Webhook A's `order.create` already succeeded, Webhook B's step 3 idempotency check returns early without re-creating the order. **The system self-heals on the second delivery.**

This is documented here because the race is a real production scenario (LS may re-deliver concurrently for retries, multiple LS events for the same purchase can land close together, and webhook retries triggered by the 5xx on the same connection can interleave with a parallel delivery on another). The recovery mechanism is **idempotency at step 3** (Order `@@unique([paymentProvider, providerOrderId])`) plus **idempotency at the `AccessGrant` upsert** (`update: {}` no-op). Both layers must be in place for the system to be safe.

> **Future hardening (V2 cleanup target):** the `user.create` call in step 1 could be wrapped in `prisma.user.upsert` to eliminate the P2002 race entirely. The reason it isn't yet: the current shape preserves the explicit "guest checkout, no Supabase account at this point" code path documented by the inline comment. V2 can replace the `findUnique` + `create` with `upsert` once Supabase Auth linking is settled. Not blocking for V1.

---

## Consequences

### Positive

- **No orphan Order rows** — if the `accessGrant.upsert` fails for any reason (DB constraint, deadlock, transient timeout), the entire tx rolls back. The webhook route receives the propagated error and either returns 503 (LS retries → idempotency at step 3 dedupes) or 200-ack for permanent faults.
- **Short tx window** — only the two `INSERT`/`UPSERT` calls are in the tx. Network I/O (email) and non-critical writes (analytics, abandoned-checkout recovery) stay outside, so the tx holds row-level locks for a few milliseconds, not seconds.
- **Idempotency at the grant level** — the `AccessGrant.@@unique([sourceType, sourceId, productId])` + `update: {}` makes concurrent re-runs of `b1992c4`'s migration script + LS re-delivery safe.
- **V1.x V1 readiness** — `scripts/audit-v1-readiness.ts` checks `Order` + `AccessGrant` consistency; with `b1992c4` shipped, the V1 readiness gate no longer flags "orphan orders" as a hard error.

### Negative (accepted)

- **Step 1 race window** — concurrent webhooks for the same email in a tight window will trigger a 500 → LS retry. The retry is handled correctly, but it costs an extra round-trip on the unhappy path. V2 can eliminate this with `prisma.user.upsert`.
- **Lock scope is wider than strictly necessary** — even though the tx body is short, the `order.create` + `accessGrant.upsert` together touch 2 rows in 2 different tables. A future optimization could split the grant write into a separate tx, but the current shape (atomic pair) is the safer default.
- **The 5 OUTSIDE points are non-obvious** — without this ADR, a future contributor reading `complete-order.ts` might re-wrap the whole function in a `$transaction` "for safety" and reintroduce the lock-hold problem. The inline comment in the code links back to this ADR; the ADR is the source of truth.

---

## Cross-references

- **`scripts/diagnose-messaging-extended.ts`** — the migration-domain allowlist (line 165) lists `src/lib/commerce/orders/complete-order.ts` as the canonical write-side of the Order/AccessGrant chain. The Stripe allowlist relic (lines 168-172) records the C1a cleanup: the Stripe webhook entry that previously lived in this allowlist was **removed** as part of V1.x C1a (legacy Stripe provider module hard-deleted; see `docs/audit-log.md` for the commit lineage). Only the LemonSqueezy handler survives post-C1a. The allowlist is the regression-guard that would catch a re-introduction of the Stripe webhook path; ADR-0014 + C1a together document why the Stripe path is gone.
- **`prisma/migrations/20260712220000_drop_nextauth_models/migration.sql`** — the "RemoveStripe" migration. It drops the `Account`, `Session`, and `VerificationToken` tables that were the NextAuth-prisma-adapter footprint. Stripe Connect would have used these for `customer.subscription` reconciliation. The migration's existence is the **schema-side** companion to the C1a application-side cleanup. ADR-0014 documents the write-side atomicity, the RemoveStripe migration documents the schema-side removal of the legacy Stripe/NextAuth tables; together they form the "no Stripe, ever again" boundary.
- **[ADR-0011 — Course plugin decoupling](0011-course-plugin-decoupling.md)** — the `Order` ↔ `AccessGrant` chain is downstream of the per-course `Product` resolution in step 2. ADR-0011 set the course-folder layout; ADR-0014 sets the order-write atomicity boundary.
- **[ADR-0013 — Template-amish direct-import workaround](0013-template-amish-direct-import.md)** — the parallel "intentional boundary leak" ADR. The two together form the two boundary decisions that the V1.x architecture review accepted as documented deviations.

---

## Verification

- `npx tsc --noEmit` — 0 errors.
- `npx vitest run src/lib/commerce/orders/complete-order.test.ts` — passes (existing tests cover the happy path + idempotency + product-not-found).
- `npx tsx scripts/audit-v1-readiness.ts` — `orphanProducts=0`, `residualNextAuth=0` (V1 readiness gate).
- The `commit b1992c4` git message + diff: `git show b1992c4 --stat` shows the `prisma.$transaction` wrap landing in `src/lib/commerce/orders/complete-order.ts` (was `src/lib/services/order-service.ts` at commit time).
- Manual race-condition test (V1.x): two parallel `processOrder` calls with the same `email` in the same ms — one returns success, the other P2002 → webhook route 500 → LS re-delivery → both end up with a single `Order` + `AccessGrant`. (Not yet covered by an automated test; see Future work.)

---

## Future work (V2 cleanup targets)

1. **`prisma.user.upsert` in step 1** to eliminate the P2002 race entirely (see §Race condition).
2. **Automated race-condition test** in `complete-order.test.ts`: spawn 2 parallel `processOrder` calls with the same email + different `providerOrderId`s; assert exactly one `Order` + one `AccessGrant` exist after both resolve.
3. **Allow the C1a Stripe allowlist relic to be removed** from `scripts/diagnose-messaging-extended.ts` once V1.x GA is shipped (the allowlist is a regression-guard; post-GA it can be relaxed).

---

## Implementation log

- 2026-07-15: ADR accepted retroactively. `b1992c4` shipped the `prisma.$transaction` wrap in `src/lib/services/order-service.ts` (now `src/lib/commerce/orders/complete-order.ts` post `8c354ea` consolidation). The 5 OUTSIDE points were in the inline code comment at the time of `b1992c4`; this ADR is the standalone record.
- Followup: when V2 ships `prisma.user.upsert` in step 1, update the "Future work" §1 of this ADR.
- Followup: when the race-condition test is automated, link to the test from the "Verification" § of this ADR.
