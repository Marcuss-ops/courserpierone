import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendAbandonedCheckoutEmail } from "@/lib/commerce/shared/email";
import { apiErrorResponse } from "@/lib/errors";

/**
 * GET /api/cron/abandoned-checkouts
 *
 * Endpoint per un cron job esterno (es. cron-job.org, GitHub Actions, Vercel Cron).
 * Trova i checkout abbandonati nelle ultime 24h e invia un'email di recupero.
 *
 * Proteggi questo endpoint con CRON_SECRET per sicurezza.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("[Cron] CRON_SECRET not configured — rejecting request");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Trova checkout abbandonati (pending, più vecchi di 1h, più recenti di 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

    const abandonedCheckouts = await prisma.abandonedCheckout.findMany({
      where: {
        status: "pending",
        createdAt: {
          gte: twentyFourHoursAgo,
          lte: oneHourAgo,
        },
        reminderSentAt: null,
      },
      include: {
        product: { select: { id: true, slug: true } },
      },
    });

    console.log(`[Cron] Trovati ${abandonedCheckouts.length} checkout abbandonati da recuperare`);

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const checkout of abandonedCheckouts) {
      try {
        let checkoutUrl = checkout.checkoutUrl
          || `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/${checkout.product.slug}`;

        // C2b: LS-only checkout. RECOVERY10 is appended as `discount=`
        // (Lemon Squeezy's checkout-discount format).
        checkoutUrl += checkoutUrl.includes("?") ? "&discount=RECOVERY10" : "?discount=RECOVERY10";

        const success = await sendAbandonedCheckoutEmail(
          checkout.email,
          checkout.product.slug,
          checkoutUrl,
          checkout.locale
        );

        if (success) {
          // Segna il reminder come inviato
          await prisma.abandonedCheckout.update({
            where: { id: checkout.id },
            data: { reminderSentAt: new Date() },
          });
        }

        results.push({ email: checkout.email, success });
      } catch (err) {
        console.error(`[Cron] Errore per ${checkout.email}:`, err);
        results.push({ email: checkout.email, success: false, error: String(err) });
      }
    }

    return NextResponse.json({
      processed: abandonedCheckouts.length,
      results,
    });
  } catch (error) {
    return apiErrorResponse(error, "Cron job failed");
  }
}
