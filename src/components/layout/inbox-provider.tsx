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

const BROADCAST_CHANNEL_NAME = "courser-inbox";

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

  const channelRef = useRef<BroadcastChannel | null>(null);
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
    setTotalUnread((prev) => Math.max(0, prev - (byConversation[conversationId] ?? 0)));

    // Sincronizza con altre tab della stessa app via BroadcastChannel.
    // È una API nativa del browser, zero overhead, no socket.
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channelRef.current?.postMessage({
          type: "messagesRead",
          conversationId,
        });
      } catch {
        /* BroadcastChannel non disponibile (SSR/test): skip */
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
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        channelRef.current = channel;
        channel.onmessage = (event) => {
          if (!mountedRef.current) return;
          const data = event.data as { type?: string; conversationId?: string };
          if (data.type === "messagesRead" && data.conversationId) {
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
      } catch {
        /* BroadcastChannel non disponibile */
      }
    }

    return () => {
      mountedRef.current = false;
      if (channelRef.current) {
        try {
          channelRef.current.close();
        } catch {
          /* ignore */
        }
        channelRef.current = null;
      }
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
