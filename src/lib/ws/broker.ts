import { EventEmitter } from "events";

/**
 * Message payload emitted when a new message is created via REST API.
 *
 * Phase 1.3: `productId` è parte del payload così che il bridge
 * WebSocket (server.ts) possa filtrare i destinatari per conversazione:
 * solo i WS sottoscritti alla stessa tripla (userOne, userTwo, productId)
 * riceveranno i newMessage, eliminando il data-leak cross-prodotto che
 * era presente prima della Fase 1.3.
 *
 * Phase 4.3: `receiverId` identifica l'**altro partecipante** (il partner
 * che NON è il sender). Questo consente al bridge di fan-out l'evento
 * anche al "inbox WS" user-scoped del receiver: il client che NON sta
 * guardando attivamente la conversation riceve comunque un `inboxUpdate`
 * per aggiornare il badge "non letti" senza refresh della pagina.
 *
 * Contract:
 *   - senderId = colui che HA inviato il messaggio (= message.senderId)
 *   - receiverId = colui che DEVE ricevere la notifica inbox (= partner)
 *   - Per i DM uno-a-uno, receiverId è l'altro partecipante della Conversation.
 */
export interface NewMessageEvent {
  conversationId: string;
  productId: string;
  /**
   * Fase 4.3: ID dell'*altro* partecipante (NON il sender). Usato dal
   * bridge per aggiornare l'inbox WS del destinatario. Sempre valorizzato
   * se la conversation ha esattamente due partecipanti.
   */
  receiverId: string;
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    read: boolean;
    createdAt: string; // ISO
    sender: {
      id: string;
      name: string | null;
      image: string | null;
      role: string;
    };
  };
}

/**
 * Payload emitted when a conversation is hard-deleted via DELETE
 * `/api/conversations/[id]` (Phase 2.3).
 *
 * Contratto:
 *   - `conversationId` = ID della Conversation appena cancellata.
 *   - `userOneId` / `userTwoId` = i due partecipanti storici della
 *     Conversation. Servono al bridge WS per fare fan-out a ENTRAMBI
 *     i canali inbox subscription (non auto-skip: anche il deleter deve
 *     ricevere il `threadDeleted` per chiudere la propria UI se sta
 *     guardando il thread via SSE/WS). Per ragioni di membership
 *     storica continuiamo a includerli qui anche se la Conversation
 *     non esiste più — sono i "precedenti partecipanti noti al server".
 *
 * Policy di re-OPEN: dopo hard-delete, la successiva POST
 * `/api/conversations` (Fase 2.2) per la stessa coppia+prodotto crea
 * una NUOVA row (l'unique `@@unique([userOneId, userTwoId, productId])`
 * non matcha row assenti). Questo è un side-channel: il WS event qui
 * aiuta il client a ripulire lo stato locale, ma il "resurrection"
 * è puramente DB-driven tramite upsert.
 */
export interface ThreadDeletedEvent {
  conversationId: string;
  userOneId: string;
  userTwoId: string;
}

/**
 * Singleton EventEmitter shared between the REST API (POST /api/messages)
 * and the WebSocket server (server.ts). Allows real-time message broadcasting
 * without polling the database.
 */
export const messageBroker = new EventEmitter();

/** Event name for new messages. */
export const NEW_MESSAGE = "newMessage";

/**
 * Event name for thread deletion (Phase 2.3).
 *
 * Emesso da `DELETE /api/conversations/[id]` dopo che la row Conversation
 * è stata eliminata (CASCADE: anche tutti i Message associati). Il bridge
 * in `server.ts` lo cattura ed esegue fan-out a:
 *   1. WS subscribed a `subscribedConversations[conversationId]`
 *      (la vista chat attiva) — entrambi i partecipanti.
 *   2. WS subscribed a `inboxClients[userOneId]` UNION
 *      `inboxClients[userTwoId]` (la vista inbox dell'altro partecipante).
 *
 * NB: NON chiamiamo `authorizeDmRequest` sul DELETE — l'utente che chiude
 * è per definizione membro della Conversation, quindi la membership check
 * è sufficiente. Vedi JSDoc di `src/app/api/conversations/[id]/route.ts`.
 */
export const THREAD_DELETED = "threadDeleted";
