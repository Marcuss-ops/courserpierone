import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getServerUser } from "@/lib/supabase/get-user";

/**
 * POST /api/discussions/[postId]/like
 * Mette like a un post (toggle: se già likato, lo rimuove).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { postId } = await params;

    // Verifica che il post esista
    const post = await prisma.discussionPost.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, title: true, product: { select: { slug: true } } },
    });
    if (!post) {
      return NextResponse.json({ error: "Post non trovato" }, { status: 404 });
    }

    // Toggle: se esiste già, rimuovi; altrimenti crea
    const existing = await prisma.discussionLike.findFirst({
      where: { userId: dbUser.id, postId },
    });

    if (existing) {
      await prisma.discussionLike.delete({ where: { id: existing.id } });
      return NextResponse.json({ success: true, liked: false });
    }

    try {
      await prisma.discussionLike.create({
        data: { userId: dbUser.id, postId },
      });
    } catch (err) {
      // Race condition: already liked by another concurrent request
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ success: true, liked: true });
      }
      throw err;
    }

    // Notifica all'autore del post (se non è lo stesso utente)
    if (post.userId !== dbUser.id) {
      await prisma.notification.create({
        data: {
          userId: post.userId,
          type: "new_like",
          message: `${dbUser.name || dbUser.email?.split("@")[0]} ha messo like al tuo post "${post.title.slice(0, 40)}"`,
          link: `/${post.product.slug}/portal#discussions`,
        },
      });
    }

    return NextResponse.json({ success: true, liked: true });
  } catch (error) {
    console.error("POST /api/discussions/[postId]/like error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/discussions/[postId]/like
 * Rimuove il like dal post.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { postId } = await params;

    const existing = await prisma.discussionLike.findFirst({
      where: { userId: dbUser.id, postId },
    });
    if (!existing) {
      return NextResponse.json({ success: true, liked: false });
    }

    await prisma.discussionLike.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true, liked: false });
  } catch (error) {
    console.error("DELETE /api/discussions/[postId]/like error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
