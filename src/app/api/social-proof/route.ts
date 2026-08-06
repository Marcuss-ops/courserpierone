import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";

/** Standardized notification list. Module-scope so the type isn't
 *  re-allocated on every request (the route is hot — polled by the
 *  landing page for the social-proof ticker). */
interface SocialProofEvent {
  id: string;
  type: "purchase" | "lesson";
  name: string;
  city: string;
  createdAt: Date;
  lessonTitle?: string;
  lessonPosition?: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productSlug = searchParams.get("productSlug");
    const locale = searchParams.get("locale") || "en";

    if (!productSlug) {
      return NextResponse.json({ error: "Product slug is required" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { slug: productSlug, deletedAt: null },
      include: {
        lessons: {
          include: {
            translations: true,
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // 1. Fetch recent orders (completed)
    const recentOrders = await prisma.order.findMany({
      where: {
        productId: product.id,
        status: "completed",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // 2. Fetch recent lesson completions for this product
    const lessonIds = product.lessons.map((l) => l.id);
    const recentProgress = await prisma.lessonProgress.findMany({
      where: {
        lessonId: { in: lessonIds },
        completed: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        lesson: {
          include: {
            translations: true,
          },
        },
      },
    });

    // Fetch users for the lesson progress
    const userIds = [...new Set(recentProgress.map((p) => p.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Helper to clean and format name (no email exposure)
    const formatName = (name?: string | null): string => {
      if (!name) return "Student";
      const raw = name.split("@")[0].replace(/[0-9_.-]+/g, " ").trim();
      const parts = raw.split(" ");
      const first = parts[0];
      if (!first) return "Student";
      return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    };

    // Helper to get city based on locale + deterministic user seed (no email)
    const getCity = (userLocale?: string | null, userName?: string | null, userId?: string | null): string => {
      const cleanLocale = (userLocale || locale).toLowerCase();
      const lang = cleanLocale.split("-")[0];

      const cities: Record<string, string[]> = {
        it: ["Milano", "Roma", "Torino", "Napoli", "Firenze", "Bologna", "Palermo", "Genova", "Venezia", "Bari"],
        da: ["København", "Aarhus", "Odense", "Aalborg"],
        ru: ["Mosca", "San Pietroburgo", "Novosibirsk", "Kazan", "Ekaterinburg"],
        es: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Zaragoza"],
        fr: ["Parigi", "Lione", "Marsiglia", "Tolosa", "Nizza"],
        de: ["Berlino", "Amburgo", "Monaco", "Colonia", "Francoforte"],
        pt: ["San Paolo", "Rio de Janeiro", "Brasilia", "Salvador"],
        en: ["Londra", "New York", "Los Angeles", "Chicago", "Toronto", "Sydney"],
      };

      const fallbackCities = cities.en;
      const list = cities[lang] || fallbackCities;

      // Deterministic seed: userId > name > locale
      const seed = userId || userName || userLocale || "default";
      const index = Math.abs(hashCode(seed)) % list.length;
      return list[index];
    };

    function hashCode(str: string): number {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return hash;
    }

    // Standardized notifications list
    const events: SocialProofEvent[] = [];

    // Map order events
    recentOrders.forEach((order) => {
      const name = formatName(order.user.name);
      const city = getCity(order.locale, order.user.name, order.user.id);
      events.push({
        id: `order-${order.id}`,
        type: "purchase",
        name,
        city,
        createdAt: order.createdAt,
      });
    });

    // Map progress events
    recentProgress.forEach((prog) => {
      const user = userMap.get(prog.userId);
      const name = formatName(user?.name);
      const city = getCity(locale, user?.name, user?.id);
      const lessonTitle = prog.lesson.translations.find((t) => t.locale.startsWith(locale.split("-")[0]))?.title
        || prog.lesson.translations[0]?.title
        || `Lezione ${prog.lesson.position}`;

      events.push({
        id: `progress-${prog.id}`,
        type: "lesson",
        name,
        city,
        lessonTitle,
        lessonPosition: prog.lesson.position,
        createdAt: prog.updatedAt,
      });
    });

    // Sort by most recent — `+createdAt` coerces Date → number senza
    // allocare un nuovo Date wrapper (l'originale `new Date(...).getTime()`
    // allocava n Date object per n log n comparison del sort).
    events.sort((a, b) => +b.createdAt - +a.createdAt);

    return NextResponse.json({ events });
  } catch (error) {
    return apiErrorResponse(error, "Failed to get social proof events");
  }
}
