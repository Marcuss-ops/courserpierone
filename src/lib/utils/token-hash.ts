import crypto from "crypto";

/**
 * Hash a magic link token with SHA-256 before storing in the database.
 *
 * Principio di sicurezza: il token in chiaro viaggia nell'URL (email/link),
 * ma nel database salviamo solo l'hash. Se il DB venisse compromesso,
 * gli attaccanti non possono usare i token hash-ati per accedere.
 *
 * @param token - Il token in chiaro (es. "abc123...")
 * @returns L'hash SHA-256 in formato hex
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
