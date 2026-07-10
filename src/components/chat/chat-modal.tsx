"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Loader2, MessageSquare, Wifi, WifiOff, ArrowUp } from "lucide-react";

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

interface ChatModalProps {
  currentUserId: string;
  currentUserName: string;
  creatorId: string;
  creatorName: string;
  productId?: string;
  triggerLabel?: string;
}

const PAGE_SIZE = 50;

export function ChatModal({
  currentUserId,
  currentUserName,
  creatorId,
  creatorName,
  productId,
  triggerLabel = "Scrivi al creator",
}: ChatModalProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  // Cursor pagination state
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const nextCursorRef = useRef<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const lastMessageDateRef = useRef<string | null>(null);

  // Fetch initial messages (most recent page)
  const fetchInitialMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ with: creatorId, limit: String(PAGE_SIZE) });
      if (productId) params.set("productId", productId);
      const res = await fetch(`/api/messages?${params.toString()}`);
      if (!res.ok) throw new Error("Errore nel caricamento messaggi");
      const data = await res.json();

      // API returns DESC (newest first) — reverse for ASC display (oldest → newest)
      const msgs: MessageData[] = (data.messages ?? []).reverse();
      setMessages(msgs);
      setHasMore(data.nextCursor !== null);
      nextCursorRef.current = data.nextCursor as string | null;

      if (msgs.length > 0) {
        lastMessageDateRef.current = msgs[msgs.length - 1].createdAt;
      }
    } catch (err) {
      setError("Impossibile caricare i messaggi. Riprova.");
      console.error("fetchMessages error:", err);
    } finally {
      setLoading(false);
    }
  }, [creatorId, productId]);

  // Load older messages (cursor-based pagination)
  const loadOlderMessages = useCallback(async () => {
    if (!nextCursorRef.current || loadingOlder) return;
    setLoadingOlder(true);

    try {
      const params = new URLSearchParams({
        with: creatorId,
        cursor: nextCursorRef.current,
        limit: String(PAGE_SIZE),
      });
      if (productId) params.set("productId", productId);
      const res = await fetch(`/api/messages?${params.toString()}`);
      if (!res.ok) throw new Error("Errore nel caricamento");
      const data = await res.json();

      // API returns DESC — reverse and prepend to existing messages
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
  }, [creatorId, productId, loadingOlder]);

  // Detect scroll-to-top to load older messages
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Trigger when scrolled within 80px of the top
    if (el.scrollTop < 80 && hasMore && !loadingOlder) {
      void loadOlderMessages();
    }
  }, [hasMore, loadingOlder, loadOlderMessages]);

  // Inizializza: carica messaggi + avvia SSE (con polling fallback)
  useEffect(() => {
    if (!open) return;

    void fetchInitialMessages();

    // Polling fallback helper: fetch recent messages, merge without resetting cursor
    const pollNewMessages = async () => {
      try {
        const p = new URLSearchParams({ with: creatorId, limit: String(PAGE_SIZE) });
        if (productId) p.set("productId", productId);
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
      } catch { /* ignore poll errors */ }
    };

    let fallbackPoll: ReturnType<typeof setInterval> | null = null;

    const params = new URLSearchParams({ with: creatorId });
    if (productId) params.set("productId", productId);
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
        } catch { /* ignore malformed events */ }
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
  }, [open, creatorId, productId, fetchInitialMessages]);

  // Marca i messaggi ricevuti come letti
  useEffect(() => {
    if (!open) return;
    const unreadFromCreator = messages.filter(
      (m) => m.senderId === creatorId && !m.read
    );
    if (unreadFromCreator.length === 0) return;
    const convId = messages[0]?.conversationId;
    if (!convId) return;
    void fetch("/api/messages/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: convId }),
    }).catch(console.error);
  }, [messages, creatorId, open]);

  // Auto-scroll to bottom only when user is already near the bottom.
  // Prevents yanking the user down while they're reading older messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !bottomRef.current) return;

    // Only auto-scroll if user is within 150px of the bottom
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Invia messaggio
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
          receiverId: creatorId,
          content: trimmed,
          productId: productId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Errore nell'invio");
      }
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setInput("");
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cream-dark-surface border border-cream-dark-border text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30 transition-all text-sm font-semibold"
      >
        <MessageSquare className="w-4 h-4" />
        <span>{triggerLabel}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full sm:max-w-lg sm:rounded-2xl bg-cream-dark-bg border border-cream-dark-border shadow-2xl flex flex-col h-[90vh] sm:h-[600px] sm:max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-cream-dark-border shrink-0">
              <div>
                <h3 className="font-serif text-lg text-cream-dark-text leading-tight">
                  {creatorName}
                </h3>
                <p className="text-xs text-cream-dark-text-soft font-light">
                  Scrivi come {currentUserName} — rispondo entro 24h
                </p>
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${sseConnected ? "text-emerald-400" : "text-cream-dark-text-soft/50"}`}>
                  {sseConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {sseConnected ? "Live" : "Polling"}
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-xl bg-cream-dark-surface border border-cream-dark-border text-cream-dark-text-soft hover:text-cream-dark-text hover:border-cream-dark-gold/30 transition-all"
                aria-label="Chiudi chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages — cursor-based pagination with scroll-to-top trigger */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
            >
              {/* Load older indicator */}
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
                <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                  <MessageSquare className="w-10 h-10 text-cream-dark-text-soft/40" />
                  <p className="text-sm text-cream-dark-text-soft font-light max-w-[280px]">
                    Scrivi qui il tuo primo messaggio. Risponderò il prima possibile.
                  </p>
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

            {/* Input */}
            <div className="px-5 py-4 border-t border-cream-dark-border shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Scrivi un messaggio..."
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
              <p className="text-[9px] text-cream-dark-text-soft/40 mt-1.5 text-center font-light">
                I tuoi messaggi sono privati. Solo tu e {creatorName} potete vederli.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
