import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getServerUser } from "@/lib/supabase/get-user";
import { prisma } from "@/lib/db/prisma";
import { Lock, ArrowRight, Sparkles } from "lucide-react";
import { env } from "@/lib/env";
import { PendingOrderScreen } from "./pending-order-screen";

interface AccessGateProps {
  productSlug: string;
  courseTitle?: string;
  callbackUrl: string;
  orderId?: string;
  children: ReactNode;
}

/**
 * Server-side access gate.
 *
 * Grants access if any of the following is true:
 * - Product is in FREE_COURSE_SLUGS AND price === 0 (open-access test/free course)
 * - User is an admin
 * - User has a completed order for the product
 * - A valid completed order ID is provided in the query string
 *
 * For free courses (step 0), authenticated users also receive a
 * `free_enrollment` AccessGrant on first visit so progress tracking,
 * messaging, and ebook downloads work via the standard MCR Phase 2
 * resolveProductAccess path.
 *
 * Otherwise redirects unauthenticated users to login (preserving the
 * callback URL) and shows a paywall to authenticated users without access.
 */
export async function AccessGate({
  productSlug,
  courseTitle,
  callbackUrl,
  orderId,
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
    // Product not found — let the page handle 404
    return <>{children}</>;
  }

  let hasAccess = false;

  // 0. FREE COURSE BYPASS — courses listed in FREE_COURSE_SLUGS env var
  // with price=0 are accessible to anyone (no login, no payment).
  // This is the SSOT for "test/free" courses. Adding a slug here makes
  // it open-access without touching the access resolver.
  //
  // Defense-in-depth: BOTH `FREE_COURSE_SLUGS` env var AND `price === 0`
  // must be true. A real product whose price is accidentally set to 0
  // is NOT bypassed unless its slug is also explicitly listed.
  const freeSlugs = (env.FREE_COURSE_SLUGS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (freeSlugs.includes(product.slug) && product.price === 0) {
    hasAccess = true;

    // For authenticated users, upsert a free_enrollment AccessGrant so
    // progress tracking + messaging + ebook downloads work via the
    // standard resolveProductAccess path (MCR Phase 2).
    if (dbUser) {
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
  }

  // 1. Admin always has access
  if (dbUser?.role === "admin") {
    hasAccess = true;
  }

  // 2. Authenticated user with completed order
  if (!hasAccess && dbUser) {
    const order = await prisma.order.findFirst({
      where: {
        userId: dbUser.id,
        productId: product.id,
        status: "completed",
      },
    });
    if (order) hasAccess = true;
  }

  // 3. Access via order_id query param (post-checkout immediate access)
  let pendingOrderId: string | null = null;
  if (!hasAccess && orderId) {
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { providerOrderId: orderId }],
        productId: product.id,
      },
    });
    if (order?.status === "completed") {
      hasAccess = true;
    } else if (order?.status === "pending") {
      // Only the order owner (or a guest who will log in) may see the
      // verifying screen. Otherwise fall through to the paywall.
      if (!user?.email || dbUser?.id === order.userId) {
        pendingOrderId = order.id;
      }
    }
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  // Pending order from checkout — show verifying screen with auto-refresh,
  // or redirect unauthenticated users to login preserving the callback URL.
  if (pendingOrderId) {
    if (!user?.email) {
      redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    return <PendingOrderScreen orderId={pendingOrderId} locale={product.defaultLanguage ?? "it"} />;
  }

  // Not authenticated → redirect to login with callback URL
  if (!user?.email) {
    const loginUrl = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    redirect(loginUrl);
  }

  // Authenticated but no access → paywall
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
