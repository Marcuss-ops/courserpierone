"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Loader2, Wifi, WifiOff, ArrowUp, User } from "lucide-react";

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
  conversationId: string | null;
  currentUserId: string;
  currentUserName: string;
  otherUser: OtherUser;
}

const PAGE_SIZE = 50;

export function ChatView({
  conversationId: initialConversationId,
  currentUserId,
  currentUserName,
  otherUser,
}: ChatViewProps) {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);

  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const nextCursorRef = useRef<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const lastMessageDateRef = useRef<string | null>(null);

  const otherUserId = otherUser.id;

  // Fetch initial messages
  const fetchInitialMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ with: otherUserId, limit: String(PAGE_SIZE) });
      const res = await fetch(`/api/messages?${params.toString()}`);

      // If conversation doesn't exist yet (403), just show empty state
      if (res.status === 403) {
        setMessages([]);
        setHasMore(false);
        nextCursorRef.current = null;
        return;
      }

      if (!res.ok) throw new Error("Errore nel caricamento messaggi");
      const data = await res.json();

      const msgs: MessageData[] = (data.messages ?? []).reverse();
      setMessages(msgs);
      setHasMore(data.nextCursor !== null);
      nextCursorRef.current = data.nextCursor as string | null;

      if (msgs.length > 0) {
        lastMessageDateRef.current = msgs[msgs.length - 1].createdAt;
        if (!conversationId && msgs[0]?.conversationId) {
          setConversationId(msgs[0].conversationId);
        }
      }
    } catch (err) {
      setError("Impossibile caricare i messaggi. Riprova.");
      console.error("fetchMessages error:", err);
    } finally {
      setLoading(false);
    }
  }, [otherUserId, conversationId]);

  // Load older messages
  const loadOlderMessages = useCallback(async () => {
    if (!nextCursorRef.current || loadingOlder) return;
    setLoadingOlder(true);

    try {
      const params = new URLSearchParams({
        with: otherUserId,
        cursor: nextCursorRef.current,
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/messages?${params.toString()}`);
      if (!res.ok) throw new Error("Errore nel caricamento");
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
  }, [otherUserId, loadingOlder]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < 80 && hasMore && !loadingOlder) {
      void loadOlderMessages();
    }
  }, [hasMore, loadingOlder, loadOlderMessages]);

  // Initialize: fetch messages + SSE (with polling fallback)
  useEffect(() => {
    void fetchInitialMessages();

    // Polling fallback
    const pollNewMessages = async () => {
      try {
        const p = new URLSearchParams({ with: otherUserId, limit: String(PAGE_SIZE) });
        const res = await fetch(`/api/messages?${p.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        const freshMsgs: MessageData[] = (data.messages ?? []).reverse();
        if (freshMsgs.length === 0) return;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOnes = freshMsgs.filter((m) => !existingIds.has(m.id));
          return newOnes.length === 0 ? prev : [...prev, ...newOnes];
        });
      } catch { /* ignore */ }
    };

    let fallbackPoll: ReturnType<typeof setInterval> | null = null;

    const params = new URLSearchParams({ with: otherUserId });
    if (lastMessageDateRef.current) params.set("since", lastMessageDateRef.current);

    const esUrl = `/api/messages/stream?${params.toString()}`;

    try {
      const es = new EventSource(esUrl);
      esRef.current = es;

      es.onopen = () => setSseConnected(true);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { messages: MessageData[] };
          if (data.messages?.length > 0) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const newOnes = data.messages.filter((m) => !existingIds.has(m.id));
              if (newOnes.length === 0) return prev;
              const lastMsg = newOnes[newOnes.length - 1];
              lastMessageDateRef.current = lastMsg.createdAt;
              return [...prev, ...newOnes];
            });
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        setSseConnected(false);
        es.close();
        esRef.current = null;
        if (!fallbackPoll) {
          fallbackPoll = setInterval(pollNewMessages, 5000);
          pollRef.current = fallbackPoll;
        }
      };
    } catch {
      fallbackPoll = setInterval(pollNewMessages, 5000);
      pollRef.current = fallbackPoll;
    }

    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      setSseConnected(false);
      if (fallbackPoll) clearInterval(fallbackPoll);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [otherUserId, fetchInitialMessages]);

  // Mark received messages as read
  useEffect(() => {
    const unreadFromOther = messages.filter(
      (m) => m.senderId === otherUserId && !m.read
    );
    if (unreadFromOther.length === 0) return;
    const convId = messages[0]?.conversationId;
    if (!convId) return;
    void fetch("/api/messages/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: convId }),
    }).catch(console.error);
  }, [messages, otherUserId]);

  // Auto-scroll to bottom when near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !bottomRef.current) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Send message
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: otherUserId,
          content: trimmed,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Errore nell'invio");
      }
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setInput("");
      if (!conversationId && data.message?.conversationId) {
        setConversationId(data.message.conversationId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'invio");
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

  const otherName = otherUser.name || "Utente";

  return (
    <div className="flex-1 flex flex-col min-h-0">
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
              {loadingOlder ? "Caricamento..." : "Messaggi precedenti"}
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
                // eslint-disable-next-line @next/next/no-img-element
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
                Scrivi qui il tuo primo messaggio. Risponderò il prima possibile.
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
            sseConnected ? "text-emerald-400" : "text-cream-dark-text-soft/50"
          }`}
        >
          {sseConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {sseConnected ? "Live" : "Polling"}
        </span>
      </div>

      {/* Input */}
      <div className="px-4 sm:px-6 py-4 border-t border-cream-dark-border shrink-0 bg-cream-dark-bg/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Scrivi a ${otherName}...`}
            maxLength={5000}
            disabled={sending}
            className="flex-1 px-4 py-2.5 rounded-xl bg-cream-dark-surface border border-cream-dark-border text-cream-dark-text placeholder:text-cream-dark-text-soft/40 text-sm focus:outline-none focus:border-cream-dark-gold/50 focus:ring-1 focus:ring-cream-dark-gold/20 transition-all disabled:opacity-50"
          />
          <button
            onClick={() => { void handleSend(); }}
            disabled={!input.trim() || sending}
            className="p-2.5 rounded-xl bg-cream-dark-gold/20 border border-cream-dark-gold/30 text-cream-dark-gold hover:bg-cream-dark-gold/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
            aria-label="Invia messaggio"
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
