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
 * Singleton EventEmitter shared between the REST API (POST /api/messages)
 * and the WebSocket server (server.ts). Allows real-time message broadcasting
 * without polling the database.
 */
export const messageBroker = new EventEmitter();

/** Event name for new messages. */
export const NEW_MESSAGE = "newMessage";
