import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut, ArrowRight, User } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { StatsBento } from "@/components/dashboard/stats-bento";
import { CourseCard } from "@/components/dashboard/course-card";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { CertificatesShowcase } from "@/components/dashboard/certificates-showcase";
import { NotificationsDropdown, type UnreadConversation } from "@/components/dashboard/notifications-dropdown";
import { PWAInstallBanner } from "@/components/pwa-install-banner";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

interface ProductProgress {
  productId: string;
  slug: string;
  total: number;
  completed: number;
  coverUrl: string | null;
}

interface DisplayOrder {
  id: string;
  product: {
    id: string;
    slug: string;
    coverUrl: string | null;
    _count: { lessons: number };
  };
  createdAt: Date;
}

export default async function DashboardPage() {
  const { user, dbUser } = await getServerUser();

  if (!user?.email || !dbUser) {
    redirect("/login");
  }

  // ── Fetch orders (admin sees all published products as virtual orders) ──
  let userOrders: DisplayOrder[] = [];
  if (dbUser.role === "admin") {
    const publishedProducts = await prisma.product.findMany({
      where: { status: "published" },
      select: {
        id: true,
        slug: true,
        coverUrl: true,
        _count: { select: { lessons: true } },
      },
    });
    userOrders = publishedProducts.map((p) => ({
      id: `admin-virtual-order-${p.id}`,
      product: p,
      createdAt: new Date(),
    }));
  } else {
    const dbUser2 = await prisma.user.findUnique({
      where: { email: dbUser.email },
      include: {
        orders: {
          where: { status: "completed" },
          include: {
            product: {
              select: {
                id: true,
                slug: true,
                coverUrl: true,
                _count: { select: { lessons: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    userOrders = (dbUser2?.orders ?? []).map((o) => ({
      id: o.id,
      product: o.product,
      createdAt: o.createdAt,
    }));
  }

  // ── Fetch data: 1 query for lessons (used twice), then 3 in parallel ──
  const orderProductIds = userOrders.map((o) => o.product.id);

  const allLessons: { id: string; productId: string }[] =
    orderProductIds.length > 0
      ? await prisma.lesson.findMany({
          where: { productId: { in: orderProductIds } },
          select: { id: true, productId: true },
        })
      : [];
  const allLessonIds = allLessons.map((l) => l.id);

  const [completedLessons, lastWatch, progressRecords] = await Promise.all([
    prisma.lessonProgress.count({
      where: { userId: dbUser.id, completed: true },
    }),
    prisma.lessonProgress.findFirst({
      where: { userId: dbUser.id, lastWatchedAt: { not: null } },
      orderBy: { lastWatchedAt: "desc" },
      include: {
        lesson: {
          select: {
            id: true,
            position: true,
            product: { select: { slug: true, defaultLanguage: true } },
            translations: {
              take: 1,
              orderBy: { id: "desc" },
              select: { title: true, locale: true },
            },
          },
        },
      },
    }),
    allLessonIds.length > 0
      ? prisma.lessonProgress.findMany({
          where: { userId: dbUser.id, lessonId: { in: allLessonIds }, completed: true },
          select: { lessonId: true },
        })
      : Promise.resolve([] as { lessonId: string }[]),
  ]);

  // ── Aggregate per-product progress in JS (zero extra queries) ──
  const lessonProductMap = new Map(allLessons.map((l) => [l.id, l.productId]));
  const totalByProduct = new Map<string, number>();
  for (const lesson of allLessons) {
    totalByProduct.set(lesson.productId, (totalByProduct.get(lesson.productId) ?? 0) + 1);
  }
  const completedByProduct = new Map<string, number>();
  for (const p of progressRecords) {
    const productId = lessonProductMap.get(p.lessonId);
    if (productId) {
      completedByProduct.set(productId, (completedByProduct.get(productId) ?? 0) + 1);
    }
  }
  const productProgress: ProductProgress[] = userOrders.map((o) => ({
    productId: o.product.id,
    slug: o.product.slug,
    total: totalByProduct.get(o.product.id) ?? 0,
    completed: completedByProduct.get(o.product.id) ?? 0,
    coverUrl: o.product.coverUrl,
  }));

  const totalLessons = productProgress.reduce((sum, p) => sum + p.total, 0);
  const progressPercent =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // ── Resume link from last watched lesson ──
  const lastLessonTitle = lastWatch?.lesson?.translations?.[0]?.title;
  const resumeLocale =
    lastWatch?.lesson?.translations?.[0]?.locale ??
    lastWatch?.lesson?.product?.defaultLanguage ??
    "it";
  const resumeSlug = lastWatch?.lesson?.product?.slug;
  const resumePosition = lastWatch?.lesson?.position;
  const resumeHref =
    resumeSlug && resumePosition
      ? `/it/${resumeSlug}/curso/lesson-${resumePosition}`
      : undefined;
  const resumeLabel = lastLessonTitle
    ? `Riprendi: ${lastLessonTitle}`
    : undefined;

  // ── Unread messages count + recent unread conversations for dropdown ──
  const unreadMessages = await prisma.message.count({
    where: {
      read: false,
      senderId: { not: dbUser.id },
      conversation: {
        OR: [
          { userOneId: dbUser.id },
          { userTwoId: dbUser.id },
        ],
      },
    },
  });

  // Fetch top 5 conversations with unread messages for the dropdown
  const unreadConversationRows =
    unreadMessages > 0
      ? await prisma.conversation.findMany({
          where: {
            OR: [{ userOneId: dbUser.id }, { userTwoId: dbUser.id }],
            messages: {
              some: {
                read: false,
                senderId: { not: dbUser.id },
              },
            },
          },
          include: {
            userOne: { select: { id: true, name: true, image: true } },
            userTwo: { select: { id: true, name: true, image: true } },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, content: true, createdAt: true, senderId: true, read: true },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 5,
        })
      : [];

  // Build unread conversation previews for dropdown
  const unreadConversations: UnreadConversation[] = unreadConversationRows.map((c) => {
    const otherUser = c.userOneId === dbUser.id ? c.userTwo : c.userOne;
    const lastMsg = c.messages[0];

    return {
      conversationId: c.id,
      otherUserId: otherUser.id,
      otherUserName: otherUser.name,
      otherUserImage: otherUser.image,
      lastMessageContent: lastMsg
        ? lastMsg.content.length > 60
          ? lastMsg.content.slice(0, 60) + "…"
          : lastMsg.content
        : "",
      lastMessageCreatedAt: lastMsg?.createdAt.toISOString() ?? c.updatedAt.toISOString(),
      unreadCount: 0, // placeholder — computed below
    };
  });

  // Compute per-conversation unread counts with one batch query
  if (unreadConversations.length > 0) {
    const convIds = unreadConversationRows.map((c) => c.id);
    const unreadRows = await prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: convIds },
        read: false,
        senderId: { not: dbUser.id },
      },
      _count: { id: true },
    });
    const unreadMap = new Map(unreadRows.map((r) => [r.conversationId, r._count.id]));
    for (const conv of unreadConversations) {
      conv.unreadCount = unreadMap.get(conv.conversationId) ?? 0;
    }
  }

  // ── Certificates (products fully completed) ──
  const completedProductIds = productProgress
    .filter((p) => p.total > 0 && p.completed >= p.total)
    .map((p) => ({ productId: p.productId, slug: p.slug }));

  return (
    <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased relative overflow-x-hidden">
      {/* Subtle warm glow overlay across the whole page */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255, 140, 66, 0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(255, 200, 130, 0.04) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      {/* Top Navigation — warm dark, frosted glass */}
      <nav className="sticky top-0 z-50 bg-cream-dark-bg/80 backdrop-blur-xl border-b border-cream-dark-border">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xl text-white shadow-sm transition-all group-hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #444 100%)" }}
            >
              C
            </div>
            <span className="font-serif italic text-[28px] leading-none tracking-[-0.2px] text-cream-dark-text group-hover:opacity-70 transition-opacity">
              courssy
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {/* DM messages — notification dropdown */}
            <NotificationsDropdown
              conversations={unreadConversations}
              totalUnread={unreadMessages}
            />
            <div className="hidden sm:flex items-center gap-3 pl-4 pr-2 py-1.5 bg-cream-dark-surface/80 border border-cream-dark-border rounded-full">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden">
                {dbUser.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={dbUser.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-3.5 h-3.5 text-cream-gold" />
                )}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-cream-dark-text leading-none">
                  {dbUser.name || dbUser.email?.split("@")[0]}
                </p>
                <p className="text-[9px] text-cream-dark-text-soft font-medium uppercase tracking-wider mt-0.5">
                  {dbUser.role === "admin" ? "Admin" : "Studente"}
                </p>
              </div>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="p-2.5 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-cream-dark-text-soft hover:text-red-400 hover:border-red-400/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-dark-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-dark-bg"
                aria-label="Esci"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="relative max-w-7xl mx-auto px-6 py-10 lg:py-12 pb-24 space-y-10">
        {/* Welcome banner with optional resume CTA */}
        <WelcomeBanner
          name={dbUser.name}
          courseCount={userOrders.length}
          hasOrders={userOrders.length > 0}
          resumeHref={resumeHref}
          resumeLabel={resumeLabel}
        />

        {/* Stats Bento */}
        <StatsBento
          courseCount={userOrders.length}
          completedLessons={completedLessons}
          totalLessons={totalLessons}
          progressPercent={progressPercent}
        />

        {/* My Courses Section */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-3xl text-cream-dark-text leading-tight">
                I Tuoi Corsi
              </h2>
              <p className="text-sm text-cream-dark-text-soft font-light mt-1">
                {userOrders.length === 0
                  ? "Esplora il catalogo per iniziare"
                  : `${userOrders.length} ${userOrders.length === 1 ? "corso" : "corsi"} nella tua libreria`}
              </p>
            </div>
            {userOrders.length > 0 && (
              <Link
                href="/"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-cream-dark-gold hover:gap-2.5 transition-all"
              >
                Esplora il catalogo <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {userOrders.length === 0 ? (
            <DashboardEmptyState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {userOrders.map((order) => {
                const progress = productProgress.find(
                  (p) => p.productId === order.product.id
                );
                return (                    <CourseCard
                    key={order.id}
                    slug={order.product.slug}
                    coverUrl={order.product.coverUrl}
                    lessonCount={order.product._count.lessons}
                    completedLessons={progress?.completed ?? 0}
                    purchasedAt={order.createdAt}
                    href={`/it/${order.product.slug}/portal`}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Certificates */}
        <CertificatesShowcase certificates={completedProductIds} />
      </main>
      <PWAInstallBanner />
      <MobileBottomNav unreadCount={unreadMessages} />
    </div>
  );
}
