/**
 * GET /api/health
 *
 * Health check endpoint per monitoring e uptime check.
 * Verifica:
 *   - PostgreSQL (Prisma) — query leggera
 *   - Redis (Upstash) — ping
 *   - System — uptime, memoria, versione Node
 *
 * Usato da: Uptime Robot, Better Uptime, Vercel Health Checks, cron-job.org
 *
 * Response:
 *   200 OK — tutti i servizi OK
 *   503 Service Unavailable — uno o più servizi down
 *   500 Internal Server Error — errore imprevisto
 *
 * Cache: no-store (sempre fresco, mai in cache)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRedis } from "@/lib/redis";

// Force dynamic — non può essere statico (usa variabili runtime come memory, uptime)
export const dynamic = "force-dynamic";
// Node.js runtime required per process.memoryUsage(), process.uptime(), etc.
export const runtime = "nodejs";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  services: {
    database: { status: string; latencyMs: number };
    redis: { status: string; latencyMs: number };
  };
  system: {
    nodeVersion: string;
    memory: {
      rss: string;
      heapUsed: string;
      heapTotal: string;
    };
    platform: string;
  };
}

export async function GET() {
  const startTotal = Date.now();

  // ═══ Database Check ═══
  let dbStatus = "down";
  let dbLatency = 0;
  try {
    const startDb = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - startDb;
    dbStatus = "up";
  } catch (err) {
    console.error("[health] Database check failed:", err);
    dbStatus = "down";
  }

  // ═══ Redis Check ═══
  let redisStatus = "down";
  let redisLatency = 0;
  const redis = getRedis();
  if (redis) {
    try {
      const startRedis = Date.now();
      await redis.ping();
      redisLatency = Date.now() - startRedis;
      redisStatus = "up";
    } catch (err) {
      console.error("[health] Redis check failed:", err);
      redisStatus = "down";
    }
  } else {
    redisStatus = "not_configured";
  }

  // ═══ Determine Overall Status ═══
  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (dbStatus === "down") {
    overallStatus = "unhealthy";
  } else if (redisStatus === "down") {
    overallStatus = "degraded"; // Redis è opzionale, app funziona senza
  }

  // ═══ System Info ═══
  const memoryUsage = process.memoryUsage();
  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: {
        status: dbStatus,
        latencyMs: dbLatency,
      },
      redis: {
        status: redisStatus,
        latencyMs: redisLatency,
      },
    },
    system: {
      nodeVersion: process.version,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      },
      platform: process.platform,
    },
  };

  return NextResponse.json(health, {
    status: overallStatus === "unhealthy" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "X-Response-Time": `${Date.now() - startTotal}ms`,
    },
  });
}
