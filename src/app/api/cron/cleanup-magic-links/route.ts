import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/cron/cleanup-magic-links
 *
 * Endpoint per Vercel Cron Jobs — elimina tutti i MagicLink scaduti.
 * Eseguito automaticamente una volta al giorno (configurato in vercel.json).
 *
 * Protezione: accetta CRON_SECRET sia via header Authorization che via
 * query parameter ?secret=... (necessario per Vercel cron che non può
 * passare header custom).
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("[Cron] CRON_SECRET not configured — rejecting request");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }

    // Accetta il secret via header Authorization (chiamate manuali/test)
    // o via query parameter (Vercel cron jobs)
    const isValid =
      (authHeader && authHeader === `Bearer ${cronSecret}`) ||
      (querySecret && querySecret === cronSecret);

    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const result = await prisma.magicLink.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    console.log(`[Cron] MagicLink cleanup: deleted ${result.count} expired tokens`);

    return NextResponse.json({
      success: true,
      deleted: result.count,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("GET /api/cron/cleanup-magic-links error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
