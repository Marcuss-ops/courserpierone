import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { ArrowRight, ShoppingBag, GraduationCap } from "lucide-react";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { AccessGate } from "@/components/course/access-gate";
import { getServerUser } from "@/lib/supabase/get-user";
import { loadLocaleContentCached } from "@/lib/i18n/load-locale-content";
import { getDmContext } from "@/lib/messaging/get-dm-context";
import { findOrCreateConversation } from "@/lib/messaging/find-or-create-conversation";
import { prisma } from "@/lib/db/prisma";
import { UserNav } from "@/components/user-nav";
import { ChatView } from "@/components/chat/chat-view";
import { CourseCard } from "@/components/dashboard/course-card";

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

  const course = await getCourseConfig(domain);
  if (!course) return {};

  const lang = locale.split("-")[0]?.toLowerCase() ?? "en";
  const content = course.languages[locale] ?? course.languages[lang] ?? course.languages[course.defaultLanguage];
  if (!content) return {};

  const seo = content.seo;
  const title = seo?.title || `Area Studente — ${content.title}`;
  const description = seo?.description || "Accedi al tuo corso, guarda le video lezioni e leggi l'eBook.";
  const ogImage = `${baseUrl}/api/og?title=${encodeURIComponent(content.title)}&author=${encodeURIComponent(course.author || "")}&accent=${encodeURIComponent(course.accentColor || "#C9840D")}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}/${domain}/portal`,
      type: "website",
      siteName: "Courssy",
      locale: locale.replace("-", "_"),
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    alternates: {
      canonical: `${baseUrl}/${locale}/${domain}/portal`,
    },
  };
}

export default async function ProductPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; domain: string }>;
  searchParams: Promise<{ lang?: string; onboarded?: string; order_id?: string; orderId?: string }>;
}) {
  const { domain, locale } = await params;
  const { lang: queryLang, onboarded, order_id, orderId } = await searchParams;

  const course = await getCourseConfig(domain);
  if (!course) return notFound();

  const { user, dbUser } = await getServerUser();
  const isAuthenticated = !!user?.email;
  const isAdminViewer = dbUser?.role === "admin";

  // ── DM context (creator + product): single source of truth helper ──
  // Skip query for admin viewers (they shouldn't auto-create DMs with themselves)
  // and for unauthenticated visitors (AccessGate will render the purchase prompt).
  const { creator, product } = await getDmContext(
    domain,
    isAuthenticated && !isAdminViewer,
  );

  const currentLang = queryLang || course.defaultLanguage || "en";
  const content = course.languages[currentLang] || course.languages[course.defaultLanguage];

  // Load locale content for translations (cached via Redis). Missing keys
  // for non-IT/EN locales fall back gracefully via inline defaults below.
  const localeContent = await loadLocaleContentCached(domain, currentLang);
  const lc = localeContent.portal;
  // normalizedLang = 2-letter code (es. "en", "it") per i18n route + components.
  const lang = currentLang.split("-")[0]?.toLowerCase() ?? "en";

  const activeOrderId = order_id || orderId;
  const portalQs = new URLSearchParams();
  portalQs.set("lang", currentLang);
  if (onboarded) portalQs.set("onboarded", onboarded);
  if (activeOrderId) portalQs.set("order_id", activeOrderId);

  // ════════════════════════════════════════════════════════════════════════
  // SKOOL-MIMIC REDESIGN — DATA FETCHING (server-side, parallel)
  // ════════════════════════════════════════════════════════════════════════
  //   1. OWNED LIBRARY — orders (admin: virtual "all published" set)
  //   2. BROWSE CATALOG — published products NOT in the owned set
  //   3. CHAT CONTEXT — findOrCreateConversation for the chat panel
  //   4. PROGRESS — aggregate completedLessons per product (zero-redundancy)
  // ════════════════════════════════════════════════════════════════════════
  interface OwnedRow {
    orderId: string;
    productId: string;
    slug: string;
    coverUrl: string | null;
    defaultLanguage: string;
    lessonsCount: number;
    purchasedAt: Date;
    completedLessons: number;
  }
  interface BrowseRow {
    productId: string;
    slug: string;
    coverUrl: string | null;
    defaultLanguage: string;
    lessonsCount: number;
  }

  let owned: OwnedRow[] = [];
  let browse: BrowseRow[] = [];
  let conversationId: string | null = null;
  const targetUserId = dbUser?.id ?? null;

  if (targetUserId) {
    // Admin-viewer: see every published product as a "virtual order".
    // Mirrors /dashboard logic to keep the library consistent across pages.
    const ownedCandidates = isAdminViewer
      ? prisma.product.findMany({
          where: { status: "published" },
          select: {
            id: true,
            slug: true,
            coverUrl: true,
            defaultLanguage: true,
            _count: { select: { lessons: true } },
          },
        })
      : prisma.order.findMany({
          where: { userId: targetUserId, status: "completed" },
          include: {
            product: {
              select: {
                id: true,
                slug: true,
                coverUrl: true,
                defaultLanguage: true,
                _count: { select: { lessons: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });

    // Chat conversation: auto-upsert (idempotent) — needed so the right-rail
    // ChatView can mount with a non-null conversationId on first visit.
    const chatPromise = creator && product && !isAdminViewer
      ? findOrCreateConversation(targetUserId, creator.id, product.id)
          .then((c) => c.id)
          .catch(() => null)
      : Promise.resolve(null);

    // Browse catalog candidate query: independent from ownedCandidates
    // (published products are just being queried, no overlap with owned set).
    // Hoisted into the first Promise.all to eliminate an extra round-trip
    // with Supavisor free tier (~50-100ms cold start saving).
    const allPublishedPromise = prisma.product.findMany({
      where: { status: "published" },
      select: {
        id: true,
        slug: true,
        coverUrl: true,
        defaultLanguage: true,
        _count: { select: { lessons: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const [candidatesRaw, chatId, allPublished] = await Promise.all([
      ownedCandidates,
      chatPromise,
      allPublishedPromise,
    ]);
    conversationId = chatId;

    // ── Owned library shape ──
    const ownedProductIds = isAdminViewer
      ? new Set((candidatesRaw as { id: string }[]).map((p) => p.id))
      : new Set(
          (candidatesRaw as { product: { id: string } }[]).map((o) => o.product.id),
        );

    // ── Browse catalog = published products NOT in owned set ──
    // One query for "all published" (small set), filter in-memory to
    // avoid a complex NOT-IN subquery on the (admin) virtual path.
    browse = allPublished
      .filter((p) => !ownedProductIds.has(p.id))
      .map<BrowseRow>((p) => ({
        productId: p.id,
        slug: p.slug,
        coverUrl: p.coverUrl,
        defaultLanguage: p.defaultLanguage,
        lessonsCount: p._count.lessons,
      }));

    // ── Per-product completedLessons (only for non-admin viewers) ──
    if (isAdminViewer) {
      owned = (candidatesRaw as {
        id: string;
        slug: string;
        coverUrl: string | null;
        defaultLanguage: string;
        _count: { lessons: number };
      }[]).map<OwnedRow>((p) => ({
        orderId: `admin-virtual-${p.id}`,
        productId: p.id,
        slug: p.slug,
        coverUrl: p.coverUrl,
        defaultLanguage: p.defaultLanguage,
        lessonsCount: p._count.lessons,
        purchasedAt: new Date(),
        completedLessons: 0,
      }));
    } else {
      const orderRows = candidatesRaw as {
        id: string;
        createdAt: Date;
        product: {
          id: string;
          slug: string;
          coverUrl: string | null;
          defaultLanguage: string;
          _count: { lessons: number };
        };
      }[];
      const productIds = orderRows.map((o) => o.product.id);
      const lessons =
        productIds.length > 0
          ? await prisma.lesson.findMany({
              where: { productId: { in: productIds } },
              select: { id: true, productId: true },
            })
          : [];
      const lessonIds = lessons.map((l) => l.id);
      const completedRows =
        lessonIds.length > 0
          ? await prisma.lessonProgress.findMany({
              where: {
                userId: targetUserId,
                lessonId: { in: lessonIds },
                completed: true,
              },
              select: { lessonId: true },
            })
          : [];

      const lessonToProduct = new Map(lessons.map((l) => [l.id, l.productId]));
      const completedByProduct = new Map<string, number>();
      for (const row of completedRows) {
        const pid = lessonToProduct.get(row.lessonId);
        if (pid) {
          completedByProduct.set(pid, (completedByProduct.get(pid) ?? 0) + 1);
        }
      }

      owned = orderRows.map<OwnedRow>((o) => ({
        orderId: o.id,
        productId: o.product.id,
        slug: o.product.slug,
        coverUrl: o.product.coverUrl,
        defaultLanguage: o.product.defaultLanguage,
        lessonsCount: o.product._count.lessons,
        purchasedAt: o.createdAt,
        completedLessons: completedByProduct.get(o.product.id) ?? 0,
      }));
    }
  }

  // ── Inline i18n fallbacks for keys missing in non-IT/EN locales ──
  // (FR/DE/ES/TH/NO/DK/HI/KO haven't been translated yet; the live
  // fallback chain in loadLocaleContentCached would otherwise yield `null`.)
  const t = {
    myCoursesTitle: lc.section_my_courses_title || "I Tuoi Corsi",
    myCoursesCountOne: lc.section_my_courses_count_one || "1 corso nella tua libreria",
    myCoursesCountOther:
      (lc.section_my_courses_count_other || "{n} corsi nella tua libreria").replace(
        "{n}",
        String(owned.length),
      ),
    emptyLibrary: lc.empty_library || "Esplora il catalogo per iniziare il tuo primo percorso.",
    browseTitle: lc.section_browse_title || "Esplora il Catalogo",
    browseSubtitle:
      lc.section_browse_subtitle || "Continua il tuo percorso con altri corsi",
    emptyBrowse: lc.empty_browse || "Al momento non ci sono altri corsi disponibili.",
    chatTitle: lc.chat_title || "Chat con il Creator",
    chatOnline: "Online",
    chatOffline:
      lc.chat_offline_creator ||
      (lang === "en"
        ? "The creator is not available here. Open chat from the page button."
        : "Il creator non è ancora disponibile qui. Apri la chat dal bottone della pagina."),
    chatOfflineSelf:
      lc.chat_offline_self ||
      (lang === "en"
        ? "You're the creator of this course — chat is reserved for your students."
        : "Sei il creator di questo corso — la chat è riservata ai tuoi studenti."),
    chatNeedLogin:
      lang === "en"
        ? "Sign in to chat with the creator."
        : "Accedi per chattare con il creator.",
    footerRights: lc.footer_rights || "Tutti i diritti riservati.",
    footerBrand: lc.footer_brand || "Un progetto Courssy",
    footerPrivacy: lc.footer_privacy || "Privacy Policy",
    footerTerms: lc.footer_terms || "Termini di Servizio",
    footerRefund: lc.footer_refund || "Politica di Rimborso",
    langLabel: lc.lang_label || "Lingua",
  };

  return (
    <AccessGate
      productSlug={domain}
      courseTitle={content.title}
      callbackUrl={`/${locale}/${domain}/portal?${portalQs.toString()}`}
      orderId={activeOrderId}
    >
      <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased relative overflow-x-hidden">
        {/* Top Navigation — Skool: brand left, profile+dropdown top-right */}
        <nav className="sticky top-0 z-50 bg-cream-dark-bg/80 backdrop-blur-xl border-b border-cream-dark-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <Link
              href={`/${locale}/${domain}`}
              className="flex items-center gap-2 hover:opacity-70 transition-opacity min-w-0"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-sm shrink-0"
                style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #444 100%)" }}
                aria-hidden
              >
                C
              </div>
              <span className="font-serif italic text-[20px] sm:text-[22px] leading-none tracking-[-0.2px] text-cream-dark-text lowercase truncate">
                {course.slug}.
              </span>
            </Link>

            {/* Profile dropdown — sempre visibile in alto a destra
                come richiesto. Mostra avatar + nome + dropdown
                (Dashboard / Modifica Profilo / Sign out). */}
            {dbUser ? (
              <UserNav
                user={{
                  name: dbUser.name,
                  email: dbUser.email,
                  image: dbUser.image,
                  role: dbUser.role,
                }}
              />
            ) : isAuthenticated ? (
              <Link
                href={`/${locale}/${domain}/portal`}
                className="text-sm text-cream-dark-text-soft font-medium hover:text-cream-dark-text transition-colors"
              >
                {lang === "en" ? "Sign in" : "Accedi"}
              </Link>
            ) : null}
          </div>
        </nav>

        {/* Main: 2-column Skool layout (Courses-left flex-1 + Chat right-rail 400px) */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-10 pb-24 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] gap-6 lg:gap-8">
          {/* ── LEFT: Courses (My Library + Browse Catalog) ─────────── */}
          <div className="space-y-10 min-w-0">
            {/* MY COURSES */}
            <section>
              <header className="flex items-end justify-between gap-4 mb-5">
                <div className="min-w-0">
                  <h2 className="font-serif text-2xl md:text-3xl text-cream-dark-text leading-tight">
                    {t.myCoursesTitle}
                  </h2>
                  <p className="text-sm text-cream-dark-text-soft font-light mt-1">
                    {owned.length === 0
                      ? t.emptyLibrary
                      : owned.length === 1
                        ? t.myCoursesCountOne
                        : t.myCoursesCountOther}
                  </p>
                </div>
                {owned.length > 0 && dbUser && !isAdminViewer && (
                  <Link
                    href={`/${lang}/dashboard`}
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-cream-dark-gold hover:gap-2.5 transition-all shrink-0"
                  >
                    {lang === "en" ? "Open Dashboard" : "Apri Dashboard"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </header>

              {owned.length === 0 ? (
                <div className="bg-cream-dark-surface border border-cream-dark-border rounded-3xl p-10 lg:p-12 text-center space-y-4 shadow-md shadow-black/20">
                  <div className="w-14 h-14 rounded-2xl bg-cream-dark-bg border border-cream-dark-border mx-auto flex items-center justify-center">
                    <GraduationCap className="w-7 h-7 text-cream-dark-gold/70" />
                  </div>
                  <p className="text-cream-dark-text-soft font-light max-w-sm mx-auto">
                    {t.emptyLibrary}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {owned.map((o) => (
                    <CourseCard
                      key={o.orderId}
                      slug={o.slug}
                      coverUrl={o.coverUrl}
                      lessonCount={o.lessonsCount}
                      completedLessons={o.completedLessons}
                      purchasedAt={o.purchasedAt}                        href={`/${(o.defaultLanguage ?? lang).split("-")[0]}/${o.slug}/portal?lang=${currentLang}`}
                      lang={lang}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* BROWSE CATALOG — only if there are products the user doesn't own */}
            {(browse.length > 0 || isAdminViewer) && (
              <section>
                <header className="mb-5">
                  <h2 className="font-serif text-2xl md:text-3xl text-cream-dark-text leading-tight">
                    {t.browseTitle}
                  </h2>
                  <p className="text-sm text-cream-dark-text-soft font-light mt-1">
                    {t.browseSubtitle}
                  </p>
                </header>
                {browse.length === 0 ? (
                  <div className="bg-cream-dark-surface border border-cream-dark-border rounded-3xl p-10 text-center space-y-3 shadow-md shadow-black/20">
                    <ShoppingBag className="w-8 h-8 text-cream-dark-text-soft/40 mx-auto" />
                    <p className="text-cream-dark-text-soft font-light">{t.emptyBrowse}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {browse.map((b) => (
                      <CourseCard
                        key={b.productId}
                        slug={b.slug}
                        coverUrl={b.coverUrl}
                        lessonCount={b.lessonsCount}
                        completedLessons={0}
                        purchasedAt={null}
                        href={`/${(b.defaultLanguage ?? lang).split("-")[0]}/${b.slug}`}
                        lang={lang}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* ── RIGHT RAIL: Chat with creator (always-open) ───────── */}
          <aside className="lg:sticky lg:top-24 lg:self-start h-[600px] lg:h-[calc(100vh-7rem)] min-w-0">
            <div className="bg-cream-dark-surface border border-cream-dark-border rounded-3xl shadow-2xl shadow-black/30 h-full overflow-hidden flex flex-col">
              {/* Chat header — Skool style: avatar + creator name + green online dot */}
              <header className="px-5 py-4 border-b border-cream-dark-border flex items-center gap-3 shrink-0">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden border border-cream-dark-border">
                    {creator?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={creator.image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-bold text-cream-dark-gold text-base">
                        {(creator?.name ?? "C")[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-cream-dark-surface"
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-cream-dark-text truncate">
                    {creator?.name ?? t.chatTitle}
                  </p>
                  <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {conversationId ? t.chatOnline : (lang === "en" ? "Connecting…" : "Connessione…")}
                  </p>
                </div>
              </header>

              {/* Body: ChatView when conversationId is resolved; otherwise an offline hint
                  coerente con "chat con il creator già aperta" (mai blank quando possibile). */}
              {conversationId && creator && dbUser && product ? (
                <ChatView
                  conversationId={conversationId}
                  productId={product.id}
                  currentUserId={dbUser.id}
                  currentUserName={dbUser.name ?? dbUser.email}
                  otherUser={{
                    id: creator.id,
                    name: creator.name,
                    image: creator.image,
                    role: creator.role,
                  }}
                />
              ) : isAdminViewer ? (
                <ChatOfflineHint message={t.chatOfflineSelf} />
              ) : !isAuthenticated ? (
                <ChatOfflineHint message={t.chatNeedLogin} />
              ) : (
                <ChatOfflineHint message={t.chatOffline} />
              )}
            </div>
          </aside>
        </main>

        {/* Footer — minimal, brand + legal anchors */}
        <footer className="border-t border-cream-dark-border bg-cream-dark-bg/40 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <p className="text-xs text-cream-dark-text-soft font-light">
              © 2026 Courssy · {t.footerBrand} · {t.footerRights}
            </p>
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-cream-dark-text-soft">
              <Link href="/privacy" className="hover:text-cream-dark-gold transition-colors">
                {t.footerPrivacy}
              </Link>
              <span className="text-cream-dark-text-soft/40">·</span>
              <Link href="/terms" className="hover:text-cream-dark-gold transition-colors">
                {t.footerTerms}
              </Link>
              <span className="text-cream-dark-text-soft/40">·</span>
              <Link href="/refund" className="hover:text-cream-dark-gold transition-colors">
                {t.footerRefund}
              </Link>
              <span className="text-cream-dark-text-soft/40">·</span>
              <span>
                {t.langLabel}: <span className="font-semibold text-cream-dark-text">{lang.toUpperCase()}</span>
              </span>
            </nav>
          </div>
        </footer>
      </div>
    </AccessGate>
  );
}

/**
 * ChatOfflineHint — inline sub-component used when `<ChatView>` cannot
 * mount (admin viewer / unauthenticated / no creator present). Renders a
 * soft empty state inside the same right-rail container so the layout
 * doesn't collapse.
 */
function ChatOfflineHint({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-10 text-center">
      <div className="space-y-2 max-w-[260px]">
        <p className="text-sm text-cream-dark-text-soft font-light leading-relaxed">
          {message}
        </p>
      </div>
    </div>
  );
}
