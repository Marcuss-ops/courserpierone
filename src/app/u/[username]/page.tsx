import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  Globe,
  Play,
  BookOpen,
  Award,
  Calendar,
  Clock,
  ChevronRight,
  MessageSquare,
  Share2,
  CheckCircle,
} from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { ShareProfileButton } from "./share-button";
import { MessageProfileButton } from "./message-button";

// ─── Social icon SVGs (inline per evitare dipendenze) ─────────
const SocialIcons: Record<string, React.ReactNode> = {
  twitter: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  website: <Globe className="w-4 h-4" />,
};

// ─── Metadata ──────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: { name: true, bio: true, image: true },
  });
  if (!user) return { title: "Profilo non trovato" };

  return {
    title: `${user.name || username} — Profilo`,
    description: user.bio?.slice(0, 160) ?? `Profilo pubblico di ${user.name || username}`,
    openGraph: {
      title: `${user.name || username}`,
      description: user.bio?.slice(0, 160) ?? "",
      type: "profile",
      images: user.image ? [{ url: user.image }] : [],
    },
  };
}

// ─── Relative time helper ─────────────────────────────────
function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Adesso";
  if (diffMins < 60) return `${diffMins} min fa`;
  if (diffHours < 24) return `${diffHours} ore fa`;
  if (diffDays < 30) return `${diffDays} giorni fa`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} mesi fa`;
  return `${Math.floor(diffDays / 365)} anni fa`;
}

// ─── Page Component ────────────────────────────────────────
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const [profileUser, auth] = await Promise.all([
    prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        name: true,
        image: true,
        bio: true,
        socialLinks: true,
        coverImageUrl: true,
        role: true,
        lastSeenAt: true,
        createdAt: true,
        orders: {
          where: { status: "completed" },
          select: {
            product: {
              select: {
                id: true,
                slug: true,
                coverUrl: true,
                _count: { select: { lessons: true } },
              },
            },
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getServerUser(),
  ]);

  if (!profileUser) return notFound();

  const currentUserId = auth?.dbUser?.id ?? null;
  const isOwnProfile = currentUserId === profileUser.id;

  // Parse social links
  let socialLinks: Record<string, string> | null = null;
  if (profileUser.socialLinks) {
    try {
      socialLinks = JSON.parse(profileUser.socialLinks);
    } catch {
      socialLinks = null;
    }
  }

  // ── Online status ─────────────────────────────────────
  const ONLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  const isOnline =
    profileUser.lastSeenAt != null &&
    Date.now() - profileUser.lastSeenAt.getTime() < ONLINE_THRESHOLD;

  // ── Course progress ──────────────────────────────────
  const productIds = profileUser.orders.map((o) => o.product.id);
  const allLessons =
    productIds.length > 0
      ? await prisma.lesson.findMany({
          where: { productId: { in: productIds } },
          select: { id: true, productId: true },
        })
      : [];
  const allLessonIds = allLessons.map((l) => l.id);
  const lessonProductMap = new Map(allLessons.map((l) => [l.id, l.productId]));

  const completedProgress =
    allLessonIds.length > 0
      ? await prisma.lessonProgress.findMany({
          where: { userId: profileUser.id, lessonId: { in: allLessonIds }, completed: true },
          select: { lessonId: true },
        })
      : [];

  const completedByProduct = new Map<string, number>();
  for (const p of completedProgress) {
    const pid = lessonProductMap.get(p.lessonId);
    if (pid) completedByProduct.set(pid, (completedByProduct.get(pid) ?? 0) + 1);
  }
  const totalByProduct = new Map<string, number>();
  for (const l of allLessons) {
    totalByProduct.set(l.productId, (totalByProduct.get(l.productId) ?? 0) + 1);
  }

  const courses = profileUser.orders
    .map((o) => {
      const total = totalByProduct.get(o.product.id) ?? 0;
      const completed = completedByProduct.get(o.product.id) ?? 0;
      return {
        productId: o.product.id,
        slug: o.product.slug,
        coverUrl: o.product.coverUrl,
        lessonCount: total,
        completedLessons: completed,
        isCompleted: total > 0 && completed >= total,
        progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    })
    .filter((c) => c.lessonCount > 0);

  const certificates = courses.filter((c) => c.isCompleted);
  const totalCompletedLessons = completedProgress.length;
  const totalLessons = allLessonIds.length;

  // ── Recent activity ──────────────────────────────────
  const recentActivity = await prisma.lessonProgress.findMany({
    where: { userId: profileUser.id, lastWatchedAt: { not: null } },
    orderBy: { lastWatchedAt: "desc" },
    take: 8,
    select: {
      lastWatchedAt: true,
      lesson: {
        select: {
          id: true,
          position: true,
          product: { select: { slug: true } },
          translations: {
            take: 1,
            orderBy: { id: "desc" },
            select: { title: true },
          },
        },
      },
    },
  });

  const displayName = profileUser.name || profileUser.username || "Utente";
  const hasSocialLinks = socialLinks && Object.keys(socialLinks).length > 0;

  // Bio paragraphs for formatted display
  const bioParagraphs = profileUser.bio
    ? profileUser.bio.split(/\n+/).filter((p) => p.trim().length > 0)
    : [];

  return (
    <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased">
      {/* Warm glow overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255, 140, 66, 0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(255, 200, 130, 0.04) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      {/* Top nav */}
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

          <div className="flex items-center gap-2">
            {currentUserId ? (
              <Link
                href="/dashboard"
                className="px-5 py-2.5 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-xs font-semibold text-cream-dark-gold hover:bg-cream-dark-gold/10 transition-all"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-5 py-2.5 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-xs font-semibold text-cream-dark-gold hover:bg-cream-dark-gold/10 transition-all"
              >
                Accedi
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Hero Cover ──────────────────────────────────── */}
      <section className="relative">
        {/* Cover image */}
        <div className="w-full h-56 md:h-80 bg-gradient-to-br from-[#3A2D1E] via-[#2C2214] to-[#1A1208] relative overflow-hidden">
          {profileUser.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profileUser.coverImageUrl}
              alt=""
              className="w-full h-full object-cover opacity-60"
            />
          ) : (
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background:
                  "radial-gradient(ellipse at 30% 50%, rgba(255, 140, 66, 0.5) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(255, 200, 130, 0.3) 0%, transparent 60%)",
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-cream-dark-bg via-cream-dark-bg/60 to-transparent" />
        </div>

        {/* Avatar + Info overlaid */}
        <div className="max-w-5xl mx-auto px-6 relative -mt-24 md:-mt-28 z-10">
          <div className="flex flex-col md:flex-row md:items-end gap-5 md:gap-8">
            {/* Avatar — larger with glow */}
            <div className="relative shrink-0">
              <div
                className="w-32 h-32 md:w-40 md:h-40 rounded-3xl overflow-hidden border-4 border-cream-dark-bg shadow-2xl relative group"
                style={{ background: "linear-gradient(135deg, #FFE4C4 0%, #D4A574 100%)" }}
              >
                {profileUser.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileUser.image}
                    alt={displayName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-6xl font-bold text-cream-dark-bg/40">
                      {displayName[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                {/* Subtle glow ring on hover */}
                <div className="absolute inset-0 rounded-3xl ring-1 ring-cream-dark-gold/20 group-hover:ring-cream-dark-gold/40 transition-all pointer-events-none" />
              </div>
              {/* Role badge */}
              {profileUser.role === "admin" && (
                <div className="absolute -top-2 -right-2 w-9 h-9 rounded-full bg-cream-dark-gold flex items-center justify-center shadow-lg border-2 border-cream-dark-bg">
                  <Award className="w-4 h-4 text-cream-dark-bg" />
                </div>
              )}
              {/* Online indicator */}
              {isOnline && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 ring-2 ring-cream-dark-bg shadow-md" title="Online" />
              )}
            </div>

            {/* Name & Bio */}
            <div className="flex-1 pb-2 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-serif text-3xl md:text-5xl text-cream-dark-text tracking-tight">
                  {displayName}
                </h1>
                {profileUser.role === "admin" && (
                  <span className="px-2.5 py-0.5 bg-cream-dark-gold/15 border border-cream-dark-gold/30 rounded-full text-[10px] font-bold uppercase tracking-widest text-cream-dark-gold">
                    Creator
                  </span>
                )}
                {isOnline && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-semibold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                )}
              </div>
              <p className="text-sm text-cream-dark-text-soft font-medium">
                @{profileUser.username}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0 pb-1">
              <ShareProfileButton username={profileUser.username!} />
              {!isOwnProfile && currentUserId && (
                <MessageProfileButton
                  otherUserId={profileUser.id}
                  otherUserName={displayName}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      <main className="relative max-w-5xl mx-auto px-6 py-10 space-y-12">
        {/* ─── Bio Card ──────────────────────────────────── */}
        {bioParagraphs.length > 0 && (
          <section className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4 text-cream-dark-gold" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-cream-dark-text-soft">
                Bio
              </h2>
            </div>
            <div className="space-y-3">
              {bioParagraphs.map((paragraph, i) => (
                <p
                  key={i}
                  className="text-sm md:text-base text-cream-dark-text-soft leading-relaxed"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* ─── Social Links ───────────────────────────────── */}
        {hasSocialLinks && (
          <div className="flex flex-wrap gap-3">
            {Object.entries(socialLinks!).map(([platform, url]) => (
              <a
                key={platform}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-xs font-medium text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30 hover:-translate-y-0.5 transition-all"
              >
                <span className="text-cream-dark-gold">
                  {SocialIcons[platform] ?? <Globe className="w-4 h-4" />}
                </span>
                <span className="capitalize">{platform}</span>
              </a>
            ))}
          </div>
        )}

        {/* ─── Stats Bento ────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              icon: <BookOpen className="w-5 h-5 text-cream-dark-gold" />,
              value: profileUser.orders.length.toString(),
              label: "Corsi",
            },
            {
              icon: <Play className="w-5 h-5 text-cream-dark-gold" />,
              value: totalCompletedLessons.toString(),
              label: "Lezioni completate",
              sub: totalLessons > 0 ? `di ${totalLessons}` : undefined,
            },
            {
              icon: <Award className="w-5 h-5 text-cream-dark-gold" />,
              value: certificates.length.toString(),
              label: "Certificati",
            },
            {
              icon: <Calendar className="w-5 h-5 text-cream-dark-gold" />,
              value: new Date(profileUser.createdAt).toLocaleDateString("it-IT", {
                month: "short",
                year: "numeric",
              }),
              label: "Iscritto dal",
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-5 flex flex-col gap-2 hover:border-cream-dark-gold/20 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-cream-dark-bg border border-cream-dark-border flex items-center justify-center">
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-cream-dark-text tracking-tight">
                  {stat.value}
                </p>
                <p className="text-xs text-cream-dark-text-soft font-medium uppercase tracking-wider mt-0.5">
                  {stat.label}
                </p>
                {stat.sub && (
                  <p className="text-[10px] text-cream-dark-text-soft mt-0.5">{stat.sub}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ─── Courses Grid ───────────────────────────────── */}
        {courses.length > 0 && (
          <section className="space-y-5">
            <div>
              <h2 className="font-serif text-2xl md:text-3xl text-cream-dark-text tracking-tight">
                Corsi
              </h2>
              <p className="text-xs text-cream-dark-text-soft font-light mt-1">
                {courses.length} {courses.length === 1 ? "corso" : "corsi"} completati o in corso
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {courses.map((course) => (
                <Link
                  key={course.productId}
                  href={`/it/${course.slug}/portal`}
                  className="group flex flex-col bg-cream-dark-surface border border-cream-dark-border rounded-[20px] overflow-hidden hover:border-cream-dark-gold/30 hover:shadow-lg hover:shadow-[#FF8C42]/8 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="aspect-[3/2] bg-gradient-to-br from-[#2A2218] to-[#1A1208] relative overflow-hidden">
                    {course.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={course.coverUrl}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-80"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-cream-dark-gold/20" />
                      </div>
                    )}
                    {course.isCompleted && (
                      <div className="absolute top-3 right-3 px-2.5 py-1 bg-[#1B5E20] text-white text-[10px] font-bold rounded-full uppercase tracking-wider flex items-center gap-1 shadow-md">
                        <CheckCircle className="w-3 h-3" />
                        Completato
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-cream-dark-bg/90 backdrop-blur rounded-full">
                      <span className="text-[10px] font-semibold text-cream-dark-text">
                        {course.lessonCount} lezioni
                      </span>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <h3 className="font-serif text-lg text-cream-dark-text capitalize leading-tight group-hover:text-cream-dark-gold transition-colors">
                      {course.slug.replace(/-/g, " ")}
                    </h3>
                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-semibold">
                        <span className="text-cream-dark-text-soft">Progresso</span>
                        <span className="text-cream-dark-gold">{course.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-cream-dark-bg rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${course.progress}%`,
                            background: course.isCompleted
                              ? "linear-gradient(90deg, #2E7D32, #4CAF50)"
                              : "linear-gradient(90deg, #FF8C42, #FFB380)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ─── Certificates ───────────────────────────────── */}
        {certificates.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3A2D1E] to-[#221A10] flex items-center justify-center shadow-md border border-cream-dark-border">
                <Award className="w-5 h-5 text-cream-dark-gold" />
              </div>
              <div>
                <h2 className="font-serif text-2xl text-cream-dark-text tracking-tight">
                  Certificati
                </h2>
                <p className="text-xs text-cream-dark-text-soft font-light mt-0.5">
                  {certificates.length} {certificates.length === 1 ? "corso completato" : "corsi completati"} al 100%
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {certificates.map((cert) => (
                <Link
                  key={cert.productId}
                  href={`/api/certificate/${cert.productId}`}
                  className="group relative overflow-hidden bg-gradient-to-br from-cream-dark-surface to-cream-dark-surface border border-cream-dark-border rounded-2xl p-5 hover:border-cream-dark-gold/40 hover:shadow-lg hover:shadow-[#FF8C42]/10 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div
                    className="absolute -right-6 -top-6 w-24 h-24 rounded-full pointer-events-none"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(255, 140, 66, 0.35) 0%, transparent 70%)",
                    }}
                    aria-hidden
                  />
                  <div className="relative flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1B5E20]/20 to-[#4CAF50]/10 border border-emerald-500/20 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                      <Award className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-cream-dark-text capitalize truncate">
                        {cert.slug.replace(/-/g, " ")}
                      </h3>
                      <p className="text-[10px] text-cream-dark-text-soft font-medium uppercase tracking-wider mt-0.5">
                        Completato • {cert.lessonCount} lezioni
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-cream-dark-gold group-hover:translate-x-1 transition-transform shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ─── Recent Activity ────────────────────────────── */}
        {recentActivity.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center">
                <Clock className="w-5 h-5 text-cream-dark-text-soft" />
              </div>
              <h2 className="font-serif text-2xl text-cream-dark-text tracking-tight">
                Attività Recente
              </h2>
            </div>
            <div className="space-y-1">
              {recentActivity.map((activity, i) => (
                <Link
                  key={i}
                  href={`/it/${activity.lesson.product.slug}/curso/${activity.lesson.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 rounded-xl hover:bg-cream-dark-surface/60 transition-colors group"
                >
                  <div className="w-9 h-9 rounded-lg bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center shrink-0">
                    <Play className="w-3.5 h-3.5 text-cream-dark-gold fill-cream-dark-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-cream-dark-text truncate group-hover:text-cream-dark-gold transition-colors">
                      {activity.lesson.translations[0]?.title ??
                        `Lezione ${activity.lesson.position}`}
                    </p>
                    <p className="text-[11px] text-cream-dark-text-soft capitalize">
                      {activity.lesson.product.slug.replace(/-/g, " ")}
                    </p>
                  </div>
                  <span className="text-[11px] text-cream-dark-text-soft shrink-0">
                    {relativeTime(activity.lastWatchedAt!)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ─── Empty state ────────────────────────────────── */}
        {courses.length === 0 && recentActivity.length === 0 && (
          <div className="text-center py-20 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-cream-dark-text-soft" />
            </div>
            <p className="text-cream-dark-text-soft text-sm">
              Nessun corso ancora. Inizia oggi!
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-cream-dark-gold/15 border border-cream-dark-gold/30 rounded-xl text-sm font-semibold text-cream-dark-gold hover:bg-cream-dark-gold/20 transition-all"
            >
              Esplora il catalogo <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-cream-dark-border py-10 mt-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm text-white"
              style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #444 100%)" }}
            >
              C
            </div>
            <span className="font-serif italic text-lg text-cream-dark-text-soft">
              courssy
            </span>
          </div>
          <p className="text-xs text-cream-dark-text-soft">
            © {new Date().getFullYear()} Courssy. Tutti i diritti riservati.
          </p>
        </div>
      </footer>
    </div>
  );
}
