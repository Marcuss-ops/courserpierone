"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Loader2, Wifi, WifiOff, ArrowUp, User } from "lucide-react";
import { useRealtimeChat } from "@/lib/ws/use-realtime-chat";
import { useChatT } from "@/lib/i18n/use-chat-t";

interface MessageData {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  read: boolean;
  createdAt: string;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
    role: string;
  };
}

interface OtherUser {
  id: string;
  name: string | null;
  image: string | null;
  role: string;
}

interface ChatViewProps {
  /**
   * Fase 4.x canonical: `conversationId` è REQUIRED non-null. I
   * parents garantiscono l'id prima del mount:
   *   - `[userId]/page.tsx` chiama `findOrCreateConversation`
   *     server-side (no client round-trip per la risoluzione)
   *   - `creator-inbox.tsx` legge l'id dalla lista canonica
   *     `GET /api/conversations` (l'item esiste iff la Conversation
   *     esiste nel DB)
   * Non esiste più il fallback "auto-create lazy al primo fetch" —
   * la creazione è demandata al `POST /api/conversations` (parent)
   * o all'helper server-side (page.tsx).
   */
  conversationId: string;
  /**
   * Conservato per future global header contexts (es. product title
   * sopra la chat). NON usato dai fetch canonici (il server deriva
   * productId dalla Conversation row via loadAuthorizedConversation).
   */
  productId: string;
  currentUserId: string;
  currentUserName: string;
  otherUser: OtherUser;
  /**
   * Fase 3.1: contesto opzionale. Quando lo studente atterra nella chat
   * da una pagina lezione (es. ContactCreatorButton cliccato da
   * /curso/[lessonId]), la URL passa `?lessonId=XYZ` e la route lo
   * propaga. ChatView mostra un piccolo banner contestuale sopra la
   * lista messaggi per ricordare da dove l'utente sta scrivendo.
   * NB: V1 non iniettiamo nulla nel content dei messaggi — il contesto
   * è solo UI-ornament. V2 potrebbe prefisso automatico del primo msg.
   */
  lessonId?: string;
}

const PAGE_SIZE = 50;

/**
 * ChatView — shared component for rendering a single conversation thread.
 *
 * Fase 4.x canonical migration (POST /api/messages → /api/conversations) (legacy removed in chore(dm): cfb2d12):
 *   - fetchInitialMessages → GET /api/conversations/[id]/messages
 *   - loadOlderMessages    → GET /api/conversations/[id]/messages?cursor=…
 *   - mark-as-read         → PATCH /api/conversations/[id]/read (no body)
 *   - handleSend           → POST /api/conversations/[id]/messages { content }
 *   - real-time            → useRealtimeChat su /api/conversations/[id]/stream
 *
 * Logica invariata:
 *   - Fetch initial messages via cursor-based pagination.
 *   - Mark received messages as read idempotente via PATCH …/read.
 *   - Real-time subscription via useRealtimeChat (conversazioneId-based,
 *     Fase 4.1 server WS; SSE fallback al canonical stream endpoint).
 *   - Typing indicator forward via WS.
 *
 * Fase 3.2 refactor (precedente): estratto da
 * `app/dashboard/messages/[userId]/chat-view.tsx` a
 * `src/components/chat/chat-view.tsx` per evitare cross-route component
 * imports (il segmento `[userId]` di Next.js non dovrebbe essere
 * importato da altre pagine). Entrambe le route (student messages e
 * creator inbox) ora importano dalla stessa location.
 */
export function ChatView({
  conversationId,
  productId,
  currentUserId,
  currentUserName,
  otherUser,
  lessonId,
}: ChatViewProps) {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const nextCursorRef = useRef<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageDateRef = useRef<string | null>(null);

  const t = useChatT();
  const otherUserId = otherUser.id;

  // ── WebSocket real-time (with SSE fallback) ──────────────
  const handleRealtimeMessages = useCallback(
    (newMessages: MessageData[]) => {
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newOnes = newMessages.filter((m) => !existingIds.has(m.id));
        if (newOnes.length === 0) return prev;
        const lastMsg = newOnes[newOnes.length - 1];
        lastMessageDateRef.current = lastMsg.createdAt;
        return [...prev, ...newOnes];
      });
    },
    [],
  );

  const { connected, isOtherTyping, sendTyping, resetTypingTimer } =
    useRealtimeChat({
      // Fase 4.1: subscription WS/SSE è scoped sulla Conversation
      // (canonical). ConversationId ora è sempre non-null come prop —
      // niente più fallback stringa vuota + gate enabled.
      conversationId,
      otherUserId,
      onMessages: handleRealtimeMessages,
    });

  // ── Fetch initial messages (CANONICAL: GET /api/conversations/[id]/messages) ──
  const fetchInitialMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationId,
        )}/messages?${params.toString()}`,
      );

      // If conversation exists but is denied (403 — refund retroattivo,
      // 404 — membership drift upstream, o membership non valido),
      // mostriamo empty state invece di far esplodere l'errore.
      if (res.status === 403 || res.status === 404) {
        setMessages([]);
        setHasMore(false);
        nextCursorRef.current = null;
        return;
      }

      if (!res.ok) throw new Error(t.loadError);
      const data = await res.json();

      const msgs: MessageData[] = (data.messages ?? []).reverse();
      setMessages(msgs);
      setHasMore(data.nextCursor !== null);
      nextCursorRef.current = data.nextCursor as string | null;

      if (msgs.length > 0) {
        lastMessageDateRef.current = msgs[msgs.length - 1].createdAt;
      }
    } catch (err) {
      setError(t.loadErrorRetry);
      console.error("fetchMessages error:", err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, t]);

  // ── Load older messages (CANONICAL: same endpoint with cursor) ──
  const loadOlderMessages = useCallback(async () => {
    if (!nextCursorRef.current || loadingOlder) return;
    setLoadingOlder(true);

    try {
      const params = new URLSearchParams({
        cursor: nextCursorRef.current,
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationId,
        )}/messages?${params.toString()}`,
      );
      if (!res.ok) throw new Error(t.loadErrorShort);
      const data = await res.json();

      const olderMsgs: MessageData[] = (data.messages ?? []).reverse();
      if (olderMsgs.length > 0) {
        setMessages((prev) => [...olderMsgs, ...prev]);
      }
      setHasMore(data.nextCursor !== null);
      nextCursorRef.current = data.nextCursor as string | null;
    } catch (err) {
      console.error("loadOlderMessages error:", err);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, loadingOlder, t]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < 80 && hasMore && !loadingOlder) {
      void loadOlderMessages();
    }
  }, [hasMore, loadingOlder, loadOlderMessages]);

  // Initialize: fetch messages on mount
  useEffect(() => {
    void fetchInitialMessages();
  }, [fetchInitialMessages]);

  // ── Mark received messages as read (CANONICAL: PATCH /api/conversations/[id]/read) ──
  // Il conversationId ora è canonico nell'URL (path segment) — niente
  // più `{ conversationId }` nel body. Idempotente lato server.
  useEffect(() => {
    const unreadFromOther = messages.filter(
      (m) => m.senderId === otherUserId && !m.read,
    );
    if (unreadFromOther.length === 0) return;
    void fetch(
      `/api/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: "PATCH" },
    ).catch(console.error);
  }, [messages, otherUserId, conversationId]);

  // Auto-scroll to bottom when near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !bottomRef.current) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // ── Send message (CANONICAL: POST /api/conversations/[id]/messages { content }) ──
  // Body rimosso: receiverId e productId sono derivati server-side dalla
  // Conversation row via loadAuthorizedConversation (la coppia canonica
  // <partnerId, productId> è già implicita nella Conversation stessa).
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t.sendError);
      }
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setInput("");
      sendTyping(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.sendError);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const otherName = otherUser.name || t.userFallback;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Fase 3.1 — Contesto lezione (banner). V1: copy generico (no
          lessonId raw) per evitare UX scadente (mostrare un ID opaco
          mentre l'utente ha appena visto il titolo sopra). V2 potrà
          passare lessonTitle risolto via course config. */}
      {lessonId && (
        <div className="px-4 sm:px-6 pt-3 pb-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cream-dark-gold/10 border border-cream-dark-gold/20 text-[11px] font-medium text-cream-dark-gold">
            <span>Contesto lezione attiva</span>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4"
      >
        {/* Load older */}
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cream-dark-surface border border-cream-dark-border text-xs text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30 transition-all disabled:opacity-40"
            >
              {loadingOlder ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ArrowUp className="w-3 h-3" />
              )}
              {loadingOlder ? t.loading : t.olderMessages}
            </button>
          </div>
        )}

        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-cream-dark-text-soft" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-12">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center shadow-md">
              {otherUser.image ? (
                <img
                  src={otherUser.image}
                  alt=""
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <User className="w-7 h-7 text-cream-gold" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="font-serif text-lg text-cream-dark-text">{otherName}</h3>
              <p className="text-sm text-cream-dark-text-soft font-light max-w-[280px]">
                {t.emptyChatHint}
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.senderId === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  isMine
                    ? "bg-cream-dark-gold/20 text-cream-dark-text border border-cream-dark-gold/20 rounded-br-md"
                    : "bg-cream-dark-surface text-cream-dark-text border border-cream-dark-border rounded-bl-md"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p className="text-[10px] text-cream-dark-text-soft/60 mt-1.5 text-right">
                  {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}

        {error && (
          <p className="text-center text-xs text-red-400 bg-red-400/10 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Connection status */}
      <div className="px-4 sm:px-6 py-1 flex items-center justify-center">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-medium ${
            connected ? "text-emerald-400" : "text-cream-dark-text-soft/50"
          }`}
        >
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? t.live : t.reconnecting}
        </span>
      </div>

      {/* Typing indicator */}
      {isOtherTyping && (
        <div className="px-4 sm:px-6 py-2 text-center animate-fadeIn">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-cream-dark-gold font-medium">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cream-dark-gold animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cream-dark-gold animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cream-dark-gold animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            {otherName} {t.typing}
          </span>
        </div>
      )}

      {/* Input */}
      <div className="px-4 sm:px-6 py-4 border-t border-cream-dark-border shrink-0 bg-cream-dark-bg/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <input
            type="text"
            value={input}
            onKeyDown={handleKeyDown}
            placeholder={t.writeToName.replace("{name}", otherName)}
            maxLength={5000}
            disabled={sending}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value.trim()) {
                sendTyping(true);
                resetTypingTimer();
              } else {
                sendTyping(false);
              }
            }}
            className="flex-1 px-4 py-2.5 rounded-xl bg-cream-dark-surface border border-cream-dark-border text-cream-dark-text placeholder:text-cream-dark-text-soft/40 text-sm focus:outline-none focus:border-cream-dark-gold/50 focus:ring-1 focus:ring-cream-dark-gold/20 transition-all disabled:opacity-50"
          />
          <button
            onClick={() => { void handleSend(); }}
            disabled={!input.trim() || sending}
            className="p-2.5 rounded-xl bg-cream-dark-gold/20 border border-cream-dark-gold/30 text-cream-dark-gold hover:bg-cream-dark-gold/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
            aria-label={t.sendMessage}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
