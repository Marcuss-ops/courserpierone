/**
 * src/lib/messaging/find-or-create-conversation.ts
 *
 * Helper per la creazione idempotente delle Conversation del piano DMs.
 *
 * Fase 2.2: estratto da `/api/messages/route.ts` (Fase 1.6) per essere
 * riusato anche da `/api/conversations/route.ts`. La duplicazione
 * dell'helper inline era un debito segnalato dal reviewer: la logica
 * di canonicalizzazione dell'ordinamento [userOneId, userTwoId] è
 * ora in un solo punto.
 *
 * Canonicalizzazione: ordinamento lessicografico di [userId,
 * otherUserId] → userOneId = min, userTwoId = max. Questo garantisce
 * che la chiave composita `@@unique([userOneId, userTwoId, productId])`
 * funzioni correttamente a prescindere dall'ordine con cui i due ID
 * arrivano al chiamante. (Fase 1.3 / schema Conversation.)
 *
 * Concurrency: `findOrCreateConversation` usa `prisma.conversation.upsert`
 * con la composite unique invece di `findUnique` + `create`. Postgres
 * traduce `upsert` in `INSERT ... ON CONFLICT (key) DO UPDATE SET ...`
 * (atomico al livello DB). La versione precedente (`findUnique` +
 * `create`) aveva una race-condition: due richieste parallele per la
 * stessa coppia-prodotto vedevano entrambe "not exists" e la seconda
 * `create` falliva con P2002. L'`upsert` elimina questa classe di bug
 * ed è la fonte canonica per qualsiasi apertura/ri-apertura inbox.
 *
 * Convenzione di naming (allineata a fase 1.3):
 *   "creator" = User.id === Product.creatorId
 *   "studente" = l'utente che ha acquistato il prodotto
 *   Gli helper qui NON applicano nessun check autorizzativo:
 *   i chiamanti devono passare da `authorizeDmRequest` (Fase 1.6)
 *   PRIMA di chiamare `findOrCreateConversation`. La separazione tra
 *   "autorizzazione" e "persistenza" è parte del contratto.
 */

import { prisma } from "@/lib/db/prisma";

/**
 * Cerca una conversazione esistente tra due utenti per un dato prodotto.
 * L'ordine (userOneId, userTwoId) può essere either way — risolviamo
 * con un OR pair nella WHERE clause.
 *
 * Usato da GET /api/messages per verificare se esiste già una
 * conversazione tra me e il partner su quel prodotto.
 */
export async function findConversation(
  userId: string,
  otherUserId: string,
  productId: string,
) {
  const [minId, maxId] = [userId, otherUserId].sort();

  return prisma.conversation.findFirst({
    where: {
      productId,
      OR: [
        { userOneId: minId, userTwoId: maxId },
        { userOneId: maxId, userTwoId: minId },
      ],
    },
  });
}

/**
 * Atomically finds or creates a conversation between two users scoped
 * to a product.
 *
 * Implementation: `prisma.conversation.upsert` con la chiave composita
 * canonica `(userOneId=min, userTwoId=max, productId)`. Race-safe per
 * definizione (Postgres `INSERT ... ON CONFLICT DO UPDATE`).
 *
 * DA USARE DOPO aver passato `authorizeDmRequest` (Fase 1.6 single
 * source of truth). Questa funzione NON esegue nessun check autorizzativo.
 *
 * La Conversation restituita è sempre popolata con la canonical pair
 * (min, max). Il chiamante, se vuole identificare il partner, deve
 * confrontare `userOneId === me` o `userTwoId === me`.
 */
export async function findOrCreateConversation(
  userId: string,
  otherUserId: string,
  productId: string,
) {
  const [minId, maxId] = [userId, otherUserId].sort();

  return prisma.conversation.upsert({
    where: {
      userOneId_userTwoId_productId: {
        userOneId: minId,
        userTwoId: maxId,
        productId,
      },
    },
    create: {
      userOneId: minId,
      userTwoId: maxId,
      productId,
    },
    update: {}, // no-op: solo impediamo P2002 (atomicità)
  });
}
