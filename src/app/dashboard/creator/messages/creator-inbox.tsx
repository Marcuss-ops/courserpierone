"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  User as UserIcon,
  Clock as ClockIcon,
  ChevronRight,
  MessageSquare,
  Filter,
  Check,
} from "lucide-react";
import { ChatView } from "@/components/chat/chat-view";
import { timeAgo } from "@/lib/utils/time-ago";
import type { CreatorConversationPreview } from "./page";

interface ProductOption {
  id: string;
  slug: string;
  coverUrl: string | null;
}

interface CreatorInboxProps {
  previews: CreatorConversationPreview[];
  productOptions: ProductOption[];
  initialSelectedConversationId: string | null;
  currentUserId: string;
  currentUserName: string;
  role: string;
  totalUnread: number;
}

/**
 * Two-column creator inbox (Fase 3.2 del piano DMs).
 *
 * Left column: lista conversationi con
 *   - search bar (debounced via React state; per V1 lista < 1000
 *     items → filter inline senza debounce).
 *   - product filter dropdown (scope by product.)
 *   - unread-only toggle.
 * Right column: chat view inline. When a conversation is selected via
 * `?c=<conversationId>` URL query, ChatView re-mounts (key) and re-fetches
 * initial messages from `/api/messages?with=...&productId=...`. PATCH
 * unread → mark-as-read gestito da ChatView stesso.
 *
 * Selection state è URL-driven per consentire deep linking e bookmark.
 * Filtri sono local state (no URL): uno snapshot di "vista" che non
 *   influenza l'identità del thread mostrato a destra.
 */
export function CreatorInbox({
  previews,
  productOptions,
  initialSelectedConversationId,
  currentUserId,
  currentUserName,
  role,
  totalUnread,
}: CreatorInboxProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // URL è la source of truth per la conversationId selezionata.
  const selectedId =
    searchParams.get("c") ?? initialSelectedConversationId ?? null;

  // Filter states — local, non persistiti in URL (UX diretta).
  const [query, setQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [unreadOnly, setUnreadOnly] = useState(false);

  // ── Filter pipe ─────────────────────────────────────────
  const filtered = useMemo(() => {
    return previews.filter((p) => {
      if (selectedProductId !== null && p.productId !== selectedProductId) {
        return false;
      }
      if (unreadOnly && p.unreadCount === 0) return false;

      const q = query.trim().toLowerCase();
      if (q.length > 0) {
        const name = (p.otherUser.name ?? "").toLowerCase();
        const slug = p.productLabel.toLowerCase();
        const content = (p.lastMessage?.content ?? "").toLowerCase();
        if (!name.includes(q) && !slug.includes(q) && !content.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [previews, query, selectedProductId, unreadOnly]);

  const selectedPreview = useMemo(
    () => previews.find((p) => p.id === selectedId) ?? null,
    [previews, selectedId],
  );

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("c", conversationId);
      router.push(`/dashboard/creator/messages?${params.toString()}`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  return (
    <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased relative overflow-x-hidden flex flex-col">
      {/* Subtle warm glow overlay (consistent across dashboard pages) */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255, 140, 66, 0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(255, 200, 130, 0.04) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      {/* Top bar */}
      <header className="relative z-30 bg-cream-dark-bg/80 backdrop-blur-xl border-b border-cream-dark-border shrink-0">
        <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cream-dark-orange to-cream-dark-gold flex items-center justify-center shadow-md shrink-0">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-serif text-xl text-cream-dark-text leading-tight truncate">
                Messaggi · {role === "admin" ? "Admin" : "Creator"}
              </h1>
              <p className="text-xs text-cream-dark-text-soft font-light truncate">
                {previews.length === 0
                  ? "Nessuna conversazione"
                  : `${previews.length} ${previews.length === 1 ? "conversazione" : "conversazioni"}${totalUnread > 0 ? ` · ${totalUnread} non letti` : ""}`}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] min-h-0">
        {/* ── LEFT: list + filters ─────────────────────── */}
        <aside className="relative border-r border-cream-dark-border bg-cream-dark-bg/40 min-h-0 flex flex-col">
          <FilterBar
            query={query}
            onQueryChange={setQuery}
            productOptions={productOptions}
            selectedProductId={selectedProductId}
            onProductChange={setSelectedProductId}
            unreadOnly={unreadOnly}
            onUnreadOnlyChange={setUnreadOnly}
            totalCount={previews.length}
            filteredCount={filtered.length}
          />

          {/* Conversation list */}
          {previews.length === 0 ? (
            <EmptyListNoConversations role={role} />
          ) : filtered.length === 0 ? (
            <EmptyListNoMatches />
          ) : (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {filtered.map((conv) => {
                const isSelected = conv.id === selectedId;
                const isUnread =
                  conv.unreadCount > 0 ||
                  (conv.lastMessage !== null &&
                    conv.lastMessage.senderId !== currentUserId &&
                    !conv.lastMessage.read);

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`group w-full text-left flex items-start gap-3 p-3 rounded-2xl border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-dark-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-dark-bg ${
                      isSelected
                        ? "bg-cream-dark-gold/15 border-cream-dark-gold/40 shadow-md"
                        : isUnread
                          ? "bg-cream-dark-gold/5 border-cream-dark-gold/20 hover:bg-cream-dark-gold/10 hover:border-cream-dark-gold/30"
                          : "bg-cream-dark-surface/60 border-cream-dark-border hover:bg-cream-dark-surface hover:border-cream-dark-gold/20"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="shrink-0 relative">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden shadow-sm ring-1 ring-cream-dark-border">
                        {conv.otherUser.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={conv.otherUser.image}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UserIcon className="w-4 h-4 text-cream-gold" />
                        )}
                      </div>
                      {/* Unread dot indicator */}
                      {isUnread && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[10px] h-[10px] rounded-full bg-red-500 ring-2 ring-cream-dark-bg shadow-sm" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3
                          className={`font-semibold text-sm truncate ${isSelected ? "text-cream-dark-text" : isUnread ? "text-cream-dark-text" : "text-cream-dark-text-soft"}`}
                        >
                          {conv.otherUser.name || "Cliente"}
                        </h3>
                        {conv.lastMessage && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-cream-dark-text-soft/60">
                            <ClockIcon className="w-3 h-3" />
                            {timeAgo(conv.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-cream-dark-text-soft/70 truncate mt-0.5">
                        {conv.lastMessage
                          ? isUnread
                            ? conv.lastMessage.content
                            : conv.lastMessage.content
                          : "Nessun messaggio"}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-[10px] text-cream-dark-gold/80 font-medium uppercase tracking-wide truncate">
                          {conv.productLabel}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-[20px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 shadow-sm">
                            {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight
                      className={`shrink-0 w-4 h-4 transition-all ${
                        isSelected
                          ? "text-cream-dark-gold translate-x-0.5"
                          : "text-cream-dark-text-soft/40 group-hover:text-cream-dark-gold group-hover:translate-x-0.5"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* ── RIGHT: chat ─────────────────────────────── */}
        <main className="relative min-h-0 flex flex-col bg-cream-dark-bg/20">
          {selectedPreview ? (
            <ChatView
              // `key` forces remount on conversation change so ChatView
              // re-fetches initial messages (its `enabled` flag goes
              // back to true and `fetchInitialMessages` re-runs).
              key={selectedPreview.id}
              conversationId={selectedPreview.id}
              productId={selectedPreview.productId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              otherUser={selectedPreview.otherUser}
            />
          ) : (
            <EmptyChat
              hasConversations={previews.length > 0}
              totalUnread={totalUnread}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Filter bar sub-component ──────────────────────────────────
function FilterBar({
  query,
  onQueryChange,
  productOptions,
  selectedProductId,
  onProductChange,
  unreadOnly,
  onUnreadOnlyChange,
  totalCount,
  filteredCount,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  productOptions: ProductOption[];
  selectedProductId: string | null;
  onProductChange: (v: string | null) => void;
  unreadOnly: boolean;
  onUnreadOnlyChange: (v: boolean) => void;
  totalCount: number;
  filteredCount: number;
}) {
  return (
    <div className="px-4 py-4 border-b border-cream-dark-border space-y-3 shrink-0">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-dark-text-soft/50" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Cerca cliente o prodotto…"
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-cream-dark-surface border border-cream-dark-border text-cream-dark-text placeholder:text-cream-dark-text-soft/40 text-sm focus:outline-none focus:border-cream-dark-gold/50 focus:ring-1 focus:ring-cream-dark-gold/20 transition-all"
        />
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-2">
        {/* Product dropdown */}
        <div className="relative flex-1 min-w-0">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cream-dark-text-soft/50 pointer-events-none" />
          <select
            value={selectedProductId ?? ""}
            onChange={(e) =>
              onProductChange(e.target.value === "" ? null : e.target.value)
            }
            className="w-full appearance-none pl-8 pr-7 py-2 rounded-xl bg-cream-dark-surface border border-cream-dark-border text-cream-dark-text text-sm focus:outline-none focus:border-cream-dark-gold/50 focus:ring-1 focus:ring-cream-dark-gold/20 transition-all"
          >
            <option value="">Tutti i prodotti</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.slug}
              </option>
            ))}
          </select>
          <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cream-dark-text-soft/50 rotate-90 pointer-events-none" />
        </div>

        {/* Unread toggle */}
        <button
          type="button"
          onClick={() => onUnreadOnlyChange(!unreadOnly)}
          aria-pressed={unreadOnly}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
            unreadOnly
              ? "bg-cream-dark-gold/15 border-cream-dark-gold/40 text-cream-dark-gold"
              : "bg-cream-dark-surface border-cream-dark-border text-cream-dark-text-soft hover:text-cream-dark-text hover:border-cream-dark-gold/20"
          }`}
        >
          {unreadOnly ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <MessageSquare className="w-3.5 h-3.5" />
          )}
          Non letti
        </button>
      </div>

      {/* Count line */}
      <p className="text-[10px] uppercase tracking-wide text-cream-dark-text-soft/60 font-medium">
        {filteredCount === totalCount
          ? `${totalCount} ${totalCount === 1 ? "conversazione" : "conversazioni"}`
          : `${filteredCount} di ${totalCount}`}
      </p>
    </div>
  );
}

// ─── Empty states ────────────────────────────────────────────
function EmptyListNoConversations({ role }: { role: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="text-center space-y-3 max-w-[280px]">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-cream-dark-gold/60" />
        </div>
        <p className="text-sm text-cream-dark-text-soft font-light">
          {role === "admin"
            ? "Nessuna conversazione sui prodotti pubblicati. Quando uno studente acquisterà, apparirà qui."
            : "Nessuna conversazione sui tuoi prodotti. Quando uno studente ti contatterà, apparirà qui."}
        </p>
      </div>
    </div>
  );
}

function EmptyListNoMatches() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <p className="text-sm text-cream-dark-text-soft/70 font-light text-center">
        Nessun risultato per i filtri attivi.
      </p>
    </div>
  );
}

function EmptyChat({
  hasConversations,
  totalUnread,
}: {
  hasConversations: boolean;
  totalUnread: number;
}) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center space-y-4 max-w-[320px]">
        <div className="mx-auto w-20 h-20 rounded-3xl bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center shadow-md">
          <MessageSquare className="w-9 h-9 text-cream-dark-gold" />
        </div>
        <h3 className="font-serif text-2xl text-cream-dark-text">
          {hasConversations
            ? totalUnread > 0
              ? `${totalUnread} ${totalUnread === 1 ? "messaggio non letto" : "messaggi non letti"}`
              : "Seleziona una conversazione"
            : "Inbox vuota"}
        </h3>
        <p className="text-sm text-cream-dark-text-soft font-light leading-relaxed">
          {hasConversations
            ? "Scegli un cliente dalla lista a sinistra per leggere e rispondere ai messaggi."
            : "Quando uno studente ti contatterà, la sua conversazione apparirà qui a sinistra."}
        </p>
      </div>
    </div>
  );
}
