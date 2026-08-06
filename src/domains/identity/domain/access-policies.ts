/**
 * src/lib/access/policies.ts
 *
 * Step 8 — typed AccessPolicy discriminated union.
 *
 * ─── Step 9 — MCR Phase 3 cutover (this revision) ─────────────────────
 *
 * Renamed AccessContext.hasCompletedOrder → hasActiveAccessGrant.
 * The semantic regression is small but precise:
 *   - Before: "a `Order.status === 'completed'` row exists for
 *     (userId, productId)". This read was an early project-only
 *     shortcut inherited from the pre-AccessGrant era.
 *   - After:  "a `AccessGrant.status === 'active'` row exists for
 *     (userId, productId)" — the post-cutover canonical read.
 *
 * The Boolean is filled in by the consumer (AccessGate.tsx, future
 * migrate-pending-routes) by calling `resolveProductAccess` ONCE at the
 * top of the route handler — keeping the policy evaluator pure
 * (test-only fixtures, no Prisma). See `evaluateAccess` doc-comment for
 * the invariant: "All DB lookups happen BEFORE evaluateAccess".
 *
 * Step 8 architecture (ports-and-adapters discriminated union) is
 * unchanged:
 *   - Pure-function discriminated union with a `kind` tag. No class
 *     hierarchies, no DI containers.
 *   - Each policy `evaluate(policy, ctx) → AccessDecision | null` —
 *     `null` means "I don't apply, continue to the next policy". The
 *     engine iterates and short-circuits on the first definite decision.
 *   - Edge-portable policies: `free_course`, `session_required`.
 *   - Node-only policies (DB-backed): `admin_role`, `access_resolved`,
 *     `pending_order` — explicit `requiresDb: true` discriminator on
 *     the type union.
 *
 * V2 follow-up — EXECUTED (this revision): the prior `owned_grant`
 * pseudo-policy has been RENAMED to `access_resolved`. The rename is
 * intentional honesty: the policy no longer "simulates a grant" — it
 * reads the boolean `ctx.hasActiveAccessGrant` that the consumer
 * filled upstream via `resolveProductAccess` (the canonical AccessGrant
 * SSOT path). The discriminator name reflects the actual semantics
 * ("access was resolved upstream") instead of misleading call sites
 * into thinking the policy itself checks ownership.
 *
 * The `admin_role` collapse was left out of scope by design:
 *   - `admin_role` reads `ctx.userRole` (User.role column, not AccessGrant).
 *   - `access_resolved` reads `ctx.hasActiveAccessGrant` (filled by the
 *   -                                 resolver from AccessGrant rows).
 *   - Conflating them would re-leak `User.role` into a column that
 *     AccessGrant SSOT should not depend on for the customer path.
 */

export type AccessPolicy =
  // ── Edge-portable (no DB) ───────────────────────────────────
  | { kind: "free_course" }
  | { kind: "session_required" }
  // ── Node-only (DB-backed) ──────────────────────────────────
  | { kind: "admin_role"; requiresDb: true }
  // `access_resolved` is the renamed, onesta-policy successor to
  // the prior `owned_grant` pseudo-policy. It reads the boolean
  // `ctx.hasActiveAccessGrant`, filled by the consumer via
  // `resolveProductAccess` (read of `AccessGrant.status="active"` +
  // non-expired, sourceType-agnostic). The rename removes the
  // misleading implication that this policy itself decides ownership.
  | { kind: "access_resolved"; requiresDb: true }
  | { kind: "pending_order"; requiresDb: true };

export type AccessDecision =
  | { action: "allow"; reason: AccessAllowReason }
  | { action: "deny"; reason: AccessDenyReason; redirectUrl?: string }
  | {
      action: "pending";
      reason: "verifying_order";
      productDefaultLanguage?: string | null;
    };

export type AccessAllowReason =
  | "free_course_bypass"
  | "admin"
  | "owned"
  | "pending_verification";

export type AccessDenyReason = "missing_session" | "default_deny";

/**
 * Flat AccessContext. Every field is optional — each policy declares
 * which subset it reads. Consumers (Edge proxy, RSC AccessGate, API
 * require-admin) build their own context with the fields they were
 * able to fetch.
 */
export interface AccessContext {
  /** Request pathname — useful for logging, not strictly required by any policy. */
  pathname: string;
  // ── Edge-portable fields (no DB needed) ──────────────────
  /** True when the supabase session cookie is present (proxy.ts's `hasSession`). */
  hasSession?: boolean;
  /**
   * True when the course at `pathname` is in NEXT_PUBLIC_FREE_COURSE_SLUGS
   * AND its DB price is 0 (defense-in-depth). Computed upstream by
   * `isFreeCourse(slug, price)` (src/lib/courses/is-free-course.ts).
   */
  isFreeCourseSlug?: boolean;
  // ── Node-only fields (DB-backed; Node-only policies won't
  //    fire without them) ─────────────────────────────────
  userId?: string | null;
  userRole?: string | null;
  /**
   * Step 9 — renamed from `hasCompletedOrder`.
   * True when `resolveProductAccess({userId, productId})` returns
   * `allowed: true` (any sourceType, status="active", non-expired).
   * The consumer fills this in via a single top-of-route call
   * (`src/components/course/access-gate.tsx`); the policy evaluator
   * remains pure (no DB).
   */
  hasActiveAccessGrant?: boolean;
  /** User.id that owns a pending payment for this product. */
  pendingOrderOwnerId?: string | null;
  /** Whether the authenticated owner has a payment currently being verified. */
  hasPendingOrder?: boolean;
  /** `Product.defaultLanguage` — locale for the verifying screen + paywall links. */
  productDefaultLanguage?: string | null;
}

/**
 * Pure-function policy evaluator. `null` means "I don't apply —
 * continue to the next policy in the chain".
 *
 * The `default` branch uses `never` so adding a new AccessPolicy
 * variant without a switch case fails at compile time (= type-level
 * exhaustiveness check, mirrors Step 7's PaymentDomainAction switch).
 */
export function evaluatePolicy(
  policy: AccessPolicy,
  ctx: AccessContext,
): AccessDecision | null {
  switch (policy.kind) {
    case "free_course": {
      // Free-course bypass — single read of `isFreeCourseSlug`. The
      // consumer is responsible for building this boolean via the
      // combined check (slug in FREE_COURSE_SLUGS + price === 0).
      if (ctx.isFreeCourseSlug) {
        return { action: "allow", reason: "free_course_bypass" };
      }
      return null;
    }

    case "session_required": {
      if (!ctx.hasSession) {
        return {
          action: "deny",
          reason: "missing_session",
          redirectUrl: "/login",
        };
      }
      // has session — defer to next policy for fine-grained verdict
      return null;
    }

    case "admin_role": {
      if (ctx.userRole === "admin") {
        return { action: "allow", reason: "admin" };
      }
      return null;
    }

    case "access_resolved": {
      // The renamed successor of `owned_grant`. Policy short-circuits
      // on `hasActiveAccessGrant` (true when `resolveProductAccess`
      // verdict is allowed). The boolean is filled by the consumer via
      // a single top-of-route call to the resolver — the policy
      // evaluator itself is pure (no Prisma inside).
      //
      // Empty (undefined) is treated as "no" to preserve the existing
      // chain-passthrough semantics when the consumer hasn't fetched
      // the verdict yet (legacy callers). This deliberate null-check
      // prevents a missing consumer from silently granting access.
      if (ctx.hasActiveAccessGrant === true) {
        return { action: "allow", reason: "owned" };
      }
      return null;
    }

    case "pending_order": {
      // Verifying-order screen ONLY for the order's owner. A
      // different user (or no user) sees the paywall via the
      // post-loop default-deny.
      //
      // Step 9 — deliberately unchanged. The reading of
      // `Order.status="pending"` is a payment-lifecycle concern,
      // NOT an access-control concern. AccessGrant represents
      // finalized access; "in flight" is a different domain.
      if (
        ctx.pendingOrderOwnerId &&
        ctx.userId &&
        ctx.pendingOrderOwnerId === ctx.userId &&
        ctx.hasPendingOrder === true
      ) {
        return {
          action: "pending",
          reason: "verifying_order",
          productDefaultLanguage: ctx.productDefaultLanguage,
        };
      }
      return null;
    }

    default: {
      // Type-level exhaustiveness: if a new variant is added to
      // AccessPolicy without a switch case, this assignment fires a
      // TS error. Same pattern used in src/lib/commerce/payments/
      // providers/lemonsqueezy/index.ts#translateEvent.
      const _exhaustive: never = policy;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Iterate policies in order; return the first definite decision.
 * Default-deny if no policy fires.
 *
 * This is the single composable entry point. Consumers (Edge
 * proxy.ts, RSC AccessGate, API requireAdmin) build their own
 * `policies: AccessPolicy[]` for their route, hydrate the relevant
 * AccessContext fields, and call `evaluateAccess`.
 */
export function evaluateAccess(
  policies: AccessPolicy[],
  ctx: AccessContext,
): AccessDecision {
  for (const policy of policies) {
    const decision = evaluatePolicy(policy, ctx);
    if (decision) return decision;
  }
  return { action: "deny", reason: "default_deny" };
}
