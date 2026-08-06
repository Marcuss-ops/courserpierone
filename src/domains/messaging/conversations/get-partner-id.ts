/**
 * src/lib/messaging/get-partner-id.ts
 *
 * Phase 2.0 V2: DRY helper per derivare il partner (l'altro partecipante)
 * di una Conversation row dato il viewer. Centralizza il pattern
 * ripetuto in:
 *   - `src/app/api/messages/stream/route.ts` (SSE auth wiring)
 *   - `~~server.ts~~ (WS upgrade handler — C3 removed)`
 *
 * Convenzione di coppia canonica (Fase 1.3 / schema Conversation):
 *   - `conversation.userOneId = min(userId, otherUserId)` (lessicografico)
 *   - `conversation.userTwoId = max(...)`
 * Il viewer (meId) può essere indifferentemente userOneId o userTwoId,
 * quindi il partner è "l'altro":
 *   - `meId === userOneId` → partner = userTwoId
 *   - `meId === userTwoId` → partner = userOneId
 *
 * Edge case / invariante (asserted in tests):
 *   Passare un `meId` che NON appartiene alla coppia (es. uno user
 *   random) è un caller bug (la Conversation membership check dovrebbe
 *   aver già escluso questo caso a monte). Il helper non lancia in
 *   V1 ma ritorna semplicemente `userOneId` come fallback del
 *   branch ternario (`else` del check `userOneId === meId`). Per
 *   safety, si potrebbe lanciare in V2 (assertion-style); per ora è
 *   tollerante perché il chiamante upstream (SSE / WS upgrade) ha già
 *   effettuato la verifica di membership prima di invocare questo helper.
 *
 * Generic on `C` per restrizione minima: il chiamante può passare il
 * Conversation intero, oppure un subset (es. solo userOneId + userTwoId),
 * mantenendo full type inference.
 */
export function getPartnerId<
  C extends { userOneId: string; userTwoId: string },
>(conversation: C, meId: string): string {
  return conversation.userOneId === meId
    ? conversation.userTwoId
    : conversation.userOneId;
}
