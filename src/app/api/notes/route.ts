import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";

// GET — Recupera appunti per una lezione
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const lessonId = searchParams.get("lessonId");
    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const note = await prisma.lessonNote.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId } },
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error("GET /api/notes error:", error);
    return NextResponse.json({ error: "Failed to fetch note" }, { status: 500 });
  }
}

// POST — Salva/aggiorna appunti per una lezione
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { lessonId, content } = body;
    if (!lessonId || content === undefined) {
      return NextResponse.json({ error: "Missing lessonId or content" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const note = await prisma.lessonNote.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      update: { content },
      create: { userId: user.id, lessonId, content },
    });

    return NextResponse.json({ success: true, note });
  } catch (error) {
    console.error("POST /api/notes error:", error);
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }
}

// DELETE — Elimina appunti di una lezione
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const lessonId = searchParams.get("lessonId");
    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await prisma.lessonNote.deleteMany({
      where: { userId: user.id, lessonId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/notes error:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
