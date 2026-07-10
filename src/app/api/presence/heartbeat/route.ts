/**
 * POST /api/presence/heartbeat
 *
 * Invia un heartbeat per marcare l'utente corrente come online.
 * Il client deve chiamare questo endpoint ogni 30 secondi.
 *
 * Response:
 *   200 OK — heartbeat registrato
 *   401 Unauthorized — utente non autenticato
 */

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { heartbeat } from "@/lib/presence";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

// Force dynamic — heartbeat è sempre runtime
export const dynamic = "force-dynamic";

async function POST_IMPL() {
  try {
    const { dbUser } = await getServerUser();
    if (!dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    await heartbeat(dbUser.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}

// Rate limited: max 20 heartbeat/min per utente (ogni 3 secondi è sufficiente)
export const POST = withRateLimit(POST_IMPL, "PUBLIC");
