import { headers } from "next/headers";
import Image from "next/image";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import {
  FileText,
  Link as LinkIcon,
  FileDown,
  Play,
  Pin,
  Rss,
} from "lucide-react";
import { getCourseConfig } from "@/lib/config/white-label-data";
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
 * Community tab — Skool-style scrollable feed of creator-posted resources.
 *
 * (2026-07-15) Replaces the previous student-leaderboard view. The user
 * wanted a feed of resources the creator has posted, not a list of
 * enrolled students. Read-only MVP — admin CRUD UI is deferred to a
 * followup (today: seed via `npx tsx scripts/seed-community-posts.ts`).
 *
 * Post types: "note" | "link" | "pdf" | "video". The `type` field is
 * validated application-side in src/lib/community/post-types.ts (not yet
 * extracted — duplicated here inline for the MVP).
 *
 * Sort order: pinned posts first (newest pinned), then all others by
 * createdAt DESC. This matches the canonical compound index on
 * (productId, pinned, createdAt).
 */
export default async function CommunityTab({
  params,
}: {
  params: Promise<{ locale: string; domain: string }>;
}) {
  const { locale, domain } = await params;

  const course = await getCourseConfig(domain);
  if (!course) return notFound();

  const lang2 = locale.split("-")[0]?.toLowerCase() ?? "en";
  const lc = (await loadLocaleContentCached(domain, lang2)).portal;

  const t = {
    title:
      lc.tab_community_feed_title ??
      lc.tab_community_title ??
      (lang2 === "it" ? "Community del Corso" : "Course Community"),
    subtitle:
      lc.tab_community_feed_subtitle ??
      lc.tab_community_subtitle ??
      (lang2 === "it"
        ? "Risorse e aggiornamenti pubblicati dal creator."
        : "Resources and updates posted by the creator."),
    countOne:
      lc.tab_community_feed_count_one ??
      (lang2 === "it" ? "1 risorsa pubblicata" : "1 resource posted"),
    countOther:
      lc.tab_community_feed_count_other ??
      (lang2 === "it" ? "risorse pubblicate" : "resources posted"),
    emptyTitle:
      lc.tab_community_feed_empty_title ??
      (lang2 === "it" ? "Nessuna risorsa ancora" : "No resources yet"),
    emptyDesc:
      lc.tab_community_feed_empty_desc ??
      (lang2 === "it"
        ? "Il creator non ha ancora pubblicato risorse. Torna a trovarci!"
        : "The creator hasn't posted any resources yet. Check back soon!"),
    pinnedBadge:
      lc.tab_community_feed_pinned_badge ??
      (lang2 === "it" ? "In evidenza" : "Pinned"),
    typeNote: lc.tab_community_feed_type_note ?? (lang2 === "it" ? "Nota" : "Note"),
    typeLink: lc.tab_community_feed_type_link ?? (lang2 === "it" ? "Link" : "Link"),
    typePdf: lc.tab_community_feed_type_pdf ?? "PDF",
    typeVideo: lc.tab_community_feed_type_video ?? (lang2 === "it" ? "Video" : "Video"),
    ctaLink: lc.tab_community_feed_cta_link ?? (lang2 === "it" ? "Apri link" : "Open link"),
    ctaPdf: lc.tab_community_feed_cta_pdf ?? (lang2 === "it" ? "Scarica PDF" : "Download PDF"),
    ctaVideo: lc.tab_community_feed_cta_video ?? (lang2 === "it" ? "Guarda video" : "Watch video"),
  };

  // Resolve productId from slug
  const product = await prisma.product.findUnique({
    where: { slug: domain },
    select: { id: true },
  });
  if (!product) return notFound();

  // Fetch the feed: pinned first, then by createdAt DESC.
  // The compound index (productId, pinned, createdAt) makes this efficient.
  const posts = await prisma.communityPost.findMany({
    where: { productId: product.id },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: {
      author: {
        select: { id: true, name: true, email: true, image: true, role: true },
      },
    },
  });

  const accent = course.accentColor ?? "#C9840D";
  const totalPosts = posts.length;

  // Type icon + label resolver (inline MVP — will move to a shared helper
  // when admin CRUD UI lands and we need the same mapping in 2+ places).
  const typeMeta = (
    type: string,
  ): {
    label: string;
    icon: typeof FileText;
    cta: string | null;
  } => {
    switch (type) {
      case "link":
        return { label: t.typeLink, icon: LinkIcon, cta: t.ctaLink };
      case "pdf":
        return { label: t.typePdf, icon: FileDown, cta: t.ctaPdf };
      case "video":
        return { label: t.typeVideo, icon: Play, cta: t.ctaVideo };
      case "note":
      default:
        return { label: t.typeNote, icon: FileText, cta: null };
    }
  };

  // Relative time formatter (it/en only for MVP; falls back to en-US).
  // `nowMs` is captured once at the top of the render so `Date.now()` is
  // not called inside the loop. Safe in this Server Component — the rule
  // `react-hooks/purity` targets Client Components (where `Date.now()`
  // during render can cause hydration mismatches); here we're on the
  // server, rendering once per request, so the value is deterministic
  // for the lifetime of the response.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const relTime = (date: Date) => {
    const diffMs = nowMs - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    if (diffMin < 1) return lang2 === "it" ? "proprio ora" : "just now";
    if (diffMin < 60)
      return lang2 === "it" ? `${diffMin} min fa` : `${diffMin}m ago`;
    if (diffHour < 24)
      return lang2 === "it" ? `${diffHour} ore fa` : `${diffHour}h ago`;
    if (diffDay < 7)
      return lang2 === "it" ? `${diffDay}g fa` : `${diffDay}d ago`;
    return new Intl.DateTimeFormat(
      lang2 === "it" ? "it-IT" : "en-US",
      { day: "numeric", month: "short", year: "numeric" },
    ).format(date);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cream-dark-gold/15 border border-cream-dark-gold/30 text-cream-dark-gold text-[10px] font-black uppercase tracking-widest">
          <Rss className="w-3 h-3" />
          {lang2 === "it" ? "Feed della Community" : "Community Feed"}
        </div>
        <h1 className="font-serif text-3xl md:text-5xl text-cream-dark-text leading-tight tracking-tight">
          {t.title}
        </h1>
        <p className="text-cream-dark-text-soft font-light leading-relaxed max-w-3xl">
          {t.subtitle}
        </p>
        {totalPosts > 0 && (
          <p className="text-xs text-cream-dark-text-soft font-medium pt-1">
            <strong className="text-cream-dark-text">{totalPosts}</strong>{" "}
            {totalPosts === 1 ? t.countOne : t.countOther}
          </p>
        )}
      </header>

      {/* Feed */}
      {totalPosts === 0 ? (
        <section className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-12 text-center space-y-2">
          <Rss className="w-10 h-10 text-cream-dark-text-soft/40 mx-auto" />
          <p className="text-cream-dark-text font-bold">{t.emptyTitle}</p>
          <p className="text-cream-dark-text-soft text-sm font-light max-w-md mx-auto">
            {t.emptyDesc}
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          {posts.map((p) => {
            const meta = typeMeta(p.type);
            const Icon = meta.icon;
            const authorName =
              p.author.name ?? p.author.email?.split("@")[0] ?? "Creator";
            const authorInit =
              authorName
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? "")
                .join("") || authorName[0]?.toUpperCase() || "?";
            return (
              <article
                key={p.id}
                className={[
                  "rounded-2xl p-5 sm:p-6 shadow-md shadow-black/20 transition-colors",
                  p.pinned
                    ? "bg-cream-dark-gold/8 border-2 border-cream-dark-gold/35"
                    : "bg-cream-dark-surface border border-cream-dark-border",
                ].join(" ")}
              >
                {/* Author + meta row */}
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="shrink-0 w-11 h-11 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm"
                    style={{
                      backgroundImage: p.author.image
                        ? `url(${p.author.image})`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundColor: !p.author.image
                        ? `${accent}25`
                        : undefined,
                      color: !p.author.image ? accent : undefined,
                      border: `1px solid ${accent}30`,
                    }}
                  >
                    {p.author.image ? (
                      <Image
                        src={p.author.image}
                        alt=""
                        width={44}
                        height={44}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      authorInit
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-serif text-cream-dark-text text-sm font-bold truncate">
                        {authorName}
                      </p>
                      {p.author.role === "admin" && (
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-cream-dark-gold/20 text-cream-dark-gold border border-cream-dark-gold/30">
                          {lang2 === "it" ? "Creator" : "Creator"}
                        </span>
                      )}
                      <span
                        className="text-[10px] text-cream-dark-text-soft/70 font-light"
                        title={p.createdAt.toISOString()}
                      >
                        · {relTime(p.createdAt)}
                      </span>
                    </div>
                    {/* Type + pinned badges */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {p.pinned && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cream-dark-gold/20 border border-cream-dark-gold/30 text-cream-dark-gold text-[9px] font-black uppercase tracking-wider">
                          <Pin className="w-2.5 h-2.5" />
                          {t.pinnedBadge}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider"
                        style={{
                          backgroundColor: `${accent}15`,
                          color: accent,
                          border: `1px solid ${accent}30`,
                        }}
                      >
                        <Icon className="w-2.5 h-2.5" />
                        {meta.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Title + body */}
                <h3 className="font-serif text-lg sm:text-xl text-cream-dark-text font-bold leading-snug">
                  {p.title}
                </h3>
                {p.body && (
                  <p className="text-sm text-cream-dark-text-soft font-light mt-2 leading-relaxed whitespace-pre-line">
                    {p.body}
                  </p>
                )}

                {/* CTA — for link/pdf/video types */}
                {meta.cta && p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
                    style={{
                      backgroundColor: accent,
                      color: "#0a0a0a",
                      boxShadow: `0 4px 16px ${accent}40`,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {meta.cta}
                  </a>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
