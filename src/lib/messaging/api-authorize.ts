/**
 * src/lib/messaging/api-authorize.ts
 *
 * Helper per le API route: traduce l'esito di resolveMessagingPermission
 * in una decisione HTTP coerente con il resto del codebase.
 *
 * Uso tipico nelle Route Handler:
 *
 *   const decision = await authorizeDmRequest({
 *     actorId: dbUser.id,
 *     targetId: withUserId,
 *     productId,
 *   });
 *   if (!decision.allowed) return decision.response; // NextResponse già pronto
 *
 * Phase 1.6 del piano DMs: tutte le route messages passano da qui invece di
 * reinventare i check sparsi.
 *
 * Fase 4 hardening (`20260712210000_creator_id_required_restrict`):
 * la colonna `Product.creatorId` è REQUIRED + FK Restrict a livello DB.
 * I 4 deny reasons raggiungibili del resolver sono mappati nella tabella
 * REASON_TO_STATUS qui sotto.
 */

import { NextResponse } from "next/server";
import {
  resolveMessagingPermission,
  type MessagingPermission,
  MessagingDenyReason,
} from "@/lib/messaging/resolve-message-permission";

export interface AuthorizeDmInput {
  actorId: string;
  targetId: string;
  productId: string;
}

export type AuthorizeDmDecision =
  | { allowed: true; permission: MessagingPermission; response?: never }
  | {
      allowed: false;
      permission: MessagingPermission;
      response: NextResponse;
    };

const REASON_TO_STATUS: Record<string, { status: number; error: string }> = {
  [MessagingDenyReason.SelfMessage]: {
    status: 400,
    error: "Non puoi inviare un messaggio a te stesso",
  },
  [MessagingDenyReason.ProductNotFound]: {
    status: 404,
    error: "Prodotto non trovato",
  },
  [MessagingDenyReason.NotCreatorStudentPair]: {
    status: 403,
    error:
      "DM non autorizzata: i due partecipanti non sono creator↔cliente su questo prodotto",
  },
  [MessagingDenyReason.NoCompletedOrderForStudent]: {
    status: 403,
    error:
      "DM non autorizzata: lo studente non ha un ordine completed per questo prodotto",
  },
  // PR 3 of MCR — canonical post-cutover deny reason. Attivo quando
  // USE_ACCESS_GRANT_RESOLVER=true. Convive con NoCompletedOrderForStudent
  // per la durata del rollout (entrambi i path sono attivi finché il flag
  // non è completamente rimosso in V2 cleanup). Vedi JSDoc in cima a
  // src/lib/messaging/resolve-message-permission.ts.
  [MessagingDenyReason.NoValidAccessGrant]: {
    status: 403,
    error:
      "DM non autorizzata: l'utente non ha un grant attivo per questo prodotto",
  },
};

/**
 * Risolve l'autorizzazione DM e ritorna un oggetto pronto per la route:
 *   - allowed: true → procedi con la logica di business
 *   - allowed: false → ritorna `decision.response` direttamente
 *
 * Non lancia eccezioni: l'errore è già codificato come NextResponse con
 * status code e body in italiano coerente con il resto dei messaggi API.
 */
export async function authorizeDmRequest(
  input: AuthorizeDmInput,
): Promise<AuthorizeDmDecision> {
  const permission = await resolveMessagingPermission(input);

  if (permission.allowed) {
    return { allowed: true, permission };
  }

  const reason = permission.reason ?? MessagingDenyReason.NotCreatorStudentPair;
  const mapped = REASON_TO_STATUS[reason] ?? {
    status: 403,
    error: "DM non autorizzata",
  };

  return {
    allowed: false,
    permission,
    response: NextResponse.json(
      { error: mapped.error, reason },
      { status: mapped.status },
    ),
  };
}
