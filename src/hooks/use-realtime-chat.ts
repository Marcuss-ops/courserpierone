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

interface UseRealtimeChatOptions {
  /** ID della Conversation (canonical Fase 4.x). */
  conversationId: string;
  /** ID dell'altro partecipante. */
  otherUserId: string;
  /** Called when new messages arrive. */
  onMessages: (messages: MessageData[]) => void;
  /** Called when connection status changes. */
  onConnectionChange?: (connected: boolean) => void;
  /** If false, the connection is not established. */
  enabled?: boolean;
}

/**
 * Shared hook for real-time chat via SSE (Server-Sent Events) with HTTP
 * polling fallback.
 *
 * C3 cleanup: this hook previously tried WebSocket first, then SSE, then
 * polling. After deleting the custom WS infrastructure (`server.ts` +
 * `src/lib/ws/` + `/api/auth/ws-token`), the hook is SSE-first with HTTP
 * polling as the only degradation tier. The `sendTyping` /
 * `resetTypingTimer` / `isOtherTyping` surface is preserved as no-op
 * stubs so the consumer (`chat-view.tsx`) doesn't need to change.
 *
 * Wire contract (unchanged from pre-C3):
 *   - SSE: GET /api/conversations/[id]/stream (canonical, conversationId
 *     scoped, 2-second DB-polling inside the route handler — so even
 *     the SSE is technically polling under the hood, just driven from
 *     the server, not the client).
 *   - Polling fallback: GET /api/conversations/[id]/messages?limit=50
 *     every 10s if SSE fails (network error / Vercel function timeout).
 *   - Reconnect: only on enable/disable toggle (no aggressive reconnect
 *     because the SSE route itself has 15s heartbeat + graceful
 *     disconnect handling on the server).
 */
export function useRealtimeChat({
  conversationId,
  otherUserId,
  onMessages,
  onConnectionChange,
  enabled = true,
}: UseRealtimeChatOptions) {
  // otherUserId was previously used by the WS typing indicator; post-C3
  // it is intentionally ignored (SSE has no client→server channel).
  // Keep the parameter in the signature so ChatView doesn't have to
  // change its call site, but consume it once here so both lint configs
  // (with-argsIgnorePattern AND without) are satisfied.
  void otherUserId;
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const modeRef = useRef<"sse" | "poll" | null>(null);

  const [connected, setConnected] = useState(false);

  // Sync connected state
  useEffect(() => {
    onConnectionChange?.(connected);
  }, [connected, onConnectionChange]);

  const cleanup = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    modeRef.current = null;
  }, []);

  // ── HTTP polling (last-resort fallback) ────────────────────
  // Used when SSE connection fails (Vercel function timeout, network
  // error). Polls every 10s — slower than SSE (2s), but always works.
  const startPolling = useCallback(() => {
    if (!mountedRef.current || modeRef.current === "poll") return;
    cleanup();
    modeRef.current = "poll";

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`,
        );
        if (!res.ok) {
          queueMicrotask(() => {
            if (mountedRef.current) setConnected(false);
          });
          return;
        }
        const data = await res.json();
        const freshMsgs: MessageData[] = (data.messages ?? []).reverse();
        if (freshMsgs.length > 0) {
          onMessages(freshMsgs);
        }
        queueMicrotask(() => {
          if (mountedRef.current) setConnected(true);
        });
      } catch {
        queueMicrotask(() => {
          if (mountedRef.current) setConnected(false);
        });
      }
    };

    void poll();
    pollRef.current = setInterval(poll, 10_000);
  }, [conversationId, onMessages, cleanup]);

  // ── SSE connection (canonical realtime path) ──────────────
  const connectSse = useCallback(() => {
    if (!mountedRef.current || modeRef.current === "sse") return;
    cleanup();
    modeRef.current = "sse";

    const esUrl = `/api/conversations/${encodeURIComponent(conversationId)}/stream`;

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
        } catch {
          /* ignore malformed payloads */
        }
      };

      es.onerror = () => {
        if (!mountedRef.current) return;
        es.close();
        esRef.current = null;
        modeRef.current = null;
        // Defer setConnected out of the EventSource synchronous error
        // path so react-hooks/set-state-in-effect is satisfied — the
        // state update happens in a microtask, after the current
        // effect-call has unwound.
        queueMicrotask(() => {
          if (!mountedRef.current) return;
          setConnected(false);
          // SSE error → degrade to polling rather than aggressively retrying.
          startPolling();
        });
      };
    } catch {
      if (mountedRef.current) {
        queueMicrotask(() => {
          if (mountedRef.current) startPolling();
        });
      }
    }
  }, [conversationId, onMessages, cleanup, startPolling]);

  // ── Initialize / teardown based on enabled flag ────────────
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      connectSse();
    } else {
      cleanup();
      // Defer setConnected out of the synchronous effect-call scope
      // so react-hooks/set-state-in-effect is satisfied. Without
      // this, eslint-plugin-react-hooks flags the in-effect setState
      // as causing cascading renders. Mirrors the queueMicrotask
      // pattern already used in startPolling/onerror paths above.
      queueMicrotask(() => {
        if (mountedRef.current) setConnected(false);
      });
    }
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connectSse, cleanup]);

  // ── Typing indicator stubs (no WS = no cross-client typing) ─────
  // Pre-C3, typing was forwarded via the WS broker's typing/stopTyping
  // messages. SSE has no client→server channel, so this is intentionally
  // a no-op stub. ChatView calls sendTyping(true/false) on input change;
  // the calls are silent (UI shows the user is "writing") but no remote
  // partner sees an indicator. Acceptable for V1 — can revisit if a
  // /api/conversations/[id]/typing POST endpoint is added later.
  const sendTyping = useCallback((_isTyping: boolean) => {
    // The parameter is intentionally unused (post-C3: WS typing channel
    // removed). `_isTyping` underscore prefix silences no-unused-vars
    // regardless of project lint config; the `void ref` below is a
    // belt-and-braces fallback if the project's `@typescript-eslint`
    // config doesn't honor the underscore convention.
    void _isTyping;
  }, []);

  const resetTypingTimer = useCallback(() => {
    // no-op (post-C3): paired with sendTyping above.
  }, []);

  // Always false post-C3 — typing requires WS which is gone.
  const isOtherTyping = false;

  return { connected, isOtherTyping, sendTyping, resetTypingTimer };
}
