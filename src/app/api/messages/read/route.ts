import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";

/**
 * PATCH /api/messages/read
 * Segna come letti tutti i messaggi da un mittente specifico.
 * Body: { senderId: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await request.json();
    const { senderId } = body;

    if (!senderId) {
      return NextResponse.json({ error: "senderId obbligatorio" }, { status: 400 });
    }

    const result = await prisma.message.updateMany({
      where: {
        receiverId: dbUser.id,
        senderId,
        read: false,
      },
      data: { read: true },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}
