/**
 * src/lib/notifications/create-notification.ts
 *
 * Server-side helper per la creazione di una Notification + check delle
 * NotificationPreference dell'utente target.
 *
 * Triggers V1 (vedi schema.prisma Notification.type):
 *   - chat_reply         — fired from createMessageAndNotify (auto)
 *   - new_lesson/course  — fired from /api/admin/notifications/broadcast (manual)
 *   - system_admin       — fired from /api/admin/notifications/broadcast (manual)
 *
 * Convenzioni:
 *   - `recipientId` è l'utente che RICEVE la notifica (mai il sender).
 *   - Se `recipientId` non ha NotificationPreference, ne viene creata
 *     una con tutti i default = true (first-write-wins; idempotente).
 *   - Se i preference disabilitano la delivery (es. inappChatReply=false
 *     per una chat_reply), l'helper NON skappa la INSERT ma logga
 *     un warning e restituisce null — così le webhooks future possano
 *     diagnosticare perché una notifica non è stata consegnata.
 *   - `entityId` è una STRINGA polimorfica (messageId, lessonId, ecc.):
 *     serve a evitare JOIN nella dropdown. Validazione type/length la
 *     facciamo in create-notification invece che in Prisma.
 *
 * Performance: 2 SELECT (pref + sender opts) + 1 INSERT (notification)
 * + 1 WS broker emit se il WS broker è disponibile. Per V1 il WS
 * notifications/stream non è ancora implementato: client polla
 * /api/notifications ogni 30s. (Fase futura: subscription WS dedicata
 * /ws?scope=notifications mirror di inbox.)
 */
import { prisma } from "@/lib/db/prisma";

/** Tipologie di notifica supportate — vincolo applicativo (non Prisma enum). */
export const NOTIFICATION_TYPES = [
  "chat_reply",
  "new_lesson",
  "new_course",
  "lesson_update",
  "course_update",
  "system_admin",
  "community_reply",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Mappa type → preference key (inapp). Per type futuri non mappati: default = true. */
const TYPE_TO_INAPP_PREF: Record<string, keyof NotifPrefShape | null> = {
  chat_reply: "inappChatReply",
  new_lesson: "inappNewLesson",
  lesson_update: "inappNewLesson", // reuse same channel opt-in
  new_course: "inappNewLesson",
  course_update: "inappNewLesson",
  community_reply: "inappCommunityReply",
  // system_admin: null → sempre consentito (annuncio admin)
};

// NOTE: type → email-preference key mapping reserved per il futuro email
// digest pipeline (V1 le email di DM sono inviate direttamente via
// sendDmNotificationEmail dentro createMessageAndNotify). Definire il
// contratto qui ora è inutile perché TYPE_TO_EMAIL_PREF non è letto da
// nessuna call site attuale — sarà aggiunto quando /api/admin/notifications/
// broadcast inizierà a spedire digest email. (Vedere docs/phase-X per
// roadmap digest.)

interface NotifPrefShape {
  emailNewLesson: boolean;
  emailCommunityReply: boolean;
  inappChatReply: boolean;
  inappNewLesson: boolean;
  inappCommunityReply: boolean;
}

export interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  entityId: string;
  title: string;
  body?: string;
  link?: string;
  /** Stable outbox event ID used to prevent duplicate notifications on replay. */
  outboxEventId?: string;
  /** Outbox delivery uses this to preserve infrastructure failures for retry. */
  throwOnError?: boolean;
}

export interface CreatedNotification {
  id: string;
  userId: string;
  type: string;
  entityId: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string; // ISO per JSON-safety
}

/**
 * Get-or-create della NotificationPreference. Defaults = all-on (Prisma
 * `@default(true)` sui Boolean fields). Atomic via upsert (UNIQUE su
 * userId): evita P2002 race quando due request concorrenti trovano
 * `findUnique → null` simultaneamente. `update: {}` = idempotente
 * sull'esistente (non sovrascrive mai le scelte utente qui).
 */
async function getOrCreatePreference(userId: string): Promise<NotifPrefShape> {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId }, // @default(true) applica a tutti i Boolean
    update: {},
    select: {
      emailNewLesson: true,
      emailCommunityReply: true,
      inappChatReply: true,
      inappNewLesson: true,
      inappCommunityReply: true,
    },
  });
}

/**
 * Crea una Notification dopo aver checkato le preferenze di delivery.
 *
 * Returns: CreatedNotification (serializzato) | null (se soppressa dai prefs).
 * NB: null è un valore legale: significa "user opted out, niente INSERT".
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<CreatedNotification | null> {
  if (!NOTIFICATION_TYPES.includes(input.type)) {
    console.error(
      `[notif] invalid type '${input.type}'. Expected one of:`,
      NOTIFICATION_TYPES,
    );
    return null;
  }
  if (!input.entityId || typeof input.entityId !== "string") {
    console.error("[notif] missing entityId — skipping");
    return null;
  }
  if (!input.title || input.title.length > 200) {
    console.error("[notif] title missing or too long (>200 chars)");
    return null;
  }

  const prefs = await getOrCreatePreference(input.recipientId);

  // Check inapp preference (system_admin bypassa i prefs).
  const inappPrefKey = TYPE_TO_INAPP_PREF[input.type];
  if (inappPrefKey !== null) {
    const allowed = prefs[inappPrefKey];
    if (!allowed) {
      console.warn(
        `[notif] user ${input.recipientId} opted out of inapp ${input.type} — skipping`,
      );
      return null;
    }
  }

  try {
    const created = await prisma.notification.create({
      data: {
        userId: input.recipientId,
        type: input.type,
        entityId: input.entityId,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        outboxEventId: input.outboxEventId ?? null,
      },
      select: {
        id: true,
        userId: true,
        type: true,
        entityId: true,
        title: true,
        body: true,
        link: true,
        read: true,
        createdAt: true,
      },
    });

    // TODO Fase futura: aggiungere un endpoint
    // `GET /api/notifications/stream` SSE se il polling 30s diventa
    // insufficiente (molti utenti attivi). Pre-C3 questo hook avrebbe
    // emesso messageBroker.emit per aggiornare una subscription WS
    // dedicata `/ws?scope=notifications` — la WS infra è stata rimossa in
    // cleanup C3 quindi l'unica opzione oggi è un SSE canonico. V1 il
    // client polla /api/notifications ogni 30s dal NotificationBell.

    return {
      ...created,
      createdAt: created.createdAt.toISOString(),
    };
  } catch (err) {
    // Legacy callers keep the fail-soft behavior; durable outbox delivery
    // opts into propagation so the processor can retry/dead-letter it.
    console.error("[notif] create failed:", err);
    if (input.throwOnError) throw err;
    return null;
  }
}

/**
 * Helper di invio "system_admin" per gli admin che vogliono fare
 * broadcast a tutti gli utenti attivi (o subset per productId).
 *
 * Returns: {sent: number, skipped: number} per feedback admin UI.
 */
export async function broadcastNotification(
  recipients: string[],
  payload: Omit<CreateNotificationInput, "recipientId">,
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  for (const recipientId of recipients) {
    if (!recipientId) {
      skipped += 1;
      continue;
    }
    const result = await createNotification({ ...payload, recipientId });
    if (result) {
      sent += 1;
    } else {
      skipped += 1;
    }
  }
  return { sent, skipped };
}
