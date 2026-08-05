import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";
import { resolveProductAccess } from "@/lib/commerce/access/resolve-product-access";
import { isFreeCourse } from "@/lib/courses/is-free-course";

/**
 * GET /api/videos/stream?lessonId=xxx&productSlug=xxx&lang=it
 *
 * Restituisce il video URL solo se l'utente ha accesso al corso.
 * Il video URL NON viene mai esposto nell'HTML server-rendered —
 * viene consegnato solo dopo verifica accesso server-side.
 *
 * Flow:
 * 1. Verifica autenticazione (401 se non autenticato)
 * 2. Verifica che il prodotto esista (404)
 * 3. Verifica accesso: admin OR AccessGrant attivo (403)
 * 4. Restituisce il video URL dal database
 *
 * Access control — V2 AccessGrant cutover: la verifica d'accesso
 * passa per `resolveProductAccess` (read di `AccessGrant.status="active"`
 * + non-scaduto, sourceType-agnostico) — mai una query diretta a
 * `Order.status="completed"`.
 *
 * TODO: Quando i video saranno migrati da YouTube/Vimeo a Supabase Storage,
 *       generare signed URL con TTL breve (5 min) via createSignedUrl().
 *       Questo renderà i link inutilizzabili dopo la scadenza,
 *       prevenendo la condivisione non autorizzata.
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();

    const { searchParams } = new URL(request.url);
    const lessonId = searchParams.get("lessonId");
    const productSlug = searchParams.get("productSlug");
    const lang = searchParams.get("lang") ?? "it";

    if (!lessonId || !productSlug) {
      return NextResponse.json(
        { error: "lessonId e productSlug sono obbligatori" },
        { status: 400 },
      );
    }

    // Resolve product + free course check (defense-in-depth: both
    // NEXT_PUBLIC_FREE_COURSE_SLUGS env var AND product.price === 0).
    // Free courses (e.g. test-course-e2e) are open-access to anyone,
    // matching the AccessGate + middleware + /api/ebook/download bypass
    // for the same slug. See src/lib/courses/is-free-course.ts.
    const product = await prisma.product.findUnique({
      where: { slug: productSlug },
      select: { id: true, slug: true, price: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
    }

    const isFree = isFreeCourse(productSlug, product.price);

    if (!isFree && (!user?.email || !dbUser)) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // Check access: free course OR resolveProductAccess (which handles
    // admin bypass via `userRole` + any active AccessGrant sourceType).
    // The old inline `dbUser?.role === "admin"` short-circuit is GONE —
    // the canonical resolver owns the admin rule. For non-free courses
    // we already required `dbUser` above, so the resolver path always
    // has a user. For free courses `dbUser` may be null (guest), hence
    // the `?.` on the resolver guard.
    let hasAccess = isFree;

    if (!hasAccess && dbUser) {
      const granted = await resolveProductAccess({
        userId: dbUser.id,
        userRole: dbUser.role,
        productId: product.id,
      });
      hasAccess = granted.hasAccess;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Accesso negato — acquista il corso per guardare i video" },
        { status: 403 },
      );
    }

    // Resolve the video URL from LessonTranslation
    const lessonTranslation = await prisma.lessonTranslation.findFirst({
      where: { lessonId, locale: lang },
      select: { videoUrl: true },
    });

    // Fallback: try any locale
    const videoUrl = lessonTranslation?.videoUrl
      ?? (
        await prisma.lessonTranslation.findFirst({
          where: { lessonId },
          select: { videoUrl: true },
          orderBy: { id: "asc" },
        })
      )?.videoUrl
      ?? null;

    if (!videoUrl) {
      return NextResponse.json(
        { error: "Video non trovato per questa lezione" },
        { status: 404 },
      );
    }

    return NextResponse.json({ videoUrl });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "AUTH");
