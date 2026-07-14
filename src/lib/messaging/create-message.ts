/**
 * src/lib/messaging/create-message.ts
 *
 * Helper per la creazione di un nuovo Message in una Conversation
 * esistente con side-effects coordinati (WS broker emit + offline
 * email notification).
 *
 * Fase 2.3: estratto da `/api/messages POST` per essere riusato da (legacy removed in chore(dm): cfb2d12)
 * `/api/conversations/[id]/messages POST`. Separa "persistenza +
 * orchestrazione" dalle route handlers sottili. La logica è
 * IDENTICA a quella già presente in `/api/messages POST` Fase 1.6: (legacy removed in chore(dm): cfb2d12)
 *   1. sanitizeHtml(content.trim()) — XSS-safe prima del persist.
 *   2. prisma.message.create with sender join
 *   3. messageBroker.emit(NEW_MESSAGE, { conversationId, productId,
 *      receiverId=partnerId, message: {...} }) per fan-out WS.
 *   4. Se receiver è offline (lastSeenAt > 5min fa) E
 *      conversation ha ≤ 1 unread NON-self → fire
 *      `sendDmNotificationEmail` (cooldown anti-spam).
 *
 * Convenzioni:
 *   - Il sender è colui che chiama POST (l'API request body claims so).
 *   - `partnerId` è derivato dal chiamante (via `loadAuthorizedConversation`)
 *     perché la Conversation passata qui è già stata validata.
 *   - L'email locale è hardcoded "en" (vedi Fase 5 del piano DMs per
 *     derivare dal dbUser.locale). Per V1 non è bloccante.
 *
 * Performance: una INSERT + un broker.emit (sync) + opzionale un
 * SELECT count + opzionale un SMTP call. Nessun N+1.
 */

import { prisma } from "@/lib/db/prisma";
import { sanitizeHtml } from "@/lib/utils/sanitize";
import { messageBroker, NEW_MESSAGE } from "@/lib/ws/broker";
import { sendDmNotificationEmail } from "@/lib/services/email";
import { createNotification } from "@/lib/notifications/create-notification";

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

export interface CreateMessageInput {
  /** Conversation authorizzata (post `loadAuthorizedConversation`). */
  conversation: { id: string; productId: string };
  /** L'utente che sta inviando (sender del messaggio). */
  sender: {
    id: string;
    name: string | null;
    email: string | null;
  };
  /** L'altro partecipante (per WS receiverId + email notification). */
  partnerId: string;
  /** Testo del messaggio (già trimmed e validato 1 ≤ len ≤ 5000). */
  content: string;
}

export interface CreatedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  read: boolean;
  createdAt: string; // ISO string per JSON serialization
  sender: {
    id: string;
    name: string | null;
    image: string | null;
    role: string;
  };
}

/**
 * Crea il Message, emette l'evento WS, e (opzionalmente) invia notifica
 * email offline al partner.
 *
 * Restituisce la CreatedMessage serializzabile (createdAt ISO string).
 * NB: createdAt è ISO perché attraversa il WS broker e arriva al client;
 * tenerlo Date qui costringerebbe ogni consumer a riconvertire.
 *
 * Error handling: throws Prisma errors verso il caller che farà
 * apiErrorResponse wrapper nella route. V1: nessun retry automatico.
 */
export async function createMessageAndNotify(
  input: CreateMessageInput,
): Promise<CreatedMessage> {
  const { conversation, sender, partnerId, content } = input;

  // ── 1. Persist message ─────────────────────────────────────
  const created = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: sender.id,
      // sanitizeHtml rimuove tag pericolosi ma mantiene quelli safe
      // (b/i/em/strong/br/p/ul/ol/li/a/code/pre/blockquote + h1-h6).
      content: sanitizeHtml(content.trim()),
    },
    include: {
      sender: {
        select: { id: true, name: true, image: true, role: true },
      },
    },
  });

  // ── 2. WS broker emit (real-time fan-out) ──────────────────
  // Fase 4.3: includiamo `receiverId` (= partner). Il bridge WS
  // (server.ts) usa questo campo per due fan-out:
  //   (a) per-conversation: WS subscribed a subscribedConversations
  //       [conversationId] ricevono `{type:"newMessage"}`
  //   (b) inbox user-scoped: WS subscribed a inboxClients[receiverId]
  //       ricevono `{type:"inboxUpdate", conversationId, message}`
  //       per aggiornare badge "non letti" senza page refresh.
  //
  // Per i DM uno-a-uno, partnerId = receiverId = l'unico altro membro.
  messageBroker.emit(NEW_MESSAGE, {
    conversationId: conversation.id,
    productId: conversation.productId,
    receiverId: partnerId,
    message: {
      ...created,
      createdAt: created.createdAt.toISOString(),
    },
  });

  // ── 2.5 In-app notification (Centro Notifiche bell) ─────
  // Fire-and-forget: il partner riceverà una riga in `Notification`
  // con type="chat_reply". La campanella (NotificationBell in
  // CourseTopNav) la mostrerà al prossimo poll di 30s (V1: niente
  // WS notifications stream — solo REST GET /api/notifications.
  // Quando il partner NON ha inappChatReply=true, createNotification
  // logga warning e skappa l'INSERT. NB: questo è un effetto diverso
  // dall'email offline (che usa lastSeenAt + unreadCount cooldown):
  //   • Notification→ campanella in-app (persistito, badge realtime)
  //   • email       → fallback email quando partner è offline da ≥5min
  // Le due sono indipendenti e complementari.
  try {
    const senderName =
      sender.name?.trim() ||
      sender.email?.split("@")[0] ||
      "Uno studente";
    const snippet = content.trim().slice(0, 80);
    await createNotification({
      recipientId: partnerId,
      type: "chat_reply",
      entityId: created.id,
      title: `${senderName} — nuovo messaggio`,
      body: snippet || "(messaggio vuoto)",
      // V1: la campanella è solo notification feed — il click naviga via
      // courseAreaHref al /chat (non deep-link alla singola conversation).
      link: undefined,
    });
  } catch (err) {
    // Non bloccare il flusso se la INSERT notifica fallisce
    console.error("[dm-notif] createNotification failed:", err);
  }

  // ── 3. Offline email notification (best-effort) ────────────
  // Solo se il partner è offline (lastSeenAt mancante o > 5 min fa) E
  // il numero di unread NON-self in questa conversation è ≤ 1
  // (cooldown anti-spam: se il partner ha già 5 unread, non vale la
  // pena una nuova email).
  await maybeNotifyOfflinePartner({
    conversationId: conversation.id,
    senderId: sender.id,
    senderName: sender.name || sender.email?.split("@")[0] || "Uno studente",
    partnerId,
  });

  return {
    ...created,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * Helper interno: controlla lastSeenAt del partner + unread count,
 * e fire-and-forget l'email se eleggibile.
 *
 * NB: questo helper NON logga gli errori di `sendDmNotificationEmail`
 * (è lo stesso comportamento di /api/messages POST).
 */
async function maybeNotifyOfflinePartner({
  conversationId,
  senderId: _senderId,
  senderName,
  partnerId,
}: {
  conversationId: string;
  senderId: string;
  senderName: string;
  partnerId: string;
}): Promise<void> {
  const partner = await prisma.user.findUnique({
    where: { id: partnerId },
    // Phase 1.2 addendum: include preferredLocale per le email di DM
    // notification localizzate. Fallback a "en" se null (shouldn't
    // happen post-migration @default("en"), ma difensivo).
    select: { email: true, lastSeenAt: true, preferredLocale: true },
  });
  if (!partner) return; // sanity; non dovrebbe accadere dopo il membership precheck

  // Bug-fix: chi NON ha mai visto il sito (`lastSeenAt == null`) È
  // offline di default. La vecchia formula `!= null && > threshold`
  // escludeva erroneamente gli utenti mai-connessi dall'invio di
  // notifiche email. Bug pre-esistente anche in `/api/messages POST`
  // Fase 1.6 — la Fase 2.3 helper lo corregge opportunisticamente.
  const isOffline =
    partner.lastSeenAt == null ||
    Date.now() - partner.lastSeenAt.getTime() > OFFLINE_THRESHOLD_MS;
  if (!isOffline || !partner.email) return; // niente email se online o mancante email

  const unreadCount = await prisma.message.count({
    where: {
      conversationId,
      senderId: { not: partnerId }, // unread non-self
      read: false,
    },
  });

  // Cooldown: solo il PRIMO unread della conversation genera una
  // email. Le successive sarebbero spam.
  if (unreadCount <= 1) {
    sendDmNotificationEmail(
      partner.email,
      senderName,
      // Phase 1.2 addendum: usa receiver.preferredLocale invece
      // dell'hardcoded "en". Fallback "en" per backward compat con
      // account legacy null (shouldn't happen post-migration).
      partner.preferredLocale ?? "en",
    ).catch((err) =>
      console.error("[dm-email] Failed to send:", err),
    );
  }
}
