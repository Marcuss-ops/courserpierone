"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Mail, User, Clock, X } from "lucide-react";
import { timeAgo } from "@/lib/utils/time-ago";
import { useInbox } from "@/components/layout/inbox-provider";

export interface UnreadConversation {
  conversationId: string;
  otherUserId: string;
  otherUserName: string | null;
  otherUserImage: string | null;
  lastMessageContent: string;
  lastMessageCreatedAt: string; // ISO
  unreadCount: number;
}

interface NotificationsDropdownProps {
  /**
   * SSR initial value (server-fetched). Usato come fallback
   * quando il componente è montato FUORI da <InboxProvider>.
   * Quando è dentro il provider, il valore realtime del WS ha
   * la precedenza.
   */
  conversations?: UnreadConversation[];
  totalUnread?: number;
}

export function NotificationsDropdown({
  conversations: initialConversations = [],
  totalUnread: initialTotalUnread = 0,
}: NotificationsDropdownProps) {
  // Fase 4.3: se InboxProvider è wrappato in pagina, usa i valori
  // realtime dal WS. Altrimenti fallback ai prop SSR.
  const inbox = useInbox();
  const totalUnread = inbox ? inbox.totalUnread : initialTotalUnread;
  // NB: le conversations restano SSR-side (lista di 5 conversazioni con
  //   preview dell'ultimo msg). L'inbox WS aggiorna solo il count, non
  //   il preview-content — quello richiede un fetch aggiuntivo che per V1
  //   resta fuori scope.
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
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
        aria-label={`Messaggi${totalUnread > 0 ? `, ${totalUnread} non letti` : ""}`}
        title={totalUnread > 0 ? `${totalUnread} messaggi non letti` : "Nessun nuovo messaggio"}
      >
        <Mail className="w-4 h-4" />
        {totalUnread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-md animate-pulse">
            {totalUnread > 99 ? "99+" : totalUnread}
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
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 z-50 bg-cream-dark-bg border border-cream-dark-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-cream-dark-border">
              <div>
                <h4 className="font-semibold text-sm text-cream-dark-text">Messaggi</h4>
                {totalUnread > 0 && (
                  <p className="text-[10px] text-cream-dark-text-soft font-light mt-0.5">
                    {totalUnread} {totalUnread === 1 ? "nuovo messaggio" : "nuovi messaggi"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {initialConversations.length > 0 && (
                  <Link
                    href="/dashboard/messages"
                    onClick={() => setOpen(false)}
                    className="text-[10px] font-medium text-cream-dark-gold hover:underline px-2 py-1"
                  >
                    Vedi tutti
                  </Link>
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

            {/* Conversations list */}
            {initialConversations.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-5 h-5 text-cream-dark-text-soft/40" />
                </div>
                <p className="text-sm text-cream-dark-text-soft font-light">
                  Nessun nuovo messaggio
                </p>
                <Link
                  href="/dashboard/messages"
                  onClick={() => setOpen(false)}
                  className="inline-block mt-2 text-xs text-cream-dark-gold hover:underline"
                >
                  Vai alla inbox
                </Link>
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto">
                {initialConversations.map((conv) => (
                  <Link
                    key={conv.conversationId}
                    href={`/dashboard/messages/${conv.otherUserId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-cream-dark-surface/60 transition-all border-b border-cream-dark-border/50 last:border-b-0 group"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden shrink-0 shadow-sm ring-1 ring-cream-dark-border">
                      {conv.otherUserImage ? (
                        <img
                          src={conv.otherUserImage}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-4 h-4 text-cream-gold" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-cream-dark-text truncate group-hover:text-cream-dark-gold transition-colors">
                          {conv.otherUserName || "Utente"}
                        </span>
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-cream-dark-text-soft/60">
                          <Clock className="w-3 h-3" />
                          {timeAgo(conv.lastMessageCreatedAt)}
                        </span>
                      </div>
                      <p className="text-xs text-cream-dark-text-soft/70 truncate mt-0.5 pr-6">
                        {conv.lastMessageContent}
                      </p>
                    </div>

                    {/* Unread badge */}
                    {conv.unreadCount > 0 && (
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 shadow-sm">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}

            {/* Footer — link to full inbox */}
            {initialConversations.length > 0 && (
              <div className="px-5 py-3 border-t border-cream-dark-border bg-cream-dark-surface/30">
                <Link
                  href="/dashboard/messages"
                  onClick={() => setOpen(false)}
                  className="block text-center text-xs font-medium text-cream-dark-gold hover:underline py-1"
                >
                  Apri inbox completa →
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
