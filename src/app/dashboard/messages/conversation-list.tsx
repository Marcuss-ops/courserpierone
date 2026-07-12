"use client";

import Link from "next/link";
import { User, Clock, ChevronRight } from "lucide-react";
import { timeAgo } from "@/lib/utils/time-ago";
import { useInbox } from "@/components/layout/inbox-provider";
import type { ConversationPreview } from "./page";

interface ConversationListProps {
  previews: ConversationPreview[];
  currentUserId: string;
}

export function ConversationList({ previews, currentUserId }: ConversationListProps) {
  // Fase 4.3: se wrappato in InboxProvider, usa i counts realtime dal
  // WS sovrapposti agli SSR (byConversation[convId]). Altrimenti
  // fallback ai prop SSR (conv.unreadCount).
  const inbox = useInbox();
  const realtimeByConversation = inbox?.byConversation ?? null;

  return (
    <div className="space-y-3">
      {previews.map((conv) => {
        const realtimeDelta = realtimeByConversation?.[conv.id] ?? 0;
        const unreadCount = conv.unreadCount + realtimeDelta;
        const isUnread =
          unreadCount > 0 ||
          (conv.lastMessage !== null &&
            conv.lastMessage.senderId !== currentUserId &&
            !conv.lastMessage.read);

        // Phase 1.3: ogni link passa productId per soddisfare il vincolo
        // sulla ChatPage che ora richiede productId obbligatorio.
        const href = `/dashboard/messages/${conv.otherUser.id}?productId=${encodeURIComponent(conv.productId)}`;

        return (
          <Link
            key={conv.id}
            href={href}
            className={`group flex items-center gap-4 p-4 sm:p-5 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-dark-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-dark-bg ${
              isUnread
                ? "bg-cream-dark-gold/5 border-cream-dark-gold/20 shadow-sm hover:shadow-md hover:border-cream-dark-gold/40"
                : "bg-cream-dark-surface border-cream-dark-border hover:shadow-lg hover:border-cream-dark-gold/20"
            }`}
          >
            {/* Avatar */}
            <div className="shrink-0 relative">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden shadow-md ring-2 ring-cream-dark-border">
                {conv.otherUser.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={conv.otherUser.image}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 sm:w-6 sm:h-6 text-cream-gold" />
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3
                  className={`font-semibold text-sm sm:text-base truncate ${
                    isUnread ? "text-cream-dark-text" : "text-cream-dark-text-soft"
                  }`}
                >
                  {conv.otherUser.name || "Utente"}
                </h3>
                {conv.lastMessage && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-cream-dark-text-soft/60">
                    <Clock className="w-3 h-3" />
                    {timeAgo(conv.lastMessage.createdAt)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="text-xs sm:text-sm text-cream-dark-text-soft/70 truncate max-w-[280px]">
                  {conv.lastMessage ? conv.lastMessage.content : "Nessun messaggio"}
                </p>
                {unreadCount > 0 && (
                  <span className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 shadow-md">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>

              {/* Product badge (Phase 1.3) */}
              {conv.productLabel && (
                <p className="text-[10px] text-cream-dark-gold/80 font-medium uppercase tracking-wide mt-1 truncate">
                  • {conv.productLabel}
                </p>
              )}
            </div>

            <ChevronRight className="shrink-0 w-4 h-4 text-cream-dark-text-soft/40 group-hover:text-cream-dark-gold group-hover:translate-x-0.5 transition-all" />
          </Link>
        );
      })}
    </div>
  );
}
