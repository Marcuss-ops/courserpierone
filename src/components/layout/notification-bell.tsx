"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Bell, X, CheckCheck, MessageCircle, BookOpen, GraduationCap, Megaphone, Users } from "lucide-react";
import { timeAgo } from "@/lib/utils/time-ago";
import type { SerializedNotification } from "@/lib/notifications/get-initial-notifications";

interface NotificationBellProps {
  /**
   * SSR initial count (computed server-side da (member)/layout.tsx).
   * Garantisce che il badge sia già visibile al primo paint senza
   * aspettare il primo fetch del client.
   */
  initialUnreadCount: number;
  /** Ultimi N dal server (per la lista iniziale del dropdown). */
  initialRecent: SerializedNotification[];
  /**
   * URL del course-area `/chat` (es. `/it/amish-secrets/chat`).
   * Usato come fallback link per le notifiche `chat_reply` in cui
   * `Notification.link` non è stato impostato dal sender al crea-time.
   */
  courseAreaHref?: string | null;
}

/** Maps the notification type → visual icon (lucide) + accent color. */
function iconForType(type: string): { Icon: typeof Bell; className: string } {
  switch (type) {
    case "chat_reply":
      return { Icon: MessageCircle, className: "text-[#FF8C42]" };
    case "new_lesson":
      return { Icon: GraduationCap, className: "text-[#FFC882]" };
    case "lesson_update":
      return { Icon: BookOpen, className: "text-[#FFC882]" };
    case "new_course":
      return { Icon: GraduationCap, className: "text-[#FF8C42]" };
    case "course_update":
      return { Icon: BookOpen, className: "text-[#FFC882]" };
    case "community_reply":
      return { Icon: Users, className: "text-[#FF8C42]" };
    case "system_admin":
      return { Icon: Megaphone, className: "text-[#FFC882]" };
    default:
      return { Icon: Bell, className: "text-cream-dark-gold" };
  }
}

const POLL_INTERVAL_MS = 30_000;
const VISIBILITY_RECHECK_MS = 60_000;
/**
 * NotificationBell — Centro Notifiche (campanella) Skool-style.
 *
 * V1 features:
 *   - Server-side initial render via initialUnreadCount/initialRecent props.
 *   - Polling 30s via /api/notifications (niente WS stream per V1).
 *   - Polling pause quando tab hidden (visibility API); riprende on focus.
 *   - Dropdown aperto: lista le ultime N, mark-all-read, click-through.
 *   - Optimistic update locale per mark-single-read (chiude il gap prima
 *     del prossimo poll).
 */
export function NotificationBell({
  initialUnreadCount,
  initialRecent,
  courseAreaHref,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [recent, setRecent] = useState<SerializedNotification[]>(initialRecent);
  const [isPolling, setPolling] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch /api/notifications with bounded error handling ──────
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
      if (!res.ok) return;
      const data: {
        notifications: SerializedNotification[];
        unreadCount: number;
      } = await res.json();
      setRecent(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silently swallow network errors — tolleriamo fallimenti transient
      // durante polling (la campanella mostra ancora il valore SSR).
    }
  }, []);

  // ── Polling loop with visibility-aware pause ─────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const scheduleNextPoll = () => {
      if (cancelled) return;
      pollRef.current = setTimeout(() => {
        if (cancelled) return;
        void fetchNotifications().finally(() => scheduleNextPoll());
      }, POLL_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (cancelled) return;
      if (document.hidden) {
        // Pause: clear pending poll
        if (pollRef.current) {
          clearTimeout(pollRef.current);
          pollRef.current = null;
        }
        // Re-check visibility periodically (when user returns, we refresh immediately via focus)
        visibilityRef.current = setTimeout(onVisibility, VISIBILITY_RECHECK_MS);
      } else {
        // Refresh on tab becoming visible
        if (visibilityRef.current) {
          clearTimeout(visibilityRef.current);
          visibilityRef.current = null;
        }
        void fetchNotifications();
        scheduleNextPoll();
      }
    };

    if (!document.hidden) {
      scheduleNextPoll();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
      if (visibilityRef.current) clearTimeout(visibilityRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchNotifications]);

  // ── Refresh-on-focus (clicking back to the tab) ──────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => {
      if (!document.hidden) void fetchNotifications();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchNotifications]);

  // ── Refresh-when-dropdown-opens (so the user sees latest) ───
  useEffect(() => {
    if (open) void fetchNotifications();
  }, [open, fetchNotifications]);

  // ── Mark single notification read (optimistic) ──────────────
  const markRead = useCallback(async (id: string) => {
    setRecent((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
    } catch {
      // Rollback on failure: refetch truth from server
      void fetchNotifications();
    }
  }, [fetchNotifications]);

  // ── Mark ALL read (optimistic) ──────────────────────────────
  const markAllRead = useCallback(async () => {
    setPolling(true);
    setRecent((prev) =>
      prev.map((n) =>
        n.read ? n : { ...n, read: true, readAt: new Date().toISOString() },
      ),
    );
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
    } catch {
      void fetchNotifications();
    } finally {
      setPolling(false);
    }
  }, [fetchNotifications]);

  // ── Close on outside click / Escape ─────────────────────────
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2.5 rounded-xl border transition-all ${
          open
            ? "bg-cream-dark-gold/10 border-cream-dark-gold/30 text-cream-dark-gold"
            : "bg-cream-dark-surface border-cream-dark-border text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30"
        }`}
        aria-label={`Notifiche${unreadCount > 0 ? `, ${unreadCount} non lette` : ""}`}
        title={unreadCount > 0 ? `${unreadCount} notifiche non lette` : "Nessuna nuova notifica"}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-md animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 z-40 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          {/* Dropdown panel */}
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-[400px] z-50 bg-cream-dark-bg border border-cream-dark-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-cream-dark-border">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-cream-dark-gold" />
                <h4 className="font-semibold text-sm text-cream-dark-text">Notifiche</h4>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-cream-dark-bg bg-cream-dark-gold px-1.5 py-0.5 rounded-md">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    disabled={isPolling}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-cream-dark-gold hover:underline px-2 py-1 disabled:opacity-50"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Segna tutte
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-cream-dark-text-soft hover:text-cream-dark-text hover:bg-cream-dark-surface transition-all"
                  aria-label="Chiudi notifiche"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Notification list */}
            {recent.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-5 h-5 text-cream-dark-text-soft/40" />
                </div>
                <p className="text-sm text-cream-dark-text-soft font-light">
                  Nessuna nuova notifica
                </p>
                <p className="text-[10px] text-cream-dark-text-soft/60 mt-1 font-light">
                  Ti avvisiamo quando qualcuno ti scrive in chat o pubblica nuovi contenuti.
                </p>
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                {recent.map((notif) => {
                  const { Icon, className: iconClass } = iconForType(notif.type);
                  const isUnread = !notif.read;
                  // V1: chat_reply notifications navigate to /chat (course-area aware).
                  // Per admin/system annunci con `link: null` → render come button.
                  const href =
                    notif.link ||
                    (notif.type === "chat_reply" ? courseAreaHref : null);
                  const onActivate = () => {
                    if (isUnread) void markRead(notif.id);
                    setOpen(false);
                  };
                  const rowClassName = `flex items-start gap-3 px-5 py-3.5 transition-all border-b border-cream-dark-border/50 last:border-b-0 group cursor-pointer text-left w-full ${
                    isUnread
                      ? "hover:bg-cream-dark-surface/60 bg-cream-dark-gold/5"
                      : "hover:bg-cream-dark-surface/40 opacity-80"
                  }`;
                  const inner = (
                    <>
                      {/* Type icon */}
                      <div className={`w-9 h-9 rounded-full bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center shrink-0 ${iconClass}`}>
                        <Icon className="w-4 h-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-sm truncate group-hover:text-cream-dark-gold transition-colors ${isUnread ? "font-semibold text-cream-dark-text" : "font-medium text-cream-dark-text-soft"}`}>
                            {notif.title}
                          </span>
                          {isUnread && (
                            <span className="shrink-0 w-2 h-2 rounded-full bg-cream-dark-gold mt-1.5" aria-label="Non letta" />
                          )}
                        </div>
                        {notif.body && (
                          <p className="text-xs text-cream-dark-text-soft truncate mt-0.5 pr-4">
                            {notif.body}
                          </p>
                        )}
                        <p className="text-[10px] text-cream-dark-text-soft/60 mt-1">
                          {timeAgo(notif.createdAt)}
                        </p>
                      </div>
                    </>
                  );
                  // Branch sul tipo: Link navigabile vs button statico
                  // (no link = mostra solo). Niente Wrapper cast pasticciato.
                  if (href) {
                    return (
                      <Link
                        key={notif.id}
                        href={href}
                        onClick={onActivate}
                        className={rowClassName}
                      >
                        {inner}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={onActivate}
                      className={rowClassName}
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Footer — link to manage preferences */}
            <div className="px-5 py-3 border-t border-cream-dark-border bg-cream-dark-surface/30">
              <Link
                href="/account/notifications"
                onClick={() => setOpen(false)}
                className="block text-center text-xs font-medium text-cream-dark-gold hover:underline py-1"
              >
                Gestisci preferenze notifiche →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
