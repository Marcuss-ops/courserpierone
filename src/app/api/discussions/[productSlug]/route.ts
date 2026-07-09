import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { createDiscussionPostSchema } from "@/lib/utils/validations";

/**
 * GET /api/discussions/[productSlug]
 * Lista i post di discussione per un prodotto, con paginazione.
 * I post pinnati appaiono in cima.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productSlug: string }> }
) {
  try {
    const { productSlug } = await params;
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
    const skip = (page - 1) * limit;

    const product = await prisma.product.findUnique({ where: { slug: productSlug }, select: { id: true } });
    if (!product) {
      return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
    }

    const [posts, total] = await Promise.all([
      prisma.discussionPost.findMany({
        where: { productId: product.id },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, image: true, username: true } },
          _count: { select: { comments: true, likes: true } },
        },
      }),
      prisma.discussionPost.count({ where: { productId: product.id } }),
    ]);

    return NextResponse.json({
      posts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/discussions/[productSlug] error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

/**
 * POST /api/discussions/[productSlug]
 * Crea un nuovo post di discussione (solo utenti autenticati).
 * Solo admin possono pinnare post.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productSlug: string }> }
) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { productSlug } = await params;
    const product = await prisma.product.findUnique({ where: { slug: productSlug }, select: { id: true } });
    if (!product) {
      return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const parsed = createDiscussionPostSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
      return NextResponse.json({ error: "Validazione fallita", details: errors }, { status: 400 });
    }

    const { title, content, pinned } = parsed.data;
    // Solo admin possono pinnare
    const canPin = dbUser.role === "admin" ? pinned : false;

    const post = await prisma.discussionPost.create({
      data: {
        productId: product.id,
        userId: dbUser.id,
        title,
        content,
        pinned: canPin,
      },
      include: {
        user: { select: { id: true, name: true, image: true, username: true } },
        _count: { select: { comments: true, likes: true } },
      },
    });

    return NextResponse.json({ success: true, post }, { status: 201 });
  } catch (error) {
    console.error("POST /api/discussions/[productSlug] error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
