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
 * Fase 4.3: InboxProvider — global client-side store per il badge
 * "non letti" realtime.
 *
 * Cosa fa:
 *   1. Apre UN WebSocket user-scoped verso `/ws?token=...&scope=inbox`
 *      (HMAC firmato da `/api/auth/ws-token?scope=inbox`).
 *   2. Quando riceve `{type:"inboxUpdate", conversationId, message}`:
 *      incrementa `totalUnread` e incrementa `byConversation[convId]`.
 *   3. Espone `useInbox()` hook a `NotificationsDropdown`,
 *      `MobileBottomNav`, `ConversationList` per renderizzare i badge
 *      in realtime (NO refresh di pagina necessario).
 *   4. Espone `markRead(convId)` che decrementa localmente + manda
 *      via BroadcastChannel "messagesRead" event per sincronizzare
 *      eventuali altre tab aperte (in modo che un'azione di PATCH
 *      /api/messages/read in una tab non lasci le altre stale). (legacy removed in chore(dm): cfb2d12)
 *
 * Architettura (ssegue Fase 4.3 = Option A del thinker):
 *   - Server: `inboxClients: Map<userId, Set<WebSocket>>` in server.ts.
 *     Bridge NEW_MESSAGE fa fan-out a inboxClients[event.receiverId].
 *   - Client: questo provider è montato UNA volta per pagina
 *     dashboard, e tutti i consumer si agganciano via `useInbox()`.
 *   - SSR-safe: totalUnread è inizializzato con il valore SSR computed
 *     sul server (vedi `initialTotalUnread` prop). Stato locale-
 *     client evolve solo dopo WS events.
 *
 * Self-skip: il server garantisce che l'inboxUpdate NON arriva al
 * sender (vedi `event.receiverId` vs senderId). Quindi lato client
 * non serve filtrare ulteriormente.
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

interface InboxUpdateMessage {
  type: "inboxUpdate";
  conversationId: string;
  message: {
    id: string;
    senderId: string;
    [k: string]: unknown;
  };
}

const WS_RECONNECT_DELAY_MS = 2000;
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
  const [isConnected, setConnected] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // ── WS inbox subscription ────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const openWs = async () => {
      if (!mountedRef.current) return;
      try {
        // Fase 4.3: token firmato HMAC `userId:inbox:timestamp`.
        const tokenRes = await fetch("/api/auth/ws-token?scope=inbox");
        if (!tokenRes.ok) return;
        const { token } = await tokenRes.json();

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host;
        const ws = new WebSocket(
          `${protocol}//${host}/ws?token=${encodeURIComponent(token)}&scope=inbox`,
        );
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setConnected(true);
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const data = JSON.parse(event.data) as InboxUpdateMessage;
            if (data.type !== "inboxUpdate" || !data.conversationId) return;
            // Skip self: per design il server non invia inboxUpdate al
            // sender via fan-out su inboxClients[event.receiverId], ma
            // difesa in profondità nel client.
            // (non abbiamo qui currentUserId; rimandiamo al futuro se serve).

            setTotalUnread((prev) => prev + 1);
            setByConversation((prev) => ({
              ...prev,
              [data.conversationId]: (prev[data.conversationId] ?? 0) + 1,
            }));
          } catch {
            /* payload non valido: ignora */
          }
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          setConnected(false);
          wsRef.current = null;
          // Reconnect dopo breve delay (no exponential backoff per V1).
          reconnectRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            void openWs();
          }, WS_RECONNECT_DELAY_MS);
        };

        ws.onerror = () => {
          // ws.onerror è seguito da ws.onclose che gestisce il reconnect.
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        };
      } catch {
        // Fetch token fallito: probabilmente utente non autenticato.
        // Nessun reconnect fino a navigation successiva.
      }
    };

    void openWs();

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
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
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
