"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Loader2, MessageSquare, Wifi, WifiOff } from "lucide-react";

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
  /** L'utente corrente (studente) */
  currentUserId: string;
  currentUserName: string;
  /** L'utente creator (admin) a cui scrivere */
  creatorId: string;
  creatorName: string;
  /** ID prodotto per scoping conversazione (deve essere il Prisma cuid, non lo slug) */
  productId?: string;
  /** Etichetta custom per il bottone di apertura */
  triggerLabel?: string;
}

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const lastMessageDateRef = useRef<string | null>(null);

  // Carica la conversazione quando la modale si apre
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ with: creatorId });
      if (productId) params.set("productId", productId);
      const res = await fetch(`/api/messages?${params.toString()}`);
      if (!res.ok) throw new Error("Errore nel caricamento messaggi");
      const data = await res.json();
      setMessages(data.messages ?? []);
      // Aggiorna il cursore SSE per evitare di ri-ricevere messaggi storici
      const msgs: MessageData[] = data.messages ?? [];
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

  // Inizializza: carica messaggi + avvia SSE (con polling fallback)
  useEffect(() => {
    if (!open) return;

    void fetchMessages();
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;

    // Costruisci URL SSE
    const params = new URLSearchParams({ with: creatorId });
    if (productId) params.set("productId", productId);
    if (lastMessageDateRef.current) params.set("since", lastMessageDateRef.current);

    const esUrl = `/api/messages/stream?${params.toString()}`;

    try {
      const es = new EventSource(esUrl);
      esRef.current = es;

      es.onopen = () => {
        setSseConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { messages: MessageData[] };
          if (data.messages?.length > 0) {
            setMessages((prev) => {
              // Evita duplicati
              const existingIds = new Set(prev.map((m) => m.id));
              const newOnes = data.messages.filter((m) => !existingIds.has(m.id));
              if (newOnes.length === 0) return prev;
              // Aggiorna il cursore
              const lastMsg = newOnes[newOnes.length - 1];
              lastMessageDateRef.current = lastMsg.createdAt;
              return [...prev, ...newOnes];
            });
          }
        } catch {
          // Ignora eventi malformati
        }
      };

      es.onerror = () => {
        setSseConnected(false);
        es.close();
        esRef.current = null;

        // Fallback: polling ogni 5 secondi
        if (!fallbackPoll) {
          fallbackPoll = setInterval(() => {
            void fetchMessages();
          }, 5000);
          pollRef.current = fallbackPoll;
        }
      };
    } catch {
      // EventSource non supportato — usa solo polling
      fallbackPoll = setInterval(() => {
        void fetchMessages();
      }, 5000);
      pollRef.current = fallbackPoll;
    }

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setSseConnected(false);
      if (fallbackPoll) clearInterval(fallbackPoll);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [open, creatorId, productId, fetchMessages]);

  // Marca i messaggi ricevuti come letti (usa conversationId dal primo messaggio)
  useEffect(() => {
    if (!open) return;
    const unreadFromCreator = messages.filter(
      (m) => m.senderId === creatorId && !m.read
    );
    if (unreadFromCreator.length === 0) return;

    // Trova il conversationId dal primo messaggio
    const convId = messages[0]?.conversationId;
    if (!convId) return;

    void fetch("/api/messages/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: convId }),
    }).catch(console.error);
  }, [messages, creatorId, open]);

  // Auto-scroll in fondo
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      {/* Bottone trigger */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cream-dark-surface border border-cream-dark-border text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30 transition-all text-sm font-semibold"
      >
        <MessageSquare className="w-4 h-4" />
        <span>{triggerLabel}</span>
      </button>

      {/* Modale */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Pannello chat */}
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

            {/* Messaggi */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
            >
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
