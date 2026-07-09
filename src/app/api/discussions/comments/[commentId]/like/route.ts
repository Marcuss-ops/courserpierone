import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getServerUser } from "@/lib/supabase/get-user";

/**
 * POST /api/discussions/comments/[commentId]/like
 * Mette like a un commento (toggle).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { commentId } = await params;

    const comment = await prisma.discussionComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, post: { select: { product: { select: { slug: true } } } } },
    });
    if (!comment) {
      return NextResponse.json({ error: "Commento non trovato" }, { status: 404 });
    }

    const existing = await prisma.discussionLike.findFirst({
      where: { userId: dbUser.id, commentId },
    });

    if (existing) {
      await prisma.discussionLike.delete({ where: { id: existing.id } });
      return NextResponse.json({ success: true, liked: false });
    }

    try {
      await prisma.discussionLike.create({
        data: { userId: dbUser.id, commentId },
      });
    } catch (err) {
      // Race condition: already liked by another concurrent request
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ success: true, liked: true });
      }
      throw err;
    }

    // Notifica all'autore del commento
    if (comment.userId !== dbUser.id) {
      await prisma.notification.create({
        data: {
          userId: comment.userId,
          type: "new_like",
          message: `${dbUser.name || dbUser.email?.split("@")[0]} ha messo like al tuo commento`,
          link: `/${comment.post.product.slug}/portal#discussions`,
        },
      });
    }

    return NextResponse.json({ success: true, liked: true });
  } catch (error) {
    console.error("POST /api/discussions/comments/[commentId]/like error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/discussions/comments/[commentId]/like
 * Rimuove il like dal commento.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { commentId } = await params;

    const existing = await prisma.discussionLike.findFirst({
      where: { userId: dbUser.id, commentId },
    });
    if (!existing) {
      return NextResponse.json({ success: true, liked: false });
    }

    await prisma.discussionLike.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true, liked: false });
  } catch (error) {
    console.error("DELETE /api/discussions/comments/[commentId]/like error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
