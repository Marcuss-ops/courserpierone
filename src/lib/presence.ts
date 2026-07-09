/**
 * presence.ts — Live Presence System (Redis)
 *
 * Traccia quali utenti sono online in tempo reale usando Redis.
 * Architettura:
 *   - SET + EXPIRE per heartbeat (utente → online con TTL di 60s)
 *   - GET per controllare se un utente è online
 *   - MGET per controlli bulk (più efficiente di pipeline via REST)
 *   - Graceful fallback: se Redis non è configurato, tutte le
 *     operazioni sono no-op e restituiscono valori di default safe.
 *
 * Pattern: Heartbeat ogni 30s dal client, TTL Redis di 60s.
 * Se un client smette di inviare heartbeat, dopo 60s l'utente
 * risulta offline automaticamente.
 *
 * Uso:
 *   // Client: invia heartbeat ogni 30s
 *   await fetch("/api/presence/heartbeat", { method: "POST" });
 *
 *   // Server: verifica se un utente è online
 *   const online = await isUserOnline(userId);
 */

import { getRedis } from "@/lib/redis";

export const PRESENCE_PREFIX = "presence:";
export const HEARTBEAT_TTL = 60; // secondi

/**
 * Registra un heartbeat per l'utente.
 * Da chiamare periodicamente (ogni 30s) dal client.
 * Imposta un TTL di 60s: se non rinnovato, l'utente risulta offline.
 */
export async function heartbeat(userId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(`${PRESENCE_PREFIX}${userId}`, Date.now().toString(), {
      ex: HEARTBEAT_TTL,
    });
  } catch {
    // Silently fail — presence is non-critical
  }
}

/**
 * Verifica se un utente è attualmente online.
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    const val = await r.get(`${PRESENCE_PREFIX}${userId}`);
    return val !== null && val !== undefined;
  } catch {
    return false;
  }
}

/**
 * Restituisce il timestamp dell'ultimo heartbeat di un utente.
 * Restituisce null se l'utente non è online.
 */
export async function getLastSeen(userId: string): Promise<number | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const val = await r.get(`${PRESENCE_PREFIX}${userId}`);
    if (!val) return null;
    return parseInt(val as string, 10);
  } catch {
    return null;
  }
}

/**
 * Verifica lo stato online di multipli utenti in una sola chiamata.
 * Usa MGET per efficienza (singola HTTP round-trip via REST).
 * Restituisce un Set di user ID online.
 */
export async function getOnlineUsers(userIds: string[]): Promise<Set<string>> {
  const r = getRedis();
  if (!r) return new Set();
  try {
    const keys = userIds.map((id) => `${PRESENCE_PREFIX}${id}`);
    const results = await r.mget<string[]>(...keys);
    const online = new Set<string>();
    userIds.forEach((id, i) => {
      if (results[i] !== null && results[i] !== undefined && results[i] !== "") {
        online.add(id);
      }
    });
    return online;
  } catch {
    return new Set();
  }
}

/**
 * Rimuove esplicitamente un utente dalla presenza (logout).
 */
export async function removePresence(userId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(`${PRESENCE_PREFIX}${userId}`);
  } catch {
    // Silently fail
  }
}
