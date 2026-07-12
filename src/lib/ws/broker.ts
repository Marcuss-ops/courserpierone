import { EventEmitter } from "events";

/**
 * Message payload emitted when a new message is created via REST API.
 *
 * Phase 1.3: `productId` è parte del payload così che il bridge
 * WebSocket (server.ts) possa filtrare i destinatari per conversazione:
 * solo i WS sottoscritti alla stessa tripla (userOne, userTwo, productId)
 * riceveranno i newMessage, eliminando il data-leak cross-prodotto che
 * era presente prima della Fase 1.3.
 */
export interface NewMessageEvent {
  conversationId: string;
  productId: string;
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
