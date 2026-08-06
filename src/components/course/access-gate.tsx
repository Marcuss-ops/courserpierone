import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { getServerUser } from "@/lib/supabase/get-user";
import { prisma } from "@/lib/db/prisma";
import { Lock, ArrowRight, Sparkles } from "lucide-react";
import { isFreeCourse } from "@/lib/courses/is-free-course";
import { PendingOrderScreen } from "./pending-order-screen";
import {
  resolveProductAccess,
} from "@/domains/identity";
import {
  CHECKOUT_SESSION_COOKIE,
  readCheckoutSession,
} from "@/lib/commerce/access/checkout-token";
import {
  evaluateAccess,
  type AccessPolicy,
  type AccessContext,
} from "@/lib/access/policies";

interface AccessGateProps {
  productSlug: string;
  courseTitle?: string;
  callbackUrl: string;
  children: ReactNode;
}

/**
 * Server-side access gate.
 *
 * Step 8 refactor — the inline if-cascade (`hasAccess = false` ->
 * free -> admin -> owned -> pendingOrder -> paywall fallback) is
 * REPLACED by the typed AccessPolicy discriminated-union evaluator
 * (`src/lib/access/policies.ts`). Public surface is unchanged:
 *
 *   - children rendered when access is allowed
 *   - PendingOrderScreen rendered when there's a pending order owned
 *     by the current user (matched via `pending_order` policy)
 *   - redirect to /login when the user is unauthenticated and access
 *     is denied (callbackUrl preserved)
 *   - paywall JSX rendered when authenticated but no access
 *
 * Step 9 - MCR Phase 3 cutover: the inline
 * `Order.findFirst({status: "completed"})` is REPLACED by
 * `resolveProductAccess` (`src/lib/commerce/access/resolve-product-access.ts`)
 * - the canonical AccessGrant-based read. AccessGrant honors all
 * sourceTypes (order, free_enrollment, admin, bundle, watchlist)
 * with status="active" + non-expired.
 *
 * Step 10 - frontend migration: the parallel `prisma.order.findFirst`
 * pending-order lookup is ALSO gone. The resolver returns
 * `payment_pending` with `orderId` + `pendingOrderOwnerId` (the
 * buyer's verifying screen reads it from the single canonical result,
 * never from a duplicate Order query).
 *
 * Side effects preserved:
 *   - On free-course bypass for an authenticated user, upsert a
 *     `free_enrollment` AccessGrant so progress tracking / messaging /
 *     ebook downloads work via the standard path.
 *   - The paywall JSX uses Italian copy and the gold accent vars
 *     (preserved as-is from the pre-Step-8 version).
 */
export async function AccessGate({
  productSlug,
  courseTitle,
  callbackUrl,
  children,
}: AccessGateProps) {
  const { user, dbUser } = await getServerUser();

  // Resolve product from slug (or UUID)
  const product = await prisma.product.findFirst({
    where: {
      OR: [{ slug: productSlug }, { id: productSlug }],
    },
    select: { id: true, slug: true, defaultLanguage: true, price: true },
  });

  if (!product) {
    // Product not found - let the page handle 404
    return <>{children}</>;
  }

  // Anonymous post-checkout access is read only from the server-set
  // HttpOnly session cookie. Raw providerOrderId/orderId query params are
  // intentionally not part of this component's public contract.
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(CHECKOUT_SESSION_COOKIE)?.value;
  let checkoutSession = null;
  if (sessionId) {
    try {
      checkoutSession = await readCheckoutSession(sessionId, {
        productId: product.id,
        productSlug: product.slug,
      });
    } catch (error) {
      console.warn("[AccessGate] Invalid checkout session:", error);
    }
  }

  // Step 9: AccessGrant SSOT cutover
  const hasCheckoutSession = Boolean(checkoutSession);
  const granted = dbUser || hasCheckoutSession
    ? await resolveProductAccess({
        userId: dbUser?.id,
        userRole: dbUser?.role,
        productId: product.id,
        provider: checkoutSession?.provider,
        providerOrderId: checkoutSession?.providerOrderId,
      })
    : null;

  // Hoist DB lookups (Step 8 invariant: policies are pure, data
  // fetching happens BEFORE evaluateAccess).
  //
  // Step 10: the pending-order signal comes from the resolver's
  // `payment_pending` verdict (orderId + pendingOrderOwnerId) — the
  // parallel `prisma.order.findFirst` is removed. Payment lifecycle is
  // still read ONLY inside `resolveProductAccess`, which stays the
  // single canonical place that touches Order.
  const isPendingVerdict = granted?.reason === "payment_pending";
  const pendingOrderOwnerId = isPendingVerdict
    ? (granted?.pendingOrderOwnerId ?? null)
    : null;
  const pendingOrderId = isPendingVerdict ? (granted?.orderId ?? null) : null;

  // Defensive coalescing: the AccessContext fields are optional, but
  // their semantics are null-vs-undefined-aware in evaluatePolicy.
  // Use `null` for "explicitly no value" so the policy's null-check
  // (e.g., `userRole === null` -> opt out) is symmetric with "DB says
  // no user".
  //
  // Step 9/V2 - `hasActiveAccessGrant` replaces `hasCompletedOrder`.
  // The boolean is filled by `resolveProductAccess` ONLY for
  // authenticated users (anonymous visitors leave it undefined, which
  // the `access_resolved` policy treats as "no - continue to next
  // policy").
  const ctx: AccessContext = {
    pathname: callbackUrl,
    hasSession: !!user,
    isFreeCourseSlug: isFreeCourse(product.slug, product.price),
    userId: dbUser?.id ?? null,
    userRole: dbUser?.role ?? null,
    hasActiveAccessGrant: granted?.hasAccess === true,
    pendingOrderOwnerId,
    pendingOrderId,
    productDefaultLanguage: product.defaultLanguage,
  };

  // RSC chain - full Node-side AccessPolicy set. Order matters:
  // free_course runs first (no DB needed), then admin/access_resolved/
  // pending_order with requiresDb. first-match wins.
  //
  // V2 — `owned_grant` renamed to `access_resolved`. The policy reads
  // the `ctx.hasActiveAccessGrant` boolean filled upstream by
  // `resolveProductAccess`. The new name is honest: this policy does
  // NOT "own" the decision, it consumes a pre-resolved verdict.
  const policies: AccessPolicy[] = [
    { kind: "free_course" },
    { kind: "admin_role", requiresDb: true },
    { kind: "access_resolved", requiresDb: true },
    { kind: "pending_order", requiresDb: true },
  ];
  const decision = evaluateAccess(policies, ctx);

  // ALLOW branch
  if (decision.action === "allow") {
    // Free-course side-effect: upsert free_enrollment AccessGrant
    // on first authenticated visit so progress tracking +
    // messaging + ebook downloads work via the standard path.
    if (decision.reason === "free_course_bypass" && dbUser) {
      try {
        await prisma.accessGrant.upsert({
          where: {
            sourceType_sourceId_productId: {
              sourceType: "free_enrollment",
              sourceId: `free_enrollment:${dbUser.id}:${product.id}`,
              productId: product.id,
            },
          },
          update: {},
          create: {
            userId: dbUser.id,
            productId: product.id,
            sourceType: "free_enrollment",
            sourceId: `free_enrollment:${dbUser.id}:${product.id}`,
            status: "active",
          },
        });
      } catch (err) {
        // Best-effort: log and continue. The page still renders.
        console.warn("[AccessGate] free_enrollment grant upsert failed:", err);
      }
    }
    return <>{children}</>;
  }

  // PENDING branch
  if (decision.action === "pending") {
    if (!user?.email) {
      // Guest viewing a pending order they don't own: drop to the
      // login flow (matching the original code's behavior - the
      // pending_order policy itself already gated on pendingOrderOwnerId
      // === userId, so an unauthed guest seeing this branch is by
      // design impossible; the safety check is for type-soundness.)
      redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    return (
      <PendingOrderScreen
        orderId={decision.orderId}
        locale={decision.productDefaultLanguage ?? product.defaultLanguage ?? "it"}
      />
    );
  }

  // DENY branch
  // Not authenticated -> redirect to login with callback URL
  if (!user?.email) {
    const loginUrl = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    redirect(loginUrl);
  }

  // Authenticated but no access -> paywall JSX (preserved verbatim
  // from pre-Step-8 implementation - Italian copy + gold accent vars).
  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 font-sans flex items-center justify-center p-6 relative overflow-hidden">
      <div
        className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full blur-[120px] -z-10 opacity-20"
        style={{ backgroundColor: "#C9840D" }}
      />
      <div
        className="absolute bottom-0 -left-40 w-[400px] h-[400px] rounded-full blur-[100px] -z-10 opacity-15"
        style={{ backgroundColor: "#C9840D" }}
      />

      <div className="max-w-md w-full text-center space-y-8 relative z-10">
        <div className="w-20 h-20 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <Lock className="w-10 h-10 text-[#C9840D]" />
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
            Accesso Riservato
          </h1>
          <p className="text-zinc-400 text-sm md:text-base font-medium leading-relaxed">
            {courseTitle
              ? `Questo contenuto è riservato agli acquirenti di "${courseTitle}".`
              : "Questo contenuto è riservato agli acquirenti."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href={`/${product.defaultLanguage ?? "it"}/${product.slug}/about`}
            className="px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #C9840D 0%, #C9840DCC 100%)",
              boxShadow: "0 4px 20px #C9840D40",
            }}
          >
            <Sparkles className="w-4 h-4" />
            Scopri il Corso
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/dashboard"
            className="px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest text-zinc-300 bg-white/[0.03] border border-white/5 hover:text-white hover:bg-white/[0.06] flex items-center gap-2 transition-all"
          >
            Vai alla Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
