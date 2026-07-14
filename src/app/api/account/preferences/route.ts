import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";
import { z } from "zod";

/**
 * PATCH /api/account/preferences
 *
 * Aggiorna UNA o più NotificationPreference booleans dell'utente
 * autenticato. Auto-upsert della riga se mancante (idempotente).
 *
 * Body (Zod): partial di tutti i campi boolean; almeno uno richiesto.
 *              Es. `{ inappChatReply: true }`, `{ emailNewLesson: false }`.
 *
 * Returns: 200 { success, preferences } | 400 | 401
 */
const preferencesSchema = z
  .object({
    emailNewLesson: z.boolean().optional(),
    emailCommunityReply: z.boolean().optional(),
    inappChatReply: z.boolean().optional(),
    inappNewLesson: z.boolean().optional(),
    inappCommunityReply: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Almeno un campo richiesto",
  });

export const PATCH = withRateLimit(async function PATCH(request: NextRequest) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return NextResponse.json(
      { error: "Validazione fallita", details: errors },
      { status: 400 },
    );
  }

  try {
    // Prisma upsert idempotente: crea la riga con i defaults all-on,
    // poi applica gli override del request body.
    const updated = await prisma.notificationPreference.upsert({
      where: { userId: dbUser.id },
      create: { userId: dbUser.id, ...parsed.data },
      update: parsed.data,
      select: {
        emailNewLesson: true,
        emailCommunityReply: true,
        inappChatReply: true,
        inappNewLesson: true,
        inappCommunityReply: true,
      },
    });

    return NextResponse.json({ success: true, preferences: updated });
  } catch (err) {
    return apiErrorResponse(err, "Errore nel salvataggio preferenze");
  }
}, "AUTH");
