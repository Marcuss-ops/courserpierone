import { EventEmitter } from "events";

/** Message payload emitted when a new message is created via REST API. */
export interface NewMessageEvent {
  conversationId: string;
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
