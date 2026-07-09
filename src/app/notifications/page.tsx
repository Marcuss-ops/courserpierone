import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Bell, ArrowLeft, Clock } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { MarkAllReadButton } from "./mark-all-read-button";

export const metadata: Metadata = {
  title: "Notifiche",
  description: "Le tue notifiche",
};

export const dynamic = "force-dynamic";

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return "Adesso";
  if (mins < 60) return `${mins}m fa`;
  if (hours < 24) return `${hours}h fa`;
  if (days < 30) return `${days}g fa`;
  if (days < 365) return `${Math.floor(days / 30)} mesi fa`;
  return `${Math.floor(days / 365)} anni fa`;
}

export default async function NotificationsPage() {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    redirect("/login");
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({
      where: { userId: dbUser.id, read: false },
    }),
  ]);

  return (
    <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased relative overflow-x-hidden">
      {/* Warm glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255, 140, 66, 0.06) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      {/* Top nav */}
      <nav className="sticky top-0 z-50 bg-cream-dark-bg/80 backdrop-blur-xl border-b border-cream-dark-border">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="p-2 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-cream-dark-text-soft hover:text-cream-dark-gold transition-all"
            aria-label="Torna alla dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="font-serif text-xl text-cream-dark-text">Notifiche</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-cream-dark-text-soft">{unreadCount} non lette</p>
            )}
          </div>
          {unreadCount > 0 && <MarkAllReadButton />}
        </div>
      </nav>

      <main className="relative max-w-3xl mx-auto px-6 py-8 pb-24">
        {notifications.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center">
              <Bell className="w-7 h-7 text-cream-dark-text-soft" />
            </div>
            <p className="text-cream-dark-text-soft text-sm">Nessuna notifica</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`relative rounded-2xl border transition-all ${
                  n.read
                    ? "bg-cream-dark-surface/30 border-cream-dark-border opacity-60"
                    : "bg-cream-dark-surface border-cream-dark-border shadow-sm"
                }`}
              >
                {n.link ? (
                  <Link href={n.link} className="block p-4 hover:bg-cream-dark-bg/30 transition-colors">
                    <NotificationContent notification={n} />
                  </Link>
                ) : (
                  <div className="p-4">
                    <NotificationContent notification={n} />
                  </div>
                )}
                {!n.read && (
                  <div className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-cream-dark-gold shadow-md shadow-cream-dark-gold/30" />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Notification content renderer ──────────────────────
function NotificationContent({
  notification,
}: {
  notification: { type: string; message: string; read: boolean; createdAt: Date };
}) {
  const iconMap: Record<string, React.ReactNode> = {
    new_comment: <Bell className="w-4 h-4 text-blue-400" />,
    new_like: <Bell className="w-4 h-4 text-red-400" />,
    new_post: <Bell className="w-4 h-4 text-green-400" />,
    post_pinned: <Bell className="w-4 h-4 text-cream-dark-gold" />,
    reply: <Bell className="w-4 h-4 text-purple-400" />,
  };

  return (
    <div className="flex gap-3">
      <div className="w-9 h-9 rounded-xl bg-cream-dark-bg border border-cream-dark-border flex items-center justify-center shrink-0">
        {iconMap[notification.type] ?? <Bell className="w-4 h-4 text-cream-dark-text-soft" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-cream-dark-text leading-snug">{notification.message}</p>
        <div className="flex items-center gap-1 mt-1">
          <Clock className="w-3 h-3 text-cream-dark-text-soft" />
          <span className="text-[10px] text-cream-dark-text-soft">
            {relativeTime(notification.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
