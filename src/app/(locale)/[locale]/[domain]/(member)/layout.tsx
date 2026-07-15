import { getServerUser } from "@/lib/supabase/get-user";
import { AccessGate } from "@/components/course/access-gate";
import { CourseTopNav } from "@/components/layout/course-top-nav";
import { loadLocaleContentCached } from "@/lib/i18n/load-locale-content";
import { getInitialNotifications } from "@/lib/notifications/get-initial-notifications";
import type { Metadata } from "next";

/**
 * CourseLayout — wraps `/[locale]/[domain]/`, `/community`, `/chat` tabs.
 *
 * Single source of truth for:
 * 1. AccessGate (paywall for non-enrolled users, redirects to /about)
 * 2. Top nav with the 3 tabs + scroll-hide behavior (Skool-feed pattern)
 * 3. Authenticated user payload for the UserNav dropdown in CourseTopNav
 *
 * Each tab page does its OWN data fetching below this layer — we don't hoist
 * fetches here to avoid waterfalls when only one tab is active.
 */

export async function generateMetadata({
  // `params` is declared in the function signature to satisfy the App
  // Router contract (it must take a `params` Promise) but the layout
  // wrapper does not need to consume it here — child pages generate
  // their own metadata. Underscore-prefixed rename keeps
  // `@typescript-eslint/no-unused-vars` silent (the underscore-prefix
  // convention is on by default in our eslint config) without
  // changing the shape of the object Next.js introspects.
  params: _params,
}: {
  params: Promise<{ locale: string; domain: string }>;
}): Promise<Metadata> {
  // Layouts can't intercept params in App Router without children, and
  // child pages (page.tsx / community / chat) generate their own metadata.
  // Returning {} here is fine — child generateMetadata wins.
  return {};
}

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; domain: string }>;
}) {
  const { locale, domain } = await params;
  const { dbUser } = await getServerUser();

  // Centri Notifiche (bell): pre-fetch SSR per badge subito visibile
  // al primo paint. Failure-tolerant: se la tabella Notification
  // non esiste ancora (migration pending) il fallback è `unreadCount=0`
  // e `recent=[]` — la UI continua a funzionare e polleremo pian piano.
  let notifications: { unreadCount: number; recent: Awaited<ReturnType<typeof getInitialNotifications>>["recent"] } = {
    unreadCount: 0,
    recent: [],
  };
  if (dbUser?.id) {
    try {
      notifications = await getInitialNotifications(dbUser.id);
    } catch (err) {
      // Tabella mancante post-deploy → log + fallback vuoto.
      console.warn("[notif] getInitialNotifications failed (migration pending?):", err);
    }
  }

  // Locale i18n for tab labels. Falls back via createEmptyLocale defaults
  // + inline `|| "X"` if a locale file lacks these keys.
  const lang2 = locale.split("-")[0]?.toLowerCase() ?? "en";
  const lc = (await loadLocaleContentCached(domain, lang2)).portal;

  const labels = {
    course: lc.tab_corso || (lang2 === "it" ? "Corso" : "Course"),
    community:
      lc.tab_community || (lang2 === "it" ? "Community" : "Community"),
    chat:
      lc.tab_chat ||
      (lang2 === "it" ? "Chat con il Creator" : "Chat with Creator"),
    // (2026-07-15) Removed `aboutCourse` / "Info corso" label — the top-nav
    // link to /[locale]/[domain]/about was retired per production feedback.
    // The /about page itself remains accessible via direct URL.
  };

  return (
    <AccessGate
      productSlug={domain}
      callbackUrl={`/${locale}/${domain}`}
    >
      <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased relative overflow-x-hidden">
        <CourseTopNav
          user={
            dbUser
              ? {
                  name: dbUser.name,
                  email: dbUser.email,
                  image: dbUser.image,
                  role: dbUser.role,
                }
              : null
          }
          courseSlug={domain}
          locale={locale}
          labels={labels}
          notifications={
            dbUser
              ? notifications
              : undefined
          }
        />
        <main className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-10 pb-24">
          {children}
        </main>
      </div>
    </AccessGate>
  );
}
