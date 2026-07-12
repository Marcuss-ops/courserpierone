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
 */

import { NextResponse } from "next/server";
import {
  resolveMessagingPermission,
  type MessagingPermission,
  MessagingDenyReason,
} from "@/lib/messaging/resolve-message-permission";

export type AuthorizeDmInput = {
  actorId: string;
  targetId: string;
  productId: string;
};

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
  [MessagingDenyReason.NoCreatorForProduct]: {
    status: 409,
    error:
      "Prodotto non ancora associato a un creator. Esegui scripts/products/backfill-primary-creator.ts per migrare.",
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
