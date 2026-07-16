"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * InboxProvider — global client-side store per il badge "non letti".
 *
 * C3 cleanup (post-deletion of server.ts + src/lib/ws/* + ws-token): il
 * WS user-scoped inbox subscription è stato rimosso. Il consumer
 * surface (useInbox hook + Context + markRead) resta invariato, ma
 * `totalUnread` / `byConversation` ora evolve SOLO:
 *   1. al primo paint via SSR (props `initialTotalUnread` +
 *      `initialByConversation` dal server-rendered layout);
 *   2. localmente quando l'utente marca una conversation read
 *      (markRead) → BroadcastChannel "messagesRead" mantiene le tab
 *      sincronizzate.
 * Il badge NON si auto-incrementa in realtime per i messaggi che
 * arrivano mentre l'utente è su un'altra pagina — quella UX era
 * pilotata dal WS ormai rimosso. Il polling di `useInbox()` (future
 * V2: endpoint `GET /api/notifications/recent-unread-by-conversation`
 * refreshato ogni 30s) può reintroduire un polling leggero; per V1 ci
 * accontentiamo del refresh-on-navigation.
 */



type InboxConversationState = Record<string, number>;

interface InboxContextValue {
  totalUnread: number;
  byConversation: InboxConversationState;
  /** Decrementa il contatore di una conversation (chiamato dopo PATCH /read). */
  markRead: (conversationId: string) => void;
  /** Connessione WS attiva (per eventuali UI indicators). */
  isConnected: boolean;
}

const InboxContext = createContext<InboxContextValue | null>(null);

interface InboxProviderProps {
  /** Valore SSR iniziale per `totalUnread` (server-renderizza il badge al primo paint). */
  initialTotalUnread: number;
  /** Mappa SSR iniziale per per-conversation count. */
  initialByConversation?: InboxConversationState;
  /** Disabilita la subscription WS (es. test/preview). */
  enabled?: boolean;
  children: React.ReactNode;
}

// Dual-listen during the 30-day brand migration window (ADR-0015 §Migration
// plan commit 3): receive on BOTH old + new channel names so cross-tab
// sync continues to work for users with mixed-version tabs (rolling deploy).
// Publish on both too so the old tab can still hear the new one. After
// the migration window closes (target: 2026-08-15), drop the legacy
// "courssy-inbox" entries and tighten the array to a single name.
const BROADCAST_CHANNEL_NAMES = ["courssy-inbox", "courssy-inbox"] as const;

export function InboxProvider({
  initialTotalUnread,
  initialByConversation = {},
  enabled = true,
  children,
}: InboxProviderProps) {
  const [totalUnread, setTotalUnread] = useState<number>(initialTotalUnread);
  const [byConversation, setByConversation] =
    useState<InboxConversationState>(initialByConversation);
  const [isConnected] = useState<boolean>(false);

  const channelsRef = useRef<BroadcastChannel[]>([]);
// Dedup tokens for dual-publish (Step 3 of ADR-0015 rename): when the same
// tab publishes on BOTH 'courssy-inbox' and 'courssy-inbox' for cross-tab
// sync, sibling tabs receive two messages with identical logical meaning.
// Without dedupe, setTotalUnread would decrement twice for a single
// markRead event (e.g., total=5 would go 5→4→3 instead of 5→4). Each
// publish call generates a per-markRead `token` and reuses it on BOTH
// channels; siblings dedupe by `seenTokensRef`. The Set is capped at 100
// with sliding-window trim (most-recent 50 retained) so long-running tabs
// don't leak memory — 50 dedupe keys covers a workload of dozens of
// marks-per-second sustained, and stale entries evict naturally.
const seenTokensRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef<boolean>(true);

  // ── markRead: dispatch locale + BroadcastChannel per altre tab ────
  const markRead = useCallback((conversationId: string) => {
    setByConversation((prev) => {
      const cur = prev[conversationId] ?? 0;
      if (cur <= 0) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    setTotalUnread((prev) => Math.max(0, prev - (byConversation[conversationId] ?? 0)));    // Sincronizza con altre tab della stessa app via BroadcastChannel.
    // È una API nativa del browser, zero overhead, no socket.
    if (typeof BroadcastChannel !== "undefined") {
      // Dual-publish during the 30-day migration window (ADR-0015
      // migration plan, target close: 2026-08-15): post on BOTH
      // old ("courssy-inbox") and new ("courssy-inbox") so that legacy
      // tabs (still on the pre-rename build) continue to hear the
      // "messagesRead" event and drop their local unread counter. Use a
      // single shared `token` per logical markRead action; siblings
      // dedupe both channels via seenTokensRef (see comment above).
      const token =
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      for (const channel of channelsRef.current) {
        try {
          channel.postMessage({
            type: "messagesRead",
            conversationId,
            token,
          });
        } catch {
          /* BroadcastChannel chiuso durante teardown: skip */
        }
      }
    }
  }, [byConversation]);

  // ── C3: WS inbox subscription removed ────────────────────────────
  // The previous WS subscription block (Fase 4.3) was deleted along
  // with server.ts + src/lib/ws/* + /api/auth/ws-token. The Consumer
  // Context + BroadcastChannel cross-tab sync remain (below).
  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || typeof window === "undefined") {
      return;
    }

    // ── BroadcastChannel listener per cross-tab mark-read sync ──
    // Dual-subscribe: opens a listener on each name in BROADCAST_CHANNEL_NAMES
    // (legacy + canonical). Both listeners feed the same handler, so
    // a "messagesRead" event from either channel triggers the same
    // decrement. After the 30-day migration window, drop the legacy name.
    if (typeof BroadcastChannel !== "undefined") {
      const channels: BroadcastChannel[] = [];
      for (const name of BROADCAST_CHANNEL_NAMES) {
        try {
          const channel = new BroadcastChannel(name);
          channel.onmessage = (event) => {
            if (!mountedRef.current) return;
            const data = event.data as {
              type?: string;
              conversationId?: string;
              token?: string;
            };
            if (data?.type === "messagesRead" && data.conversationId) {
              // Dedupe identical logical events arriving on both
              // channels (see seenTokensRef declaration above). Cap the
              // Set at 100, sliding-trim to 50 stale entries to keep
              // long-running tabs bounded.
              if (data.token) {
                if (seenTokensRef.current.has(data.token)) return;
                seenTokensRef.current.add(data.token);
                if (seenTokensRef.current.size > 100) {
                  const arr = Array.from(seenTokensRef.current);
                  seenTokensRef.current = new Set(arr.slice(-50));
                }
              }
              setByConversation((prev) => {
                const cur = prev[data.conversationId!] ?? 0;
                if (cur <= 0) return prev;
                const next = { ...prev };
                delete next[data.conversationId!];
                return next;
              });
              setTotalUnread((prev) => Math.max(0, prev - 1));
            }
          };
          channels.push(channel);
        } catch {
          /* BroadcastChannel non disponibile per questo canale: skip */
        }
      }
      channelsRef.current = channels;
    }

    return () => {
      mountedRef.current = false;
      for (const channel of channelsRef.current) {
        try {
          channel.close();
        } catch {
          /* ignore */
        }
      }
      channelsRef.current = [];
    };
  }, [enabled]);

  const value = useMemo<InboxContextValue>(
    () => ({
      totalUnread,
      byConversation,
      markRead,
      isConnected,
    }),
    [totalUnread, byConversation, markRead, isConnected],
  );

  return (
    <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
  );
}

export function useInbox(): InboxContextValue | null {
  return useContext(InboxContext);
}
