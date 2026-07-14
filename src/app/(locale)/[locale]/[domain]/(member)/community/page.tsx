import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { Users, Award, TrendingUp } from "lucide-react";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { getServerUser } from "@/lib/supabase/get-user";
import { loadLocaleContentCached } from "@/lib/i18n/load-locale-content";
import { prisma } from "@/lib/db/prisma";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; domain: string }>;
}): Promise<Metadata> {
  const { locale, domain } = await params;
  let host = "www.courssy.com";
  try {
    const h = await headers();
    host = h.get("host") ?? host;
  } catch {}
  const scheme = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = `${scheme}://${host}`;
  const title = `Community — ${domain}`;
  return {
    title,
    alternates: { canonical: `${baseUrl}/${locale}/${domain}/community` },
  };
}

/**
 * Community tab — Skool-mimic leaderboard-style grid.
 *
 * MVP scope:
 * - Anonymized student names (use first name initial or first token).
 * - Progress bar per student (% lessons completed).
 * - "Joined X days ago" relative timestamp.
 *
 * Out of scope V1:
 * - Posts/comments (Skool has them; we don't because the course is a
 *   digital info-product and chat-with-creator handles Q&A).
 * - Real-time presence.
 * - Public profiles (privacy).
 */
export default async function CommunityTab({
  params,
}: {
  params: Promise<{ locale: string; domain: string }>;
}) {
  const { locale, domain } = await params;

  const course = await getCourseConfig(domain);
  if (!course) return notFound();

  const { dbUser } = await getServerUser();
  const isAdminViewer = dbUser?.role === "admin";
  const lang2 = locale.split("-")[0]?.toLowerCase() ?? "en";
  const lc = (await loadLocaleContentCached(domain, lang2)).portal;

  const t = {
    title:
      lc.tab_community_title ||
      (lang2 === "it" ? "Community del Corso" : "Course Community"),
    subtitle:
      lc.tab_community_subtitle ||
      (lang2 === "it"
        ? "Studenti che stanno seguendo questo corso insieme a te."
        : "Students following this course alongside you."),
    totalLabel: (lang2 === "it" ? "studenti iscritti" : "students enrolled"),
    progressAvg:
      lang2 === "it" ? "Media completamento" : "Average progress",
    topLabel: (lang2 === "it" ? "Top performer" : "Top performer"),
    yourBadge: (lang2 === "it" ? "Sei qui" : "You"),
    joined: (lang2 === "it" ? "Iscritto" : "Joined"),
    completedLessons:
      lang2 === "it" ? "Lezioni completate" : "Completed lessons",
    emptyTitle:
      lc.tab_community_empty_title ||
      (lang2 === "it" ? "Nessuno ancora" : "No one yet"),
    emptyDesc:
      lc.tab_community_empty_desc ||
      (lang2 === "it"
        ? "Sii il primo a iscriverti: condividi questo corso dalla pagina /about."
        : "Be the first. Share this course from the /about page."),
  };

  // Resolve productId from slug
  const product = await prisma.product.findUnique({
    where: { slug: domain },
    select: { id: true },
  });
  if (!product) return notFound();

  // Total lessons (for denominator)
  const lessonRows = await prisma.lesson.findMany({
    where: { productId: product.id },
    select: { id: true },
  });
  const totalLessons = lessonRows.length;

  // Fellow students: all users with completed orders, recent first, capped.
  const orders = await prisma.order.findMany({
    where: {
      productId: product.id,
      status: "completed",
    },
    select: {
      userId: true,
      createdAt: true,
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  // Aggregate each user's completed lessons for this product
  const lessonIds = lessonRows.map((l) => l.id);
  const userIds = orders.map((o) => o.userId);
  const progressByUser = new Map<string, number>();
  if (lessonIds.length > 0 && userIds.length > 0) {
    const progress = await prisma.lessonProgress.findMany({
      where: {
        userId: { in: userIds },
        lessonId: { in: lessonIds },
        completed: true,
      },
      select: { userId: true },
    });
    for (const row of progress) {
      progressByUser.set(
        row.userId,
        (progressByUser.get(row.userId) ?? 0) + 1,
      );
    }
  }

  // Order: current user pinned at top (so they can see "you are here"),
  // then everyone else by progress desc.
  const selfId = dbUser?.id ?? null;
  type Mate = {
    userId: string;
    name: string;
    image: string | null;
    joinedAt: Date;
    completed: number;
  };
  const mates: Mate[] = orders.map((o) => ({
    userId: o.userId,
    name: o.user.name ?? o.user.email?.split("@")[0] ?? "Studente",
    image: o.user.image ?? null,
    joinedAt: o.createdAt,
    completed: progressByUser.get(o.userId) ?? 0,
  }));

  const sorted = [
    ...(selfId
      ? mates.filter((m) => m.userId === selfId)
      : []),
    ...mates
      .filter((m) => m.userId !== selfId)
      .sort((a, b) => b.completed - a.completed || b.joinedAt.getTime() - a.joinedAt.getTime()),
  ];

  // Stats
  const totalMates = orders.length;
  const avgProgress =
    totalMates > 0
      ? Math.round(
          (mates.reduce((s, m) => s + m.completed, 0) /
            Math.max(totalMates * totalLessons, 1)) *
            100,
        )
      : 0;
  const topMates = [...mates]
    .filter((m) => m.userId !== selfId)
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 3);
  const accent = course.accentColor ?? "#C9840D";

  const localeDateFormatter = (date: Date) =>
    new Intl.DateTimeFormat(
      lang2 === "it" ? "it-IT" : lang2 === "fr" ? "fr-FR" : lang2 === "de" ? "de-DE" : "en-US",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    ).format(date);

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cream-dark-gold/15 border border-cream-dark-gold/30 text-cream-dark-gold text-[10px] font-black uppercase tracking-widest">
          <Users className="w-3 h-3" />
          {t.totalLabel}: <strong>{totalMates}</strong>
        </div>
        <h1 className="font-serif text-3xl md:text-5xl text-cream-dark-text leading-tight tracking-tight">
          {t.title}
        </h1>
        <p className="text-cream-dark-text-soft font-light leading-relaxed max-w-3xl">
          {t.subtitle}
        </p>
        {totalMates >= 1 && (
          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-cream-dark-text-soft">
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              {t.progressAvg}: <strong className="text-cream-dark-text">{avgProgress}%</strong>
            </span>
          </div>
        )}
      </header>

      {/* Top 3 performers — for empty states with very low data, skip */}
      {topMates.length > 0 && topMates[0].completed > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-serif text-sm uppercase tracking-widest text-cream-dark-text-soft font-black">
            <Award className="w-4 h-4" style={{ color: accent }} />
            {t.topLabel}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topMates.map((m, idx) => (
              <div
                key={m.userId}
                className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-4 shadow-md shadow-black/20 relative overflow-hidden"
              >
                <span
                  className="absolute top-2 right-2 text-xs font-black w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: idx === 0 ? accent : `${accent}30`,
                    color: idx === 0 ? "#000" : accent,
                  }}
                >
                  #{idx + 1}
                </span>
                <p className="font-serif text-cream-dark-text text-sm font-bold truncate">
                  {m.name}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-cream-dark-bg rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: accent,
                        width: `${totalLessons > 0 ? (m.completed / totalLessons) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-cream-dark-text-soft">
                    {m.completed}/{totalLessons}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Full grid */}
      {sorted.length > 0 ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((m) => {
            const isSelf = m.userId === selfId;
            const init = m.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || m.name[0]?.toUpperCase() || "?";
            return (
              <div
                key={m.userId}
                className={[
                  "rounded-2xl p-4 flex items-center gap-3 shadow-md shadow-black/20",
                  isSelf
                    ? "bg-cream-dark-gold/10 border-2 border-cream-dark-gold/40"
                    : "bg-cream-dark-surface border border-cream-dark-border",
                ].join(" ")}
              >
                <div
                  className="shrink-0 w-12 h-12 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm"
                  style={{
                    backgroundImage: m.image ? `url(${m.image})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundColor: !m.image ? `${accent}25` : undefined,
                    color: !m.image ? accent : undefined,
                    border: `1px solid ${accent}30`,
                  }}
                >
                  {!m.image && init}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-cream-dark-text text-sm font-bold flex items-center gap-2 truncate">
                    {m.name}
                    {isSelf && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-cream-dark-gold text-cream-dark-bg">
                        {t.yourBadge}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1.5 bg-cream-dark-bg rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: accent,
                          width: `${totalLessons > 0 ? (m.completed / totalLessons) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-cream-dark-text-soft shrink-0">
                      {m.completed}/{totalLessons}
                    </span>
                  </div>
                  <p className="text-[10px] text-cream-dark-text-soft font-light mt-1">
                    {t.joined}: {localeDateFormatter(m.joinedAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-12 text-center space-y-2">
          <Users className="w-10 h-10 text-cream-dark-text-soft/40 mx-auto" />
          <p className="text-cream-dark-text font-bold">{t.emptyTitle}</p>
          <p className="text-cream-dark-text-soft text-sm font-light max-w-md mx-auto">
            {t.emptyDesc}
          </p>
          <Link
            href={`/${locale}/${domain}/about`}
            className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-cream-dark-gold/20 border border-cream-dark-gold/30 rounded-xl text-cream-dark-gold text-xs font-bold hover:bg-cream-dark-gold/30 transition"
          >
            {lang2 === "it" ? "Scopri di più →" : "Learn more →"}
          </Link>
        </section>
      )}
    </div>
  );
}
