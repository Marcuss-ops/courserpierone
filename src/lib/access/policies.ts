/**
 * src/lib/access/policies.ts
 *
 * Step 8 — typed AccessPolicy discriminated union.
 *
 * Replaces 3 scattered access-check patterns across the codebase with a
 * single typed engine:
 *   1. Edge proxy.ts's checkProtectedAccess (free_course bypass + session_required)
 *   2. RSC AccessGate's free → admin → owned_order → pending_order chain
 *   3. API route require-admin (session_required + admin_role)
 *
 * Architecture (mirrors Step 7's ports-and-adapters idiom — the same
 * `PaymentDomainAction` discriminated union that runs through a single
 * `switch`):
 *   - Pure-function discriminated union with a `kind` tag. No class
 *     hierarchies, no DI containers.
 *   - Each policy `evaluate(policy, ctx) → AccessDecision | null` —
 *     `null` means "I don't apply, continue to the next policy". The
 *     engine iterates and short-circuits on the first definite decision.
 *   - All DB lookups happen BEFORE `evaluateAccess(policies, ctx)` runs.
 *     The policies themselves are pure and testable in isolation with
 *     fixed AccessContext fixtures. NO Prisma mocks needed for unit tests.
 *   - Edge-portable policies: `free_course`, `session_required`. They
 *     work in Vercel Edge runtime (Next.js proxy.ts / middleware).
 *   - Node-only policies (DB-backed): `admin_role`, `owned_grant`,
 *     `pending_order` — explicit `requiresDb: true` discriminator on
 *     the type union. The compiler catches a future PR that adds a
 *     Node-only policy without the marker.
 *
 * Edge/Node composability:
 *   - In Edge (proxy.ts), the policy chain MUST be a subset of
 *     { free_course, session_required } — other variants would 500 on
 *     `ctx.userRole === undefined` and silently fall through.
 *   - In Node (RSC AccessGate, API routes) the full set is available
 *     because getServerUser / Prisma have hydrated the context.
 *
 * Backward-compat:
 *   - `checkProtectedAccess` (Edge) and `requireAdmin` (API) keep
 *     their existing `NextResponse | null` signatures. The new engine
 *     is the internal engine; the public surface is unchanged.
 *   - `AccessGate` (RSC) keeps its JSX render (paywall / verifying /
 *     children) — the policy chain REPLACES the inline if-cascade,
 *     but the prop interface and side-effects (free_enrollment upsert)
 *     are preserved bit-for-bit.
 */

export type AccessPolicy =
  // ── Edge-portable (no DB) ───────────────────────────────────
  | { kind: "free_course" }
  | { kind: "session_required" }
  // ── Node-only (DB-backed) ──────────────────────────────────
  | { kind: "admin_role"; requiresDb: true }
  | { kind: "owned_grant"; requiresDb: true }
  | { kind: "pending_order"; requiresDb: true };

export type AccessDecision =
  | { action: "allow"; reason: AccessAllowReason }
  | { action: "deny"; reason: AccessDenyReason; redirectUrl?: string }
  | {
      action: "pending";
      reason: "verifying_order";
      /** Prisma `Order.id` — passed to `<PendingOrderScreen orderId=... />` */
      orderId: string;
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
  /** True if a `Order.status === "completed"` row exists for (userId, productId). */
  hasCompletedOrder?: boolean;
  /**
   * User.id that owns a `Order.status === "pending"` row matching the
   * `orderId` query-param at the request URL. Compared against
   * `ctx.userId` inside `pending_order` policy — only the owner sees
   * the verifying screen.
   */
  pendingOrderOwnerId?: string | null;
  /** Prisma `Order.id` for the pending_order case. Used to render PendingOrderScreen. */
  pendingOrderId?: string | null;
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

    case "owned_grant": {
      if (ctx.hasCompletedOrder) {
        return { action: "allow", reason: "owned" };
      }
      return null;
    }

    case "pending_order": {
      // Verifying-order screen ONLY for the order's owner. A
      // different user (or no user) sees the paywall via the
      // post-loop default-deny.
      if (
        ctx.pendingOrderOwnerId &&
        ctx.userId &&
        ctx.pendingOrderOwnerId === ctx.userId &&
        ctx.pendingOrderId
      ) {
        return {
          action: "pending",
          reason: "verifying_order",
          orderId: ctx.pendingOrderId,
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
