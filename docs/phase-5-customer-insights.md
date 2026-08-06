# Phase 5 — CustomerProductInsight read model

> **Status:** design — not yet implemented.
> **Owner:** TBD.
> **Goal:** the creator inbox (`/dashboard/creator/messages`) shows
> per-customer provenance (YouTube channel), completion %, last lesson
> watched, and LTV — without an N+1 on the inbox page.
>
> **Source-of-truth refactor:** the inbox page at
> `src/app/dashboard/creator/messages/page.tsx` currently does
> `prisma.conversation.findMany` + `prisma.message.groupBy` per render.
> Phase 5 adds a single batched `getCreatorConversationPreviews(creatorId)`
> service that joins `Conversation` + `AccessGrant` + `CustomerProductInsight`
> + `LessonProgress` + `AnalyticEvent` aggregates in **5 round-trips** (one
> per source), and stores the per-(user, product) aggregates in a
> denormalized `CustomerProductInsight` read model.
>
> **Migration strategy:** per-record, no break. The read model is
> built lazily on first miss in `getCreatorConversationPreviews` and
> by a one-shot backfill script. The inbox page flips from
> "live aggregate" to "read model" via a feature flag
> `USE_CUSTOMER_INSIGHTS_MODEL` (default `true` for creator/admin
> inboxes, `false` elsewhere during rollout).

---

## 1. Motivation

The current creator inbox has 3 limitations:

1. **No provenance.** A creator sees "Mario ha scritto 2 ore fa" but
   not "Mario ha acquistato dal canale YouTube IT Tech Reviews
   l'11 marzo." Marketing attribution is invisible to the creator
   side. The `AnalyticEvent.channelId` field exists for every
   `purchase` event but is never joined to the inbox query.
2. **No completion / engagement signal.** A creator cannot see
   "Mario ha completato il 35% del corso" — only that he wrote
   a message. Lesson progress is in `LessonProgress` (per-user
   per-lesson) but is never aggregated per-(user, product) for
   the inbox.
3. **No LTV.** A creator cannot see "Mario ha speso 199€ in totale."
   `Order.amount` exists but summing per customer requires a
   `prisma.order.groupBy` that is N×M for N customers × M products.
   For an inbox with 500 conversations, that's 250k row reads per
   inbox load. The `AnalyticEvent.revenueCents` signed field is
   already there for analytics, but again, never joined.

Phase 5 fixes all three with a single denormalized read model
(`CustomerProductInsight`) populated by event-driven updates from
the existing `order-service` and `progress/route` write paths, plus
a `getCreatorConversationPreviews(creatorId)` query service that
returns the union of `Conversation` (the inbox) and `CustomerProductInsight`
(the metadata) in 5 batched queries.

---

## 2. Schema

### 2.1 `CustomerProductInsight` + `RefundInsightLedger`

A denormalized per-(user, product) record. One row per
`@@unique([userId, productId])`. The fields are derived from
aggregates across `AccessGrant` (current access state),
`LessonProgress` (engagement), `Order` (LTV), and
`AnalyticEvent` (channel attribution).

```prisma
// Refund idempotency for the LTV decrement in § 4.4. One row per
// refunded order; the `@@unique([orderId])` constraint makes the
// decrement atomic — a second consumer invocation for the same
// orderId hits a P2002 violation and is skipped. Same pattern as
// the existing `ProcessedWebhook` table in Phase 2.
model RefundInsightLedger {
  id                 String   @id @default(cuid())
  orderId            String   @unique  // one ledger row per refund
  userId             String
  productId          String
  refundAmountCents  Int
  appliedAt          DateTime @default(now())

  @@index([userId, productId])
}
```

```prisma
model CustomerProductInsight {
  id                 String   @id @default(cuid())

  // Composite key — one insight per (customer, product).
  userId             String
  productId          String

  // ── Provenance ──
  // The YouTube channel that drove the first purchase for this
  // (user, product). Captured at first purchase: the
  // `AnalyticEvent.channelId` for the matching `eventType='purchase'`
  // row (joined via `userId` + `productId` + `eventType='purchase'`
  // + `revenueCents > 0`). If multiple purchases, we keep the
  // first one (oldest). If no purchase event has a channelId, this
  // is null and the inbox shows "Directo" (no provenance).
  sourceChannelId    String?

  // ── Engagement ──
  // 0–100, rounded to 1 decimal. Computed as
  //   count(LessonProgress WHERE completed=true) / count(Lesson) * 100.
  // null if the product has no lessons (edge case for ebook-only
  // products) or if the user has no LessonProgress rows yet.
  completionPercent  Float?

  // The last lesson the user touched (started OR completed).
  // Updated on every `lesson.started` / `lesson.completed` event.
  // null if the user has never started a lesson.
  lastLessonId       String?

  // max(lastWatchedAt, completedAt, purchaseAt). The "last time
  // the customer did anything content-side" — drives the inbox
  // "active X days ago" sort.
  lastContentAt      DateTime?

  // ── LTV ──
  // Sum of Order.amount (cents) where status='completed' minus
  // sum of Order.amount where status='refunded' for this (user, product).
  // Signed aggregate, so refunds decrement cleanly.
  // For multi-product users, this is per-product LTV (one row per
  // product), NOT global LTV — the inbox shows the LTV for the
  // product the conversation is about.
  lifetimeValueCents Int      @default(0)

  // ── Audit ──
  // The Order.id that most recently changed the LTV (purchase
  // OR refund). Stored for ops: "show me the order that set
  // this insight to its current value." null if no orders yet.
  lastOrderId        String?

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  user      User           @relation("UserInsights", fields: [userId], references: [id], onDelete: Cascade)
  product   Product        @relation("ProductInsights", fields: [productId], references: [id], onDelete: Cascade)
  channel   YouTubeChannel? @relation(fields: [sourceChannelId], references: [id], onDelete: SetNull)
  lesson    Lesson?        @relation(fields: [lastLessonId], references: [id], onDelete: SetNull)

  @@unique([userId, productId])
  @@index([productId, lastContentAt])  // per-product cohort sort
  @@index([userId, completionPercent])  // admin analytics: "users stuck on lesson X"
}
```

**Why denormalize `sourceChannelId` here when `YouTubeChannel` is
already a separate table:** a 5-way join (`Conversation →
UserOne → AnalyticEvent → YouTubeChannel`) per inbox row is
prohibitive at 500 rows. The read model is the cache for that
join result. The `channel` relation is a "soft" back-pointer for
ops/UI; the read model's `sourceChannelId` is the canonical
field used by `getCreatorConversationPreviews`.

**Why `lastLessonId` is nullable:** a creator who only sells
ebooks (no video lessons) has no `Lesson` rows; the insight
shows `completionPercent=null` and `lastLessonId=null`. The
inbox renders a quiet "—" instead of 0% (which would mislead
the creator into thinking the customer isn't engaged).

**Why `lifetimeValueCents` is per-(user, product) not global:**
the inbox is conversation-scoped (one row per conversation, which
includes a `productId`). A "Mario ha speso 199€ in totale" UI
would be a separate `CustomerInsight` global aggregate (Phase 5.1
addendum, V2). For now, per-product LTV is what the inbox needs
to answer "quanto vale questo cliente su questo corso."

**Why `onDelete: Cascade` on User + Product:** the insight is a
derived read model. If the source `User` or `Product` is deleted,
the insight is meaningless — cascade delete keeps the table from
accumulating orphans. The `AccessGrant` table (PR 2) deliberately
uses `Restrict` because access is a security-relevant record;
the insight is a denormalized cache and can be safely cascaded.

**Why `onDelete: SetNull` on `channel` and `lesson`:** the
`YouTubeChannel` and `Lesson` rows may be soft-archived without
deleting the insight (a creator may un-publish a lesson but
keep the customer record). `SetNull` is the right semantics.

### 2.2 Migration path

The read model is **built lazily** on first read miss. No
backfill is required for the inbox to work — `getCreatorConversationPreviews`
falls back to a live aggregate query (the existing inbox page logic)
when a `(userId, productId)` pair has no `CustomerProductInsight`
row yet. The backfill script is an optimization for the cold
start; the inbox is fully functional without it.

```prisma
// prisma/schema.prisma additions
model CustomerProductInsight { /* ... see § 2.1 ... */ }

// On User: add back-relation
insights CustomerProductInsight[] @relation("UserInsights")
// On Product: add back-relation
insights CustomerProductInsight[] @relation("ProductInsights")
// On YouTubeChannel: add back-relation
customerInsights CustomerProductInsight[]
// On Lesson: add back-relation
customerInsights CustomerProductInsight[]
// On Order: add back-relation
refundLedgerEntries RefundInsightLedger[]
```

The migration is idempotent and creates BOTH `CustomerProductInsight`
and `RefundInsightLedger` in a single transaction:

The migration is idempotent CREATE TABLE IF NOT EXISTS + DO $$
FK guards, matching the PR 2 and Phase 2 patterns:

```sql
-- prisma/migrations/20260714XXXXXX_phase5_customer_insight/migration.sql
CREATE TABLE IF NOT EXISTS "CustomerProductInsight" ( ... );
CREATE TABLE IF NOT EXISTS "RefundInsightLedger" ( ... );

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerProductInsight_userId_fkey') THEN
    ALTER TABLE "CustomerProductInsight"
      ADD CONSTRAINT "CustomerProductInsight_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
-- (repeat for productId, sourceChannelId, lastLessonId)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RefundInsightLedger_orderId_key') THEN
    ALTER TABLE "RefundInsightLedger"
      ADD CONSTRAINT "RefundInsightLedger_orderId_key" UNIQUE ("orderId");
  END IF;
END $$;
```

---

## 3. Query service: `getCreatorConversationPreviews(creatorId)`

A new service at `src/lib/services/get-creator-conversation-previews.ts`
that replaces the inbox page's direct Prisma calls. The service
returns the same `CreatorConversationPreview[]` shape (so the
React component is unchanged) but adds 4 new fields populated
from `CustomerProductInsight`:

```typescript
// Existing shape (page.tsx)
export interface CreatorConversationPreview {
  id: string;
  productId: string;
  productLabel: string;
  productCoverUrl: string | null;
  otherUser: { id: string; name: string | null; image: string | null; role: string };
  lastMessage: { id: string; content: string; createdAt: string; senderId: string; read: boolean } | null;
  unreadCount: number;
}

// New shape (Phase 5)
export interface CreatorConversationPreviewEnriched extends CreatorConversationPreview {
  completionPercent: number | null;
  lastLessonTitle: string | null;
  sourceChannelName: string | null;
  sourceChannelId: string | null;
  lifetimeValueCents: number;
  lastContentAt: string | null;
}
```

### 3.1 Query plan (5 round-trips)

```typescript
// src/lib/services/get-creator-conversation-previews.ts
export async function getCreatorConversationPreviews(
  creatorId: string,
  options: { isAdmin?: boolean; limit?: number } = {}
): Promise<CreatorConversationPreviewEnriched[]> {

  // ── 1. Scope products ──
  // For creators: their owned products. For admin: all published.
  const ownedProducts = await prisma.product.findMany({
    where: options.isAdmin
      ? { status: "published" }
      : { creatorId, status: { in: ["published", "draft"] } },
    select: { id: true, slug: true, coverUrl: true },
  });
  const productIds = ownedProducts.map((p) => p.id);
  const productMap = new Map(ownedProducts.map((p) => [p.id, p]));

  // ── 2. Conversations (the inbox) ──
  const conversations = await prisma.conversation.findMany({
    where: {
      productId: { in: productIds },
      OR: [{ userOneId: creatorId }, { userTwoId: creatorId }],
    },
    include: {
      userOne: { select: { id: true, name: true, image: true, role: true } },
      userTwo: { select: { id: true, name: true, image: true, role: true } },
      product:  { select: { id: true, slug: true, coverUrl: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, content: true, createdAt: true, senderId: true, read: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: options.limit ?? 200,
  });

  // ── 3. Unread counts (batched) ──
  const conversationIds = conversations.map((c) => c.id);
  const unreadRows = conversationIds.length > 0
    ? await prisma.message.groupBy({
        by: ["conversationId"],
        where: { conversationId: { in: conversationIds }, read: false, senderId: { not: creatorId } },
        _count: { id: true },
      })
    : [];
  const unreadMap = new Map(unreadRows.map((r) => [r.conversationId, r._count.id]));

  // ── 4. CustomerProductInsight read model (batched) ──
  // The (otherUserId, productId) pairs from the conversations.
  const otherUserIds = new Set(conversations.map((c) => c.userOneId === creatorId ? c.userTwoId : c.userOneId));
  const insights = otherUserIds.size > 0
    ? await prisma.customerProductInsight.findMany({
        where: {
          productId: { in: productIds },
          userId: { in: Array.from(otherUserIds) },
        },
        include: {
          channel: { select: { id: true, channelName: true } },
          lesson:  { include: { translations: { take: 1, where: { locale: "it" }, select: { title: true } } } },
        },
      })
    : [];

  // Index insights by (userId, productId) for O(1) lookup
  const insightMap = new Map<string, typeof insights[number]>();
  for (const ins of insights) {
    insightMap.set(`${ins.userId}:${ins.productId}`, ins);
  }

  // ── 5. Lazy backfill (per-record, no break) ──
  // For any (otherUserId, productId) pair WITHOUT a CustomerProductInsight
  // row, do a live aggregate + insert. This is the per-record
  // migration: the first inbox load for a customer pays the backfill
  // cost; subsequent loads hit the read model.
  const missingPairs: Array<{ userId: string; productId: string }> = [];
  for (const c of conversations) {
    const otherUserId = c.userOneId === creatorId ? c.userTwoId : c.userOneId;
    if (!insightMap.has(`${otherUserId}:${c.productId}`)) {
      missingPairs.push({ userId: otherUserId, productId: c.productId });
    }
  }
  if (missingPairs.length > 0) {
    // Fire-and-forget: don't block the inbox render on a backfill.
    // The same pairs will be picked up on the next inbox load if
    // this race is lost. For correctness, the upserts are idempotent
    // (see § 4.2 for the upsert key).
    void backfillCustomerInsights(missingPairs).catch((err) => {
      console.error("[Phase5] backfillCustomerInsights failed:", err);
    });
  }

  // ── Compose the final shape ──
  return conversations.flatMap((c) => {
    if (!c.userOne || !c.userTwo || !c.product) return [];
    const otherUser = c.userOneId === creatorId ? c.userTwo : c.userOne;
    const insight = insightMap.get(`${otherUser.id}:${c.productId}`);
    const lastMessage = c.messages[0] ?? null;

    return [{
      id: c.id,
      productId: c.productId,
      productLabel: c.product.slug,
      productCoverUrl: c.product.coverUrl,
      otherUser,
      lastMessage: lastMessage ? {
        id: lastMessage.id,
        content: lastMessage.content.length > 80 ? lastMessage.content.slice(0, 80) + "…" : lastMessage.content,
        createdAt: lastMessage.createdAt.toISOString(),
        senderId: lastMessage.senderId,
        read: lastMessage.read,
      } : null,
      unreadCount: unreadMap.get(c.id) ?? 0,
      // Phase 5 additions:
      completionPercent: insight?.completionPercent ?? null,
      lastLessonTitle: insight?.lesson?.translations[0]?.title ?? null,
      sourceChannelId: insight?.sourceChannelId ?? null,
      sourceChannelName: insight?.channel?.channelName ?? null,
      lifetimeValueCents: insight?.lifetimeValueCents ?? 0,
      lastContentAt: insight?.lastContentAt?.toISOString() ?? null,
    }];
  });
}
```

**5 round-trips total:** products, conversations, message groupBy,
customer insights, lazy backfill. For a 500-row inbox, this is
~5 round-trips vs the 5N+ queries the current code does
(N conversations + 1 groupBy + N lesson-progress lookups if
extended). The lazy backfill is fire-and-forget so it doesn't
block the render.

**Why batch all 5 instead of a single Prisma query with deep
joins:** the inbox data lives in 5 different tables with different
index strategies. A single Prisma query with deep nested includes
would either (a) generate a 5-way JOIN that's hard for PG to
plan optimally, or (b) require N+1 in the application layer.
The 5-round-trip approach gives PG the best plan for each
table independently.

**Why the lazy backfill is fire-and-forget:** the inbox page
should render in <500ms. A 500-row backfill (one upsert per
missing pair) would block the render. The backfill is
idempotent (see § 4.2), so the next inbox load picks up any
incomplete writes. The error is logged, not surfaced to the
user.

### 3.2 UI integration

The `CreatorInbox` component gets 4 new fields in
`CreatorConversationPreview`:

```tsx
// src/app/dashboard/creator/messages/creator-inbox.tsx
// Add to the row render:
{insight?.sourceChannelName && (
  <p className="text-[10px] text-cream-dark-text-soft/60 truncate mt-0.5">
    {insight.sourceChannelName}
  </p>
)}
{insight?.completionPercent !== null && (
  <div className="mt-1">
    <div className="h-1 bg-cream-dark-border rounded-full overflow-hidden">
      <div
        className="h-full bg-cream-dark-gold"
        style={{ width: `${insight.completionPercent}%` }}
      />
    </div>
    <p className="text-[10px] text-cream-dark-text-soft/60 mt-0.5">
      {insight.completionPercent.toFixed(0)}% • {insight.lastLessonTitle ?? "—"}
    </p>
  </div>
)}
{insight && insight.lifetimeValueCents > 0 && (
  <p className="text-[10px] text-cream-dark-gold/80 font-medium mt-0.5">
    LTV €{(insight.lifetimeValueCents / 100).toFixed(2)}
  </p>
)}
```

The page.tsx becomes:

```typescript
// src/app/dashboard/creator/messages/page.tsx
import { getCreatorConversationPreviews } from "@/lib/services/get-creator-conversation-previews";

const previews = await getCreatorConversationPreviews(dbUser.id, {
  isAdmin: dbUser.role === "admin",
});
// ... rest unchanged ...
```

The page no longer needs `prisma.product.findMany`,
`prisma.conversation.findMany`, or `prisma.message.groupBy`
inline — all of those are encapsulated in the service.

---

## 4. Event-driven updates

The read model is updated by 4 events, each emitted from the
existing write paths. All updates are **idempotent** (upserts
keyed on `@@unique([userId, productId])`).

### 4.1 `access.granted` — from `processOrder` (PR 2 path)

When a Stripe/LemonSqueezy webhook fires and `processOrder`
creates an `Order` + `AccessGrant` (PR 2 dual-write), the
insight is also upserted. **Inline in `processOrder`, not async**,
because the LTV must reflect the purchase before the inbox
re-renders.

```typescript
// src/lib/commerce/orders/complete-order.ts — after the existing PR 2 dual-write
const orderAmount = order.amount;

// Phase 5: upsert CustomerProductInsight for LTV
await prisma.customerProductInsight
  .upsert({
    where: { userId_productId: { userId: order.userId, productId: order.productId } },
    create: {
      userId: order.userId,
      productId: order.productId,
      lifetimeValueCents: orderAmount,
      lastOrderId: order.id,
      // sourceChannelId is set by the AnalyticEvent path (see § 4.3) —
      // not the order path, because the AnalyticEvent carries the
      // channelId from the user's session at purchase time.
    },
    update: {
      lifetimeValueCents: { increment: orderAmount },
      lastOrderId: order.id,
    },
  })
  .catch((err: unknown) => {
    console.error(`[Phase5] Failed to upsert CustomerProductInsight for order ${order.id}:`, err);
  });
```

**Why `lifetimeValueCents` uses `increment`:** a single user
may have multiple completed orders for the same product (e.g.
rebill, manual recovery). The increment is safe under concurrent
updates because the upsert is atomic at the row level (PG
`INSERT ... ON CONFLICT DO UPDATE SET lifetimeValueCents =
"CustomerProductInsight"."lifetimeValueCents" + EXCLUDED.lifetimeValueCents`).

### 4.2 `lesson.started` / `lesson.completed` — from `/api/progress` POST

When a user watches a lesson, `progress/route.ts` POST upserts
`LessonProgress`. Phase 5 adds an insight upsert to track
`completionPercent` + `lastLessonId` + `lastContentAt`.

```typescript
// src/app/api/progress/route.ts — after the existing upsert
const lesson = await prisma.lesson.findUnique({
  where: { id: lessonId },
  select: { productId: true, position: true },
});
if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

// Phase 5: upsert insight with engagement
await updateInsightForLesson({
  userId: dbUser.id,
  productId: lesson.productId,
  lessonId,
  watchedAt: progress.lastWatchedAt ?? new Date(),
}).catch((err) => {
  console.error(`[Phase5] Failed to update insight for lesson ${lessonId}:`, err);
});

async function updateInsightForLesson(args: {
  userId: string;
  productId: string;
  lessonId: string;
  watchedAt: Date;
}) {
  // Recompute completionPercent: count(completed=true) / count(Lesson)
  // for this (user, product). Done in 2 queries:
  //   1. count(Lesson WHERE productId = args.productId)
  //   2. count(LessonProgress WHERE userId = args.userId AND lesson.productId = args.productId AND completed = true)
  const [totalLessons, completedLessons] = await Promise.all([
    prisma.lesson.count({ where: { productId: args.productId } }),
    prisma.lessonProgress.count({
      where: { userId: args.userId, completed: true, lesson: { productId: args.productId } },
    }),
  ]);
  const completionPercent = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 1000) / 10  // 1 decimal
    : null;

  await prisma.customerProductInsight.upsert({
    where: { userId_productId: { userId: args.userId, productId: args.productId } },
    create: {
      userId: args.userId,
      productId: args.productId,
      completionPercent,
      lastLessonId: args.lessonId,
      lastContentAt: args.watchedAt,
      // If this is a brand-new user with no insight yet, lifetimeValueCents
      // is 0 (no orders = no LTV). It'll be incremented by the order path.
    },
    update: {
      completionPercent,
      lastLessonId: args.lessonId,
      lastContentAt: args.watchedAt,
    },
  });
}
```

**Why recompute `completionPercent` on every progress event:**
the read model is the canonical source for the inbox's
"35% completato" display. Recomputing on every event is O(2
queries) and keeps the model correct. A denormalized
`completedCount + totalCount` pair would be faster (skip the
count) but introduces a drift risk if `Lesson` rows are
added/removed between the recompute and the next event.

**Why this is **inline** in `/api/progress` POST, not async via
the outbox:** the progress event is high-frequency (a user
watches 10 lessons → 10 progress events). The outbox is for
cross-domain async (email, analytics, Slack alerts). The
inbox's engagement signal is read-on-inbox-load, so an
inline update is fine — the read model just needs to be
correct by the next render, and the user is the one
triggering the event.

### 4.3 `order.completed` (Phase 2 outbox) — channel attribution

The `sourceChannelId` is captured from the `AnalyticEvent` row
with `eventType='purchase'` for the matching `(userId, productId)`.
The Phase 2 outbox consumer for `order.completed` (added in
Phase 2) writes the insight:

```typescript
// src/lib/commerce/outbox/consumers.ts (Phase 2) — add a new consumer
registerConsumer("order.completed", async (event) => {
  const { orderId, userId, productId, channelId } = event.payload;

  // Step 1: ensure the row exists. The upsert below uses an empty
  // `update` to avoid overwriting fields we don't own here
  // (lifetimeValueCents is set by § 4.1 processOrder; engagement by
  // § 4.2 /api/progress; we only manage sourceChannelId).
  await prisma.customerProductInsight.upsert({
    where: { userId_productId: { userId, productId } },
    create: {
      userId,
      productId,
      sourceChannelId: channelId ?? null,  // from AnalyticEvent
      // lifetimeValueCents was set by § 4.1 (processOrder) already.
    },
    update: {},  // no-op: only manage sourceChannelId below
  }).catch((err) => {
    console.error(`[Phase5] Failed to upsert CustomerProductInsight for order ${orderId}:`, err);
    return;  // bail on the conditional update if the row doesn't exist yet
  });

  // Step 2: first-write-wins for sourceChannelId. The conditional
  // `where: { sourceChannelId: null }` ensures we ONLY overwrite if
  // the current value is null. A previous consumer run that set the
  // channel blocks the overwrite, so the "first touch" channel
  // sticks. (A naïve `update: { sourceChannelId: channelId }` would
  // be last-write-wins, flipping on every subsequent purchase.)
  if (channelId) {
    const result = await prisma.customerProductInsight.updateMany({
      where: { userId_productId: { userId, productId }, sourceChannelId: null },
      data: { sourceChannelId: channelId },
    });
    if (result.count === 0) {
      // Either the row doesn't exist (the upsert above already logged
      // an error) or the channel was already set by a prior purchase.
      // Both are expected; no further action.
    }
  }
});
```

**Why channel attribution is async (Phase 2 outbox) but LTV
is sync (processOrder):** the channelId is captured at the
LS checkout webhook arrival, not at order creation. The outbox
event carries `channelId` in the payload (populated by
`/api/checkout/intents/:idOrToken/session` from Phase 3's
`custom_data` or the `AnalyticEvent` join). The LTV is
immediately known at order creation, so it doesn't need the
outbox hop.

**V2 addendum (not blocking):** the reviewer flagged that
`channelId` is actually available inline in the LS webhook
handler at `applyPaymentEvent` time (same as LTV), so the
async outbox hop is technically unnecessary. Phase 5 ships the
outbox consumer for symmetry with § 4.4 (refund) and for
deferring the channel write to after order creation succeeds
(transactional ordering). V2 can inline the channel write in
`processOrder` if the render-window-of-no-provenance becomes
a UX issue.

**Why `first-write-wins` for `sourceChannelId`:** a customer
may buy the same product through different channels over time
(`channelId` flips as the customer discovers the creator via
a new YouTube video). The "first touch" channel is the
provenance — the channel that drove the customer to the
product initially. The `updateMany WHERE sourceChannelId IS
NULL` ensures we only set the channel if it hasn't been set
yet, preserving the first touch.

### 4.4 `order.refunded` (Phase 2 outbox) — LTV decrement

```typescript
// src/lib/commerce/outbox/consumers.ts (Phase 2) — add a new consumer
registerConsumer("order.refunded", async (event) => {
  const { orderId, userId, productId, refundAmountCents } = event.payload;

  // Idempotency via the RefundInsightLedger table (added in § 2.1):
  // try to record this refund's application. The `@@unique([orderId])`
  // on the ledger makes the `create` atomic — a second consumer
  // invocation for the same orderId hits a P2002 unique-constraint
  // violation, which we catch and treat as "already applied."
  // This is more robust than a `lastOrderId` guard (which would
  // miss the case where a NEW order arrived between the original
  // refund and the replay — the guard would see lastOrderId pointing
  // to the new order and incorrectly skip the decrement).
  try {
    await prisma.refundInsightLedger.create({
      data: { orderId, userId, productId, refundAmountCents },
    });
  } catch (err: unknown) {
    // P2002 = unique constraint violation on orderId. We've already
    // applied this refund's LTV decrement — skip the update.
    if ((err as { code?: string }).code === "P2002") {
      console.log(`[Phase5] Refund ${orderId} already applied to LTV (ledger hit), skipping`);
      return;
    }
    throw err;  // unexpected error — let the outbox worker retry
  }

  // First-time application: decrement LTV. The ledger is the
  // idempotency boundary, so this update is safe to run exactly once
  // per (orderId, userId, productId).
  await prisma.customerProductInsight
    .update({
      where: { userId_productId: { userId, productId } },
      data: { lifetimeValueCents: { decrement: refundAmountCents } },
    })
    .catch((err: unknown) => {
      console.error(`[Phase5] Failed to decrement LTV for refund ${orderId}:`, err);
    });
});
```

**Why the decrement is in the outbox consumer, not inline in
`processOrder`:** Phase 2's outbox is the single source of
truth for the canonical `applyPaymentEvent` command, which
handles refunds the same way as new orders. A refund can
arrive minutes or days after the original purchase. The
outbox hop is the right pattern for this latency tolerance.

**Idempotency via `RefundInsightLedger`:** the outbox event
can be re-processed (worker retry, manual replay via
`/api/admin/payments/reconciliations`, dead-letter recovery).
A naïve `decrement` would drive LTV negative on replay. The
ledger records each applied refund with a `@@unique([orderId])`
constraint, so the second invocation hits a unique-constraint
violation and is skipped. This is the same pattern as
`ProcessedWebhook` (the existing Phase 2 webhook idempotency
table) — a small audit table keyed by the external event id.

**Why not a `lastOrderId` guard:** the `lastOrderId` field
tracks the most recent order that changed LTV. A guard that
checks `lastOrderId === orderId` would work for the common
case (refund the most recent order) but break in two scenarios:
(a) a NEW order arrives between the original refund and the
replay → `lastOrderId` points to the new order → the
replay's decrement is incorrectly skipped; (b) a partial
refund of an older order → `lastOrderId` points to a
different, newer order → the refund's decrement is incorrectly
skipped. The ledger is order-scoped, not last-write-scoped,
and avoids both.

**For partial refunds (V2 addendum):** the consumer assumes
`refundAmountCents` is the full order amount. For partial
refunds, the decrement amount differs from the increment
amount and LTV math gets more complex. V2 may add a
`refundLines` table on `Order` and rework the ledger to
`refundLineId`-keyed. Phase 5's ledger is the V1.5
minimum.

---

## 5. Backfill

The one-shot backfill script at
`scripts/backfill-customer-insights.ts` populates the read
model from existing data. **Idempotent** (upserts keyed on
the `@@unique` constraint) and **safe to re-run** during
the rollout window.

```typescript
// scripts/backfill-customer-insights.ts (sketch)
import { prisma } from "@/lib/db/prisma";

async function backfill() {
  // 1. For each (user, product) pair with at least one completed Order
  //    or at least one LessonProgress:
  //    a. Sum LTV from Order.amount (status='completed') - refund (status='refunded').
  //    b. Compute completionPercent from LessonProgress aggregates.
  //    c. Find lastContentAt = max(LessonProgress.lastWatchedAt, Order.createdAt).
  //    d. Find sourceChannelId from AnalyticEvent WHERE eventType='purchase' AND
  //       userId=X AND productId=Y ORDER BY createdAt ASC LIMIT 1.
  //    e. Upsert CustomerProductInsight.
  //
  // 2. Process in batches of 500 (user, product) pairs to keep memory + tx size bounded.
  //
  // 3. Log progress: (processed, upserted, skipped, errors) to stdout.
  //    Capture counts in docs/audit-log.md as the Phase 5 baseline.
}
```

The script runs once after the Phase 5 migration is applied.
The inbox can ship without the script (the lazy backfill in
§ 3.1 covers cold pairs), but the script makes the rollout
faster (no per-render backfill cost on first inbox load).

---

## 6. Implementation steps (after the design lands)

In order of dependency:

1. **Schema migration** — `prisma/migrations/20260714XXXXXX_phase5_customer_insight/migration.sql`
   with idempotent DDL matching the PR 2 / Phase 2 patterns
   (CREATE TABLE IF NOT EXISTS + DO $$ FK guards).
2. **Add `CustomerProductInsight` to `prisma/schema.prisma`** +
   `npx prisma generate` to refresh the client.
3. **`getCreatorConversationPreviews` service** at
   `src/lib/services/get-creator-conversation-previews.ts`
   (per § 3.1).
4. **Wire up `processOrder` LTV upsert** in
   `src/lib/commerce/orders/complete-order.ts` (per § 4.1).
5. **Wire up `/api/progress` engagement upsert** in
   `src/app/api/progress/route.ts` (per § 4.2).
6. **Phase 2 outbox consumers** for `order.completed` +
   `order.refunded` in `src/lib/commerce/outbox/consumers.ts`
   (per § 4.3, § 4.4). Depends on Phase 2 being shipped.
7. **Refactor inbox page** `src/app/dashboard/creator/messages/page.tsx`
   to call `getCreatorConversationPreviews` (per § 3.2).
8. **Update `CreatorInbox` component** to render the 4 new
   fields (per § 3.2 UI integration).
9. **Backfill script** `scripts/backfill-customer-insights.ts`
   (per § 5).
10. **Tests** — unit tests for the upsert idempotency
    (concurrent `increment` of `lifetimeValueCents`),
    `getCreatorConversationPreviews` query plan (mock 5
    round-trips, assert the right `Promise.all` shape),
    UI render with the 4 new fields.
11. **Operational runbook** in `docs/runbooks/phase-5-customer-insights.md`
    (separate doc) — covers the backfill job, the lazy
    backfill error rate (SLO), and the "stale insight"
    detection query (rows where `updatedAt > 1d ago` but
    the source data has moved).

---

## 7. What gets simpler in V2

- Creator analytics dashboard: a `/dashboard/creator/analytics`
  page that aggregates `CustomerProductInsight` by
  `sourceChannelId`, `completionPercent` bucket, LTV
  decile. The Phase 5 read model is the input; the V2 UI
  is pure visualization.
- Cohort analysis: `CustomerProductInsight.joinedAt`
  bucketed by week. V2 add a `firstPurchaseAt` field.
- Engagement scoring: weight completion + LTV + lastContentAt
  into a single "engagement score" for inbox sort priority.
- Partial-refund handling: the `lifetimeValueCents` becomes
  a sum of `OrderLineItem` rather than a single integer.
  Phase 5's `lifetimeValueCents` is the V1.5 minimum; V2
  can add a `refundLines` table for partial math.
- Global LTV: a separate `CustomerInsight` (singular, per-user)
  table that aggregates across products. The Phase 5 model
  is per-product; the V2 model is per-user.

---

## 8. Out of scope for Phase 5

- Cohort analysis. V2.
- Per-creator analytics dashboards. V2.
- Engagement scoring. V2.
- Partial refund math. V2.
- Global (per-user) LTV. V2.
- The `AbandonedCheckout` removal. Phase 7 cleanup.
- The `ProcessedWebhook` removal. Phase 7 cleanup.

---

## 9. References

- `docs/phase-2-webhook-inbox.md` — the outbox consumer
  pattern that § 4.3 and § 4.4 extend. `order.completed` and
  `order.refunded` are outbox events from Phase 2.
- `docs/phase-3-checkout-intent.md` — the `channelId`
  capture in `custom_data` (Phase 3) flows into § 4.3.
- `docs/audit-log.md` — the Phase 2 baseline that the
  Phase 5 backfill entry extends.
- `prisma/migrations/20260712230000_add_access_grants/migration.sql`
  — the PR 2 idempotent DDL pattern that Phase 5 mirrors.
- `src/app/dashboard/creator/messages/page.tsx` — the
  inbox page that Phase 5 refactors to call
  `getCreatorConversationPreviews`.
- `src/lib/commerce/orders/complete-order.ts` — the `processOrder`
  function that § 4.1 extends with the LTV upsert.
- `src/app/api/progress/route.ts` — the lesson progress
  endpoint that § 4.2 extends with the engagement upsert.
- `src/lib/commerce/outbox/consumers.ts` (Phase 2) — the
  consumer registry that § 4.3 and § 4.4 add new consumers to.
- `prisma/schema.prisma` — the User, Product, Lesson, YouTubeChannel
  models that `CustomerProductInsight` adds back-relations to.
- PR 1 (`3c217e2`) — `paymentProviderRegistry` interface
  (used by Phase 3, indirectly relevant to Phase 5 for
  `custom_data.channelId`).
- PR 2 (`afc288d`) — `AccessGrant` model + dual-write
  pattern that Phase 5 follows for the LTV upsert.
- PR 3 (`10055b9`) — feature-flag + dual-write cutover
  pattern (Phase 5 uses a similar lazy-backfill pattern in § 3.1).
- Phase 2 (`ff01efd`) — outbox + PG LISTEN/NOTIFY dispatcher
  (Phase 5's § 4.3 and § 4.4 consumers are registered there).
- Phase 3 (`27ef1c9`) — CheckoutIntent + RecoveryPolicy
  design (Phase 5 captures `channelId` from Phase 3's
  `custom_data`).
