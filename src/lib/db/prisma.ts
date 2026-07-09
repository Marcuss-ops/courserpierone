import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * PrismaClient ottimizzato per serverless (Vercel + Supabase pgBouncer).
 *
 * Connection Pooling:
 *   - DATABASE_URL = pooled connection (pgBouncer, port 6543)
 *     → Deve includere ?pgbouncer=true&connection_limit=20&pool_timeout=10
 *   - DIRECT_URL = direct connection (solo migrations, port 5432)
 *
 * Serverless best practices:
 *   - connection_limit=20 (bilanciato per carichi medi su Vercel)
 *   - pool_timeout=10 (timeout rapido per evitare hanging connections)
 *   - Logging: query + warn + error in dev, solo error in produzione
 */
const createPrismaClient = () =>
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { level: "query", emit: "stdout" },
            { level: "warn", emit: "stdout" },
            { level: "error", emit: "stdout" },
          ]
        : [{ level: "error", emit: "stdout" }],
  });

export const prisma = globalForPrisma.prisma || createPrismaClient();

// Previeni multiple istanze in dev (HMR)
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
