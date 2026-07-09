import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { createDiscussionCommentSchema } from "@/lib/utils/validations";

/**
 * GET /api/discussions/[postId]/comments
 * Elenca i commenti di un post, ordinati per data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "30", 10), 50);
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      prisma.discussionComment.findMany({
        where: { postId },
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, image: true, username: true } },
          _count: { select: { likes: true } },
        },
      }),
      prisma.discussionComment.count({ where: { postId } }),
    ]);

    return NextResponse.json({
      comments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/discussions/[postId]/comments error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

/**
 * POST /api/discussions/[postId]/comments
 * Aggiunge un commento a un post (solo utenti autenticati).
 * Crea una notifica per l'autore del post.
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
      select: { id: true, userId: true, product: { select: { slug: true } } },
    });
    if (!post) {
      return NextResponse.json({ error: "Post non trovato" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const parsed = createDiscussionCommentSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
      return NextResponse.json({ error: "Validazione fallita", details: errors }, { status: 400 });
    }

    const comment = await prisma.discussionComment.create({
      data: {
        postId,
        userId: dbUser.id,
        content: parsed.data.content,
      },
      include: {
        user: { select: { id: true, name: true, image: true, username: true } },
        _count: { select: { likes: true } },
      },
    });

    // Notifica all'autore del post (se non è lo stesso utente)
    if (post.userId !== dbUser.id) {
      await prisma.notification.create({
        data: {
          userId: post.userId,
          type: "new_comment",
          message: `${dbUser.name || dbUser.email?.split("@")[0]} ha commentato il tuo post`,
          link: `/${post.product.slug}/portal#discussions`,
        },
      });
    }

    return NextResponse.json({ success: true, comment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/discussions/[postId]/comments error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
