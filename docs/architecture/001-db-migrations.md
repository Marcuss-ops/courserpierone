# ADR 001 — Database Migration Policy (Additive Changes Until v2)

**Status:** Accepted
**Deciders:** Platform architecture
**Created:** 2026-07-16
**Supersedes:** —

## Context

Our Lemon Squeezy (LS) webhook integration handles the critical domain
asynchronously: order creation, access grants, revocations. LS retries failed
webhooks for up to ~30 days. If we alter the database schema in a
backward-incompatible way while a historic retry is queued, the retry permanently
fails — leaving the user charged on LS but no AccessGrant issued (or the
opposite: user revoked on LS but our DB still grants access).

The webhook processor is the most stressful consumer of `Order`, `AccessGrant`,
and `ProcessedWebhook` rows because it reads **time-shifted** events on demand.
Every other consumer (dashboard, marketing site, public catalog) only reads
freshly-written rows. Only the webhook path replays history.

Until now this constraint was implicit. This ADR makes it explicit, named,
auditable, and tied to a concrete cutover (v2 launch).

## Scope and "v2" definition

This ADR binds until the first **v2** major release of the product. **v2** is
defined as the first schema-breaking planned cutover, documented in
`docs/operations/cutover-v2.md` (placeholder until the milestone is scheduled).
After v2 launches, this ADR is marked `Status: Superseded` and the migration
audit in the **Cutover plan (v2)** section is executed.

Until that milestone: Regola 1 + Regola 2 bind **all** migration PRs touching
`Order` / `AccessGrant` / `ProcessedWebhook` / `Product` / `User` (the strict
addictive zone declared below).

## Decision

Until the v2 cutover we adopt **two strict schema migration rules**:

### Regola 1 — Additive-only changes (strict zone)

Until v2 we **only** allow **additive changes** for any column read or written
by the LS webhook processor. Forbidden until v2:

- `DROP COLUMN` on a column read/written by the webhook processor.
- `RENAME COLUMN` on a column read/written by the webhook processor.
- Changing nullability in a way that would reject a historical retry payload
  (e.g., tightening `NULL` → `NOT NULL` while live rows hold `NULL`).

Workaround (introduce-new-then-migrate, dual-write cookbook):

1. Add the new column (with `@default(...)` if needed — see Regola 2).
2. Dual-write from app code (write both old + new columns in the same Prisma call).
3. Backfill historical rows via a one-off script (`scripts/migrate-...`).
4. Switch reads from old to new column.
5. The actual `DROP` of the old column is **deferred to v2**.

### Regola 2 — Default-or-nullable for new NOT NULL columns

Any `NOT NULL` column added to an **existing** table must:

- Carry an explicit `@default(...)` so existing rows get the value at migration
  time, OR
- Be `nullable` (effectively optional) for at least one release cycle so
  historical rows hold `NULL` without breaking writes, OR
- Be added together with an explicit data-migration script that populates the
  value for every existing row before the constraint is enforced.

Rationale: without a default, Postgres fails every pre-existing row on
`ALTER TABLE ADD COLUMN ... NOT NULL`. Without a default in the Prisma client,
app code that forgets the new column breaks silently at runtime.

**Exception (anti-abuse clause)**: "Brand-new table" means a table that did
**not** exist in any prior migration at the time of its introduction. If the
table is a rename or schema-equivalent variant of an existing one — even
if `prisma migrate dev` provisions it as a fresh physical table — Regola 1's
strict-addictive posture still applies: foreign keys carry implicit
dependency on the prior rows, and the rename is a logical migration, not a
null-violation-safe opportunity.

Brand-new tables introduced truly empty (e.g., `ProcessedWebhook` was added
recently as a table with no predecessor in the schema) CAN declare
`NOT NULL` columns without defaults because there are zero pre-existing rows
to violate.

## Webhook Processor Dependency Map (Strict-Addictive Zone)

The following columns are read or written by the LS webhook path
(`processOrder`, `revokeOrder`, `idempotency.ts`, `processor.ts`, and the LS
adapter `translateEvent`). All are locked by Regola 1 from any DROP or RENAME
until v2:

- **`ProcessedWebhook`**: `provider`, `deliveryId`, `eventType`, `payload`, `createdAt`
- **`Order`**: `paymentProvider`, `providerOrderId`, `status`, `userId`, `productId`, `amount`, `currency`, `locale`, `customerCountry`, `channelId`
- **`AccessGrant`**: `sourceType`, `sourceId`, `productId`, `userId`, `status`, `revokedAt`
- **`Product`**: `id`, `slug`, `lemonVariantId`, `price`
- **`User`**: `email`, `name`, `preferredLocale`

### LS payload ↔ Prisma schema "collar" points

These mappings lock the schema to LS event shape. Each line is one possible
drift vector if the Prisma column changes:

| LS payload path | Prisma column | Why critical |
| --- | --- | --- |
| `attributes.user_email` / `customer_email` | `User.email` | Customer lookup + dedup key |
| `attributes.user_name` | `User.name` | Fallback when signup name missing |
| `attributes.total` | `Order.amount` | Amount in cents, post-tax |
| `attributes.currency` | `Order.currency` | ISO-4217 code |
| `attributes.first_order_item.variant_id` (with fallbacks `variant_id` / `product_variant_id`) | `Product.lemonVariantId` | Match key |
| `meta.custom_data.locale` | `Order.locale` | BCP-47 for email routing |
| `meta.custom_data.courseSlug` / `productSlug` | `Product.slug` | Lookup key |
| `meta.custom_data.channelId` | `Order.channelId`, `AnalyticEvent.channelId` | YouTube attribution |
| `meta.event_name` | `ProcessedWebhook.eventType` | Cache discriminator |
| `data.id` (LS order_id or subscription_id) | `Order.providerOrderId` | Idempotency key |

## Failure Scenarios (Concrete)

If we violate Regola 1, these 3 real-world modes trigger:

1. **Rename `ProcessedWebhook.deliveryId` → `deliveryKey`.** An `order_created`
   webhook from a previous deploy retries after timeout.
   `wasAlreadyProcessed({ provider, deliveryId })` runs a Prisma query
   referencing a column that no longer exists. Prisma throws an SQL error, the
   route returns 500, and LS re-queues. The webhook is stuck in retry limbo
   forever.

2. **Drop `Order.currency`.** We decide "currency is in the cents now" and
   remove the column. A 3-week-old retry arrives. `processOrder` →
   `tx.order.create({ data: { ..., currency: 'usd', ... } })` fails with an
   unknown-column error. The `$transaction` rolls back **without** creating the
   AccessGrant. The user is charged on LS but never gets course access. Their
   confirmation email is never sent. Manual incident.

3. **Rename `AccessGrant.sourceId` → `orderId`.** A `subscription_cancelled`
   retry arrives weeks late. `revokeOrder` →
   `updateMany({ where: { sourceId: ... }, data: { status: 'revoked' } })`
   fails because the column is gone. The user is "cancelled" on LS but our DB
   still shows `AccessGrant.status='active'`. They retain permanent access to
   the course. Refund obligations mismatch our records.

If we violate Regola 2, these modes trigger:

1. **`ALTER TABLE "Order" ADD COLUMN "refundedAmountCents" INTEGER NOT NULL;`**
   on a table with thousands of existing rows. Postgres rejects the migration
   with `column "refundedAmountCents" contains null values`. The migration
   does not apply. Production halts at the next `prisma migrate deploy`.

2. **App forgets the new column in `tx.order.create(...)`.** Without
   `@default`, every new create fails on the missing field. There is no
   compile-time signal — only a silent runtime failure that surfaces in the
   next webhook or dashboard request.

## Consequences / Tradeoffs

Adopting this policy has these consequences:

- **Schema cluttering.** Until v2 we accept accumulating "shadow columns"
  (legacy names kept alive for backward compat). Prisma `schema.prisma` will
  carry fields that no app code currently writes — but they exist so
  historical retries still work and dev tooling can read both shapes during
  a cutover.
- **Slower refactors.** What was a 1-step migration becomes a 5-step
  dual-write cookbook. We trade quick renames for predictable operations.
- **Implicit Prisma drops disabled.** Devs cannot rename a column and rely on
  `prisma migrate dev` to drop the old one. We need explicit SQL migrations
  for those cases.
- **Bigger migrations overall.** Each rename is now ≥2 migrations (add-new,
  drop-old deferred to v2). Slightly noisier git log of `prisma/migrations/`
  but visually obvious that the deferred drops are tracked.

## Cutover plan (v2)

When v2 launches:

1. Audit `Order`, `AccessGrant`, `ProcessedWebhook` columns against the
   current LS payload shape.
2. Identify columns no longer used in any code path.
3. Run a final `DROP COLUMN ... IF EXISTS` migration as part of the v2
   release cutover.
4. Update this ADR to `Status: Superseded` and link the v2 cutover migration
   PR. If v2 introduces new columns, those go through Regola 2 from day one
   (no fresh "v2 grace period").

## Exceptions

If before v2 a *non-additive* change is genuinely required (e.g., LS API change
breaks a contract), open a 2-week RFC window with platform architecture review.
The exception is recorded inline at the bottom of this ADR with date +
rationale. Do **not** ship the exception via a hotfix single-commit — surface
it for review like any other schema migration.

## References

- Cross-referenced from `ARCHITECTURE.md` (the new ADR lives in
  `docs/architecture/` because it cuts across multiple `@docs/adr/`-scoped
  domains: payment, access control, webhook reliability).
- Related ADRs:
  - [`docs/adr/0009-content-source-canonical.md`](../adr/0009-content-source-canonical.md)
    — already cites `prisma/schema.prisma` and migration conventions.
  - [`docs/adr/0014-atomicity-boundary.md`](../adr/0014-atomicity-boundary.md)
    — establishes the atomicity rule that the dual-write cookbook protects.
- Implementation references:
  - Webhook processor: `src/lib/commerce/webhooks/processor.ts`
  - Idempotency gate: `src/lib/commerce/webhooks/idempotency.ts`
  - Process order: `src/lib/commerce/orders/complete-order.ts`
  - Revoke order: `src/lib/commerce/orders/revoke-order.ts`
  - LS adapter: `src/lib/commerce/payments/providers/lemonsqueezy/index.ts`
- Tooling (enforcement of Regola 1 + Regola 2):
  - `scripts/ci/check-destructive-migrations.sh` — content-based scanner
    that fails the gate on `DROP COLUMN`, `DROP TABLE`, `RENAME COLUMN`,
    `RENAME TO`, `TRUNCATE` in any modified `migration.sql`. Replaces the
    legacy `ci.yml` inline regex on pathnames (which matched folder
    NAMES — not SQL content — and silently let destructive migrations
    through). Run via `bash scripts/ci/check-destructive-migrations.sh`,
    `npm run check:migrations`, or `--self-test` (12 fixture cases).
  - `scripts/ci/migration-test.sh` — execution-based complement:
    applies every migration to a fresh `postgres:16-alpine` to catch
    malformed SQL and cumulative drift (not just keyword shapes).

---

## Exceptions log

To date: no non-additive exceptions granted. Each exception must be recorded
here with **date + RFC link + rationale + migration PR link** before it
ships. Empty state is correct; the section is the audit anchor, not a
content placeholder.
