import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";
import { findCompletedOrder } from "@/lib/access/find-completed-order";

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
 * 3. Verifica accesso: admin OR ordine completed (403)
 * 4. Restituisce il video URL dal database
 *
 * TODO: Quando i video saranno migrati da YouTube/Vimeo a Supabase Storage,
 *       generare signed URL con TTL breve (5 min) via createSignedUrl().
 *       Questo renderà i link inutilizzabili dopo la scadenza,
 *       prevenendo la condivisione non autorizzata.
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

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

    // Resolve product
    const product = await prisma.product.findUnique({
      where: { slug: productSlug },
      select: { id: true, slug: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
    }

    // Check access: admin or completed order (V2 DRY: helper consolidato,
    // admin bypass resta inline).
    let hasAccess = dbUser.role === "admin";

    if (!hasAccess) {
      const order = await findCompletedOrder({
        userId: dbUser.id,
        productId: product.id,
      });
      hasAccess = !!order;
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
