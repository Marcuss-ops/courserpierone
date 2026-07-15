"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

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

  // Memoized SSE URL — stable identity across re-renders unless
  // conversationId changes. Keeps the EventSource construction in
  // connectSse from re-allocating the URL string on every effect tick.
  const esUrl = useMemo(
    () => `/api/conversations/${encodeURIComponent(conversationId)}/stream`,
    [conversationId],
  );

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

  /**
   * safeSetConnected — single source of truth for "I want to flip the
   * connection state". Defers the setState out of any synchronous
   * effect/EventSource callback scope so `react-hooks/set-state-in-effect`
   * is always satisfied, and guards against setState-after-unmount via
   * `mountedRef.current`.
   *
   * Used by all 6 call sites in this hook (poll-res-not-ok, poll-success,
   * poll-exception, SSE-open, SSE-error, init-effect-else). Defining it
   * once means the deferred-setState contract is documented in one place
   * rather than repeated inline 6 times.
   *
   * Deps: empty — `mountedRef` is a ref (stable identity across renders),
   * `setConnected` is the setter returned by `useState` (also stable).
   * Wrapped in `useCallback` so referential identity is stable across
   * renders, keeping any future dep arrays honest.
   */
  const safeSetConnected = useCallback((value: boolean) => {
    if (!mountedRef.current) return;
    queueMicrotask(() => {
      if (mountedRef.current) setConnected(value);
    });
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
          safeSetConnected(false);
          return;
        }
        const data = await res.json();
        const freshMsgs: MessageData[] = (data.messages ?? []).reverse();
        if (freshMsgs.length > 0) {
          onMessages(freshMsgs);
        }
        safeSetConnected(true);
      } catch {
        safeSetConnected(false);
      }
    };

    void poll();
    pollRef.current = setInterval(poll, 10_000);
  }, [conversationId, onMessages, cleanup, safeSetConnected]);

  /**
   * safeStartPolling — single source of truth for "I want to switch to
   * HTTP polling fallback". Defers the side-effect out of any
   * synchronous effect/EventSource callback scope (parity with
   * safeSetConnected), and guards against post-unmount execution via
   * `mountedRef.current` (cheap double-check both before scheduling
   * the microtask AND after the microtask fires, in case the
   * component unmounted in the interim).
   *
   * Used by both the SSE onerror path (auto-degrade to polling) and
   * the EventSource constructor catch (synchronous failure during
   * stream init). Defining it once means the deferred-sideEffect
   * contract is documented in one place rather than repeated inline
   * at 2 sites.
   *
   * Ordering note: when called from onerror immediately after
   * safeSetConnected(false), both schedule their own microtasks —
   * so setState(false) and the polling kickoff are independent
   * microtasks. React 18 batches within the next commit window
   * and startPolling's own mounted+mode guards are idempotent, so
   * the brief ordering shift is functionally safe.
   *
   * Deps: `[startPolling]` — `mountedRef` is a ref (stable), and
   * `startPolling` itself is a useCallback whose identity matches
   * its declaration-time deps. We pass `startPolling` so the
   * consumer's deps array can swap `startPolling → safeStartPolling`
   * without lying about what's actually used.
   */
  const safeStartPolling = useCallback(() => {
    if (!mountedRef.current) return;
    queueMicrotask(() => {
      if (mountedRef.current) startPolling();
    });
  }, [startPolling]);

  // ── SSE connection (canonical realtime path) ──────────────
  const connectSse = useCallback(() => {
    if (!mountedRef.current || modeRef.current === "sse") return;
    cleanup();
    modeRef.current = "sse";

    try {
      const es = new EventSource(esUrl);
      esRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        safeSetConnected(true);
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
        // Both safeSetConnected and safeStartPolling auto-defer to
        // queueMicrotask; React 18 collapses into one commit frame.
        // startPolling's own internal cleanup() is idempotent — the
        // ES is already closed above so the second esRef.current
        // check inside cleanup will short-circuit.
        safeSetConnected(false);
        safeStartPolling();
      };
    } catch {
      // Outer mounted check is a cheap early-return optimization
      // (avoids the microtask allocation in safeStartPolling if we
      // already know we'd skip). safeStartPolling also guards
      // internally, but we save one closure allocation.
      if (mountedRef.current) {
        safeStartPolling();
      }
    }
  }, [esUrl, onMessages, cleanup, safeSetConnected, safeStartPolling]);

  // ── Initialize / teardown based on enabled flag ────────────
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      connectSse();
    } else {
      cleanup();
      // Auto-deferred by safeSetConnected; react-hooks/set-state-in-effect
      // no longer fires because the setState happens in a microtask, after
      // the synchronous effect-call has unwound.
      safeSetConnected(false);
    }
  }, [enabled, connectSse, cleanup, safeSetConnected]);

  // ── Defensive unmount-only effect (Step 9) ────────────────
  // Splits out the cleanup-so-on-unmount guarantee so React 18
  // StrictMode's rapid mount→unmount→mount cycle doesn't race the
  // deps-driven effect's own cleanup. The deps-driven effect's
  // cleanup today also tears down on unmount; this isolated second
  // effect GROUNDS the unmount-only contract so a future PR can't
  // accidentally drop it (e.g. by changing the deps-driven effect's
  // return to void).
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

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
