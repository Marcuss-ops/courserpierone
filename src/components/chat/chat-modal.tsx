"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Loader2, MessageSquare } from "lucide-react";

interface MessageData {
  id: string;
  senderId: string;
  receiverId: string;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    } catch (err) {
      setError("Impossibile caricare i messaggi. Riprova.");
      console.error("fetchMessages error:", err);
    } finally {
      setLoading(false);
    }
  }, [creatorId, productId]);

  // Polling ogni 5 secondi quando la modale è aperta
  useEffect(() => {
    if (!open) return;
    void fetchMessages();
    pollRef.current = setInterval(() => { void fetchMessages(); }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, fetchMessages]);

  // Marca i messaggi ricevuti come letti
  useEffect(() => {
    if (!open) return;
    const unreadFromCreator = messages.filter(
      (m) => m.senderId === creatorId && !m.read
    );
    if (unreadFromCreator.length === 0) return;
    void fetch("/api/messages/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: creatorId }),
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
