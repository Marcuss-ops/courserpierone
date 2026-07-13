"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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

interface WsMessageEvent {
  type: "newMessage" | "typing" | "stopTyping";
  conversationId?: string;
  message?: MessageData;
  userId?: string;
}

/**
 * Options for the realtime chat hook (Fase 4.1).
 *
 * La subscription è SCOPED per-conversation. Il `conversationId` è la
 * chiave canonica su WS/SSE: il token firmato HMAC include conversationId,
 * l'upgrade WS e l'SSE fanno membership-check su Conversation.userOneId/
 * userTwoId, e il filter del server bridge usa conversationId.
 *
 * `otherUserId` resta richiesto SOLO per mostrare l'indicatore di
 * digit del partner ("Mario sta scrivendo..."): il WS meta non espone
 * più questa info al client quindi la UI la riceve via prop.
 */
interface UseRealtimeChatOptions {
  /** ID della Conversation (Fase 4.1, obbligatorio). */
  conversationId: string;
  /** ID dell'altro partecipante (per il typing indicator nella UI). */
  otherUserId: string;
  /** Called when new messages arrive via WebSocket or SSE. */
  onMessages: (messages: MessageData[]) => void;
  /** Called when connection status changes. */
  onConnectionChange?: (connected: boolean) => void;
  /** If false, the connection is not established (e.g., chat modal is closed). */
  enabled?: boolean;
}

/**
 * Shared hook for real-time chat via WebSocket (primary) with SSE fallback.
 *
 * Fase 4.1: WS / SSE entrambi subscritti a una specifica Conversation.
 * Il client deve conoscere il conversationId a priori (recuperato da una
 * precedente GET /api/messages o POST /api/conversations con scope
 * {productId, targetUserId}). Per il path inbox "I don't know yet",
 * il flusso è: 1) POST /api/conversations (Fase 2.2 - idempotente,
 * upsert) → conversationId; 2) GET /api/auth/ws-token?conversationId=...
 * → token; 3) apri WS / SSE con conversationId.
 *
 * - Connects to ws://host/ws con ?token=<>&conversationId=<>
 * - Falls back to EventSource (SSE) su /api/messages/stream?conversationId=<> (legacy removed in chore(dm): cfb2d12)
 * - Falls back to HTTP polling se SSE fallisce
 * - Reconnect automatico su disconnect
 * - Rispetta `enabled` per non connettere quando la chat è chiusa
 */
export function useRealtimeChat({
  conversationId,
  otherUserId,
  onMessages,
  onConnectionChange,
  enabled = true,
}: UseRealtimeChatOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const modeRef = useRef<"ws" | "sse" | "poll" | null>(null);

  const [connected, setConnected] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selfTypingRef = useRef(false);

  // Sync connected state
  useEffect(() => {
    onConnectionChange?.(connected);
  }, [connected, onConnectionChange]);

  // ── Send typing status via WebSocket ─────────────────────
  const sendTyping = useCallback((isTyping: boolean) => {
    if (selfTypingRef.current === isTyping) return; // No change
    selfTypingRef.current = isTyping;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: isTyping ? "typing" : "stopTyping" }));
    }
  }, []);

  // Auto-stop typing after 4 seconds of inactivity
  const resetTypingTimer = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
    }, 4000);
  }, [sendTyping]);

  const cleanup = useCallback(() => {
    // Send stopTyping before closing
    if (wsRef.current?.readyState === WebSocket.OPEN && selfTypingRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: "stopTyping" })); } catch { /* ignore */ }
      selfTypingRef.current = false;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    modeRef.current = null;
    setIsOtherTyping(false);
    selfTypingRef.current = false;
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  // ── HTTP polling (last-resort fallback) ───────────────────
  // Fase 4.x canonical: il polling usa
  // GET /api/conversations/[id]/messages (REST canonico, keyato sulla
  // Conversation). Stesso contract della SSE fallback ma con una
  // round-trip ogni 10s invece di 2s. Attivo solo se sia WS che SSE
  // falliscono — degrado consapevole.
  const startPolling = useCallback(() => {
    if (!mountedRef.current || modeRef.current === "poll") return;
    cleanup();
    modeRef.current = "poll";

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/messages?limit=50`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const freshMsgs: MessageData[] = (data.messages ?? []).reverse();
        if (freshMsgs.length > 0) {
          onMessages(freshMsgs);
        }
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    void poll();
    // Polling più conservativo (10s) in fallback degrado.
    pollRef.current = setInterval(poll, 10_000);
  }, [conversationId, onMessages, cleanup]);

  // ── SSE fallback ──────────────────────────────────────────
  // Fase 4.x canonical: l'URL SSE è keyato sul conversationId via path
  // segment (Next.js dynamic route `[id]`). Niente più `?conversationId=`
  // query. Coesiste con la legacy `/api/messages/stream` finché tutti i
  // client non sono migrati.
  const connectSse = useCallback(() => {
    if (!mountedRef.current || modeRef.current === "sse") return;
    cleanup();
    modeRef.current = "sse";

    const esUrl = `/api/conversations/${encodeURIComponent(
      conversationId,
    )}/stream`;

    try {
      const es = new EventSource(esUrl);
      esRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
      };

      es.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data) as { messages: MessageData[] };
          if (data.messages?.length > 0) {
            onMessages(data.messages);
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        modeRef.current = null;
        startPolling();
      };
    } catch {
      if (mountedRef.current) {
        startPolling();
      }
    }
  }, [conversationId, onMessages, cleanup, startPolling]);

  // ── WebSocket connection ──────────────────────────────────
  // Fase 4.1: richiede il token scoped sulla Conversation (firmato
  // HMAC su userId:conversationId:timestamp). L'URL WS porta
  // ?token=...&conversationId=... — niente più with o productId.
  const connectWs = useCallback(async () => {
    if (!mountedRef.current || modeRef.current === "ws") return;
    cleanup();
    modeRef.current = "ws";

    if (!conversationId) {
      // Guardrail: senza conversationId non possiamo aprire WS.
      // Falliamo verso SSE (che restituirà 400 senza convId, → poll).
      if (mountedRef.current) {
        modeRef.current = null;
        connectSse();
      }
      return;
    }

    try {
      // Token scoped sulla Conversation (Fase 4.1).
      const tokenRes = await fetch(
        `/api/auth/ws-token?conversationId=${encodeURIComponent(conversationId)}`,
      );
      if (!tokenRes.ok) throw new Error("Failed to get WS token");
      const { token } = await tokenRes.json();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const qs = new URLSearchParams({
        token,
        conversationId,
      });
      const wsUrl = `${protocol}//${host}/ws?${qs.toString()}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Reset typing state on new connection
      selfTypingRef.current = false;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data) as WsMessageEvent;
          if (data.type === "newMessage" && data.message) {
            onMessages([data.message]);
          } else if (data.type === "typing" && data.userId === otherUserId) {
            setIsOtherTyping(true);
          } else if (data.type === "stopTyping" && data.userId === otherUserId) {
            setIsOtherTyping(false);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        modeRef.current = null;

        // Fall back to SSE (don't retry WS to avoid thrashing)
        reconnectTimeoutRef.current = setTimeout(() => {
          connectSse();
        }, 2000);
      };

      ws.onerror = () => {
        // Will trigger onclose, which falls back to SSE
        ws.close();
      };
    } catch {
      // WebSocket failed, fall back to SSE
      if (mountedRef.current) {
        modeRef.current = null;
        connectSse();
      }
    }
  }, [conversationId, otherUserId, onMessages, cleanup, connectSse]);

  // ── Initialize / teardown based on enabled flag ────────────
  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      void connectWs();
    } else {
      cleanup(); // eslint-disable-line react-hooks/set-state-in-effect -- TODO: refactor (FASE 1.10)
      setConnected(false);
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connectWs, cleanup]);

  return { connected, isOtherTyping, sendTyping, resetTypingTimer };
}
