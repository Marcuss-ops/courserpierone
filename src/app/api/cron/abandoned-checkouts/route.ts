import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendAbandonedCheckoutEmail } from "@/lib/services/email";

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
    // Protezione: richiede un secret configurato
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Trova checkout abbandonati (pending, più vecchi di 30 min, più recenti di 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const abandonedCheckouts = await prisma.abandonedCheckout.findMany({
      where: {
        status: "pending",
        createdAt: {
          gte: twentyFourHoursAgo,
          lte: thirtyMinutesAgo,
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
        const checkoutUrl = checkout.checkoutUrl
          || `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/${checkout.product.slug}`;

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
    console.error("GET /api/cron/abandoned-checkouts error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
