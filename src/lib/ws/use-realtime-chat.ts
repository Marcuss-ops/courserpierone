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

interface UseRealtimeChatOptions {
  /** ID of the other user in the conversation. */
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
 * - Connects to ws://host/ws with a short-lived token
 * - Falls back to EventSource (SSE) on /api/messages/stream if WebSocket fails
 * - Falls back to HTTP polling if SSE also fails
 * - Automatically reconnects on disconnect
 * - Respects the `enabled` flag to avoid connecting when the chat is closed
 */
export function useRealtimeChat({
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

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
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
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && selfTypingRef.current) {
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
  const startPolling = useCallback(() => {
    if (!mountedRef.current || modeRef.current === "poll") return;
    cleanup();
    modeRef.current = "poll";

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const p = new URLSearchParams({ with: otherUserId, limit: "50" });
        const res = await fetch(`/api/messages?${p.toString()}`);
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
    pollRef.current = setInterval(poll, 5_000);
  }, [otherUserId, onMessages, cleanup]);

  // ── SSE fallback ──────────────────────────────────────────
  const connectSse = useCallback(() => {
    if (!mountedRef.current || modeRef.current === "sse") return;
    cleanup();
    modeRef.current = "sse";

    const params = new URLSearchParams({ with: otherUserId });
    const esUrl = `/api/messages/stream?${params.toString()}`;

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
  }, [otherUserId, onMessages, cleanup, startPolling]);

  // ── WebSocket connection ──────────────────────────────────
  const connectWs = useCallback(async () => {
    if (!mountedRef.current || modeRef.current === "ws") return;
    cleanup();
    modeRef.current = "ws";

    try {
      // Get a fresh token
      const tokenRes = await fetch("/api/auth/ws-token");
      if (!tokenRes.ok) throw new Error("Failed to get WS token");
      const { token } = await tokenRes.json();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}&with=${encodeURIComponent(otherUserId)}`;

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
  }, [otherUserId, onMessages, cleanup, connectSse]);

  // ── Initialize / teardown based on enabled flag ────────────
  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      void connectWs();
    } else {
      cleanup();
      setConnected(false);
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connectWs, cleanup]);

  return { connected, isOtherTyping, sendTyping, resetTypingTimer };
}
