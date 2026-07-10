import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";

// GET — Recupera appunti per una lezione
export async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const lessonId = searchParams.get("lessonId");
    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    }

    const note = await prisma.lessonNote.findUnique({
      where: { userId_lessonId: { userId: dbUser.id, lessonId } },
    });

    return NextResponse.json({ note });
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch note");
  }
}

// POST — Salva/aggiorna appunti per una lezione
export async function POST(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { lessonId, content } = body;
    if (!lessonId || content === undefined) {
      return NextResponse.json({ error: "Missing lessonId or content" }, { status: 400 });
    }

    const note = await prisma.lessonNote.upsert({
      where: { userId_lessonId: { userId: dbUser.id, lessonId } },
      update: { content },
      create: { userId: dbUser.id, lessonId, content },
    });

    return NextResponse.json({ success: true, note });
  } catch (error) {
    return apiErrorResponse(error, "Failed to save note");
  }
}

// DELETE — Elimina appunti di una lezione
export async function DELETE(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const lessonId = searchParams.get("lessonId");
    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    }

    await prisma.lessonNote.deleteMany({
      where: { userId: dbUser.id, lessonId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Failed to delete note");
  }
}
