"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home } from "lucide-react";
import { UserNav } from "@/components/user-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SerializedNotification } from "@/lib/notifications/get-initial-notifications";

interface CourseTopNavProps {
  /** Profile info passed down from Server Component layout. Null when unauthenticated. */
  user:
    | {
        name: string | null;
        email: string;
        image: string | null;
        role: string;
      }
    | null;
  /** Course slug (e.g. "amish-secrets") + locale (e.g. "it-it"). */
  courseSlug: string;
  locale: string;
  /** Localized labels for the 3 main tabs. */
  labels: {
    course: string;
    community: string;
    chat: string;
  };
  /** Notifiche bell props attive quando l'utente è autenticato. */
  notifications?: {
    unreadCount: number;
    recent: SerializedNotification[];
  };
}

/**
 * CourseTopNav — sticky top navbar for the Skool-mimic course area.
 *
 * Behavior:
 * - 3 main tabs: `/[locale]/[slug]/` (Corso, default), `/community`, `/chat`.
 * - Auxiliary link "Info corso" → `/[locale]/[slug]/about` (the marketing landing now demoted to sub-page).
 * - Right cluster: ThemeToggle (dark/light mode) + NotificationBell + UserNav profile dropdown.
 * - Scroll-hide: nav slides up (-translate-y-full) when user scrolls DOWN past 50px,
 *   slides back down on scroll UP or near top. Pure CSS transition, no layout jank.
 *
 * Why client: scrollY listener lives on window, must run after hydration. The parent
 * `(member)/layout.tsx` is a Server Component that passes user + labels DOWN to this.
 */
export function CourseTopNav({
  user,
  courseSlug,
  locale,
  labels,
  notifications,
}: CourseTopNavProps) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [lastY, setLastY] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      // Always show near the top of the page.
      if (y < 50) {
        if (hidden) setHidden(false);
      } else if (delta > 5) {
        // Scrolling DOWN → hide.
        if (!hidden) setHidden(true);
      } else if (delta < -5) {
        // Scrolling UP → show.
        if (hidden) setHidden(false);
      }
      setLastY(y);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [lastY, hidden]);

  const basePath = `/${locale}/${courseSlug}`;
  const lang2 = locale.split("-")[0]?.toLowerCase() ?? "en";
  const homeLabel = lang2 === "it" ? "Torna alla home" : "Back to home";
  const tabClass = (active: boolean) =>
    [
      "px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0",
      active
        ? "bg-cream-dark-gold/20 text-cream-dark-gold border border-cream-dark-gold/30"
        : "text-cream-dark-text-soft hover:text-cream-dark-text hover:bg-cream-dark-surface/60 border border-transparent",
    ].join(" ");

  const isCorso =
    pathname === basePath ||
    pathname === `${basePath}/` ||
    pathname === `/${locale.split("-")[0]}/${courseSlug}` ||
    pathname === `/${locale.split("-")[0]}/${courseSlug}/`;
  const isCommunity = pathname.startsWith(`${basePath}/community`);
  const isChat = pathname.startsWith(`${basePath}/chat`);

  return (
    <nav
      className={[
        "sticky top-0 z-50",
        // Always cream-dark themed — login/footer/etc pages can flip via
        // `dark:` variants but the course area is the premium surface.
        "bg-cream-dark-bg/85 backdrop-blur-xl border-b border-cream-dark-border",
        "transition-transform duration-300 ease-out",
        hidden ? "-translate-y-full" : "translate-y-0",
      ].join(" ")}
      aria-label="Course navigation"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Home — leaves the course area and returns to the per-locale
            course catalog (`/[locale]/courses`), so the student can
            discover / re-enter their other enrolled courses.
            Replaces the previous "[C] {courseSlug}." brand block per
            product feedback (2026-07-15): the slug in the corner
            duplicated the in-tab welcome headline ("Bentornato" /
            course title) and was visually noisy, especially on tablet
            where space is tight between the brand block and the 3
            in-course tabs. */}
        <Link
          href={`/${locale}/courses`}
          aria-label={homeLabel}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-cream-dark-text-soft hover:text-cream-dark-gold hover:bg-cream-dark-surface/60 border border-cream-dark-border/60 hover:border-cream-dark-gold/40 active:scale-[0.96] transition-all shrink-0"
        >
          <Home className="w-[18px] h-[18px]" strokeWidth={2.25} />
        </Link>

        {/* Tabs (center) */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 justify-center overflow-x-auto">
          <Link
            href={basePath}
            className={tabClass(isCorso)}
            aria-current={isCorso ? "page" : undefined}
          >
            {labels.course}
          </Link>
          <Link
            href={`${basePath}/community`}
            className={tabClass(isCommunity)}
            aria-current={isCommunity ? "page" : undefined}
          >
            {labels.community}
          </Link>
          <Link
            href={`${basePath}/chat`}
            className={tabClass(isChat)}
            aria-current={isChat ? "page" : undefined}
          >
            {labels.chat}
          </Link>
        </div>

        {/* Right cluster: ThemeToggle + NotificationBell + User profile dropdown.
            (2026-07-15) Removed "Info corso" / `/about` link from the nav per
            production feedback — the marketing landing was demoted to sub-page
            status and the link was redundant with the funnel page CTA. The
            `/about` page itself is still accessible via direct URL. */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Theme toggle — visible to ALL (logged in or not) so users can
              flip to dark mode even on login / marketing pages. The course */}
          <ThemeToggle variant="dark" />
          {user && notifications && (
            <NotificationBell
              initialUnreadCount={notifications.unreadCount}
              initialRecent={notifications.recent}
              courseAreaHref={`${basePath}/chat`}
            />
          )}
          {user && <UserNav user={user} />}
        </div>
      </div>
    </nav>
  );
}
